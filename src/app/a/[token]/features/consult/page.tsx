"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import { useFeatures } from "@/lib/use-features";
import { getTodayJST } from "@/lib/date-utils";
import Link from "next/link";

// GET /api/features/consult-intervention の DTO と 1:1
type Intervention = {
  id: string;
  date: string;
  consultantName: string;
  interventionType: string;
  description: string;
  participantIds: string[];
  participantNames: string[];
  durationMinutes: number;
  notes: string;
};

type ApiResponse = {
  interventions?: Intervention[];
  error?: string;
  success?: boolean;
};

type ParticipantOption = { id: string; name: string };

// ダッシュボードのテナントセレクタで選択中のテナント slug は
// リンクのクエリ（?tenant=slug）で引き継がれる。API 呼び出し全てに伝搬する
//（付けないと super-admin の書き込みがホームテナントに落ちる — Trap 3）。
function tenantSlugFromLocation(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("tenant") || "";
}

const INTERVENTION_TYPES = [
  "1on1参加",
  "研修実施",
  "個別相談",
  "フィードバック",
  "チームビルディング",
  "その他",
];

export default function ConsultInterventionPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const { isOn, loaded } = useFeatures();

  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [participants, setParticipants] = useState<ParticipantOption[]>([]);
  const [participantsError, setParticipantsError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState(INTERVENTION_TYPES[0]);
  const [formDate, setFormDate] = useState("");
  const [formConsultantName, setFormConsultantName] = useState("");
  const [formDuration, setFormDuration] = useState("60");
  const [formDescription, setFormDescription] = useState("");
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);
  const [formNotes, setFormNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Load feature flag
  // useFeatures はトークンのホームテナントのフラグを返す。?tenant= で別テナントを
  // 見ている場合の有効/無効は API が TARGET テナント基準で判定する（403）ため、
  // クライアント側リダイレクトは ?tenant= なしの時だけ行う。
  useEffect(() => {
    if (!loaded) return;
    if (tenantSlugFromLocation()) return;
    if (!isOn("tier-g.consultIntervention")) {
      router.push(`/a/${token}`);
    }
  }, [loaded, isOn, token, router]);

  // 日付の初期値は JST の業務日（hydration ずれを避けるため mount 後に設定）
  useEffect(() => {
    setFormDate(getTodayJST());
  }, []);

  const loadInterventions = useCallback(async () => {
    const slug = tenantSlugFromLocation();
    const tenantParam = slug ? `&tenant=${encodeURIComponent(slug)}` : "";
    const res = await fetch(`/api/features/consult-intervention?token=${token}${tenantParam}`);
    const data = (await res.json()) as ApiResponse;
    if (!res.ok) throw new Error(data.error || "failed to fetch");
    setInterventions(data.interventions || []);
  }, [token]);

  // Fetch interventions
  useEffect(() => {
    if (!token) return;
    loadInterventions()
      .catch((e: unknown) => {
        const text =
          e instanceof Error && /not enabled/i.test(e.message)
            ? "この機能は選択中のテナントで有効化されていません"
            : "読み込みに失敗しました";
        setMessage({ type: "err", text });
      })
      .finally(() => setLoading(false));
  }, [token, loadInterventions]);

  // 参加者ピッカー用の一覧（?tenant= を伝搬して選択中テナントの参加者を出す）。
  // 自分のマネージャー行が見つかれば記録者名の初期値にする。
  useEffect(() => {
    if (!token) return;
    async function fetchParticipants() {
      try {
        const slug = tenantSlugFromLocation();
        const tenantParam = slug ? `&tenant=${encodeURIComponent(slug)}` : "";
        const res = await fetch(`/api/admin?token=${token}${tenantParam}`);
        if (!res.ok) throw new Error("failed to fetch participants");
        const data = (await res.json()) as {
          participants?: { id: string; name: string }[];
          managers?: { token: string; name: string }[];
        };
        setParticipants((data.participants || []).map((p) => ({ id: p.id, name: p.name })));
        const self = (data.managers || []).find((m) => m.token === token);
        if (self) {
          setFormConsultantName((prev) => prev || self.name);
        }
      } catch {
        setParticipantsError(true);
      }
    }
    fetchParticipants();
  }, [token]);

  const toggleParticipant = (id: string) => {
    setSelectedParticipantIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const durationMinutes = parseInt(formDuration, 10);
    if (
      !formDescription.trim() ||
      !formConsultantName.trim() ||
      !formDate ||
      selectedParticipantIds.length === 0
    ) {
      setMessage({ type: "err", text: "日付・記録者・説明・参加者は必須です" });
      return;
    }
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      setMessage({ type: "err", text: "所要時間は1分以上で入力してください" });
      return;
    }

    setSubmitting(true);
    try {
      const slug = tenantSlugFromLocation();
      const tenantParam = slug ? `?tenant=${encodeURIComponent(slug)}` : "";
      const res = await fetch(`/api/features/consult-intervention${tenantParam}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          consultantName: formConsultantName.trim(),
          interventionType: formType,
          date: formDate,
          participantIds: selectedParticipantIds,
          description: formDescription,
          durationMinutes,
          notes: formNotes,
        }),
      });
      const result = (await res.json()) as ApiResponse;
      if (!res.ok) {
        setMessage({ type: "err", text: result.error || "追加に失敗しました" });
        return;
      }
      await loadInterventions();
      setFormDescription("");
      setSelectedParticipantIds([]);
      setFormNotes("");
      setFormType(INTERVENTION_TYPES[0]);
      setFormDate(getTodayJST());
      setShowForm(false);
      setMessage({ type: "ok", text: "介入記録を追加しました" });
    } catch {
      setMessage({ type: "err", text: "追加に失敗しました" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F0EB] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-[3px] border-[#1A1A2E] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[#8B8489] text-sm">読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F0EB]">
      {/* Header */}
      <header className="gradient-header-admin text-white px-5 pt-12 pb-6">
        <div className="max-w-2xl mx-auto relative z-10">
          <Link
            href={`/a/${token}`}
            className="inline-flex items-center gap-1 text-[#C9BDAE] hover:text-white text-sm mb-3 transition-colors"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
            管理画面に戻る
          </Link>
          <h1 className="text-xl font-semibold tracking-tight">コンサルタント介入ログ</h1>
          <p className="text-xs text-[#C9BDAE] mt-1">コーチングと支援活動の記録</p>
        </div>
      </header>

      <main className="px-5 py-6 space-y-5 max-w-2xl mx-auto">
        {/* Message */}
        {message && (
          <div
            className={`px-4 py-3 rounded-lg text-sm ${
              message.type === "ok"
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Add Button */}
        <button
          onClick={() => setShowForm(!showForm)}
          className="w-full btn-primary text-sm py-2"
        >
          {showForm ? "キャンセル" : "介入を記録"}
        </button>

        {/* Add form */}
        {showForm && (
          <div className="card p-5 space-y-4 border-2 border-[#1A1A2E]">
            <h3 className="text-sm font-semibold text-[#1A1A2E]">新規介入記録</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#5B5560] uppercase tracking-wide mb-2">
                  種類
                </label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value)}
                  className="w-full px-3 py-2 border border-[#E0D9CE] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A1A2E] focus:ring-offset-1"
                >
                  {INTERVENTION_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#5B5560] uppercase tracking-wide mb-2">
                    日付
                  </label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full px-3 py-2 border border-[#E0D9CE] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A1A2E] focus:ring-offset-1"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#5B5560] uppercase tracking-wide mb-2">
                    所要時間（分）
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={formDuration}
                    onChange={(e) => setFormDuration(e.target.value)}
                    className="w-full px-3 py-2 border border-[#E0D9CE] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A1A2E] focus:ring-offset-1"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#5B5560] uppercase tracking-wide mb-2">
                  記録者（コンサルタント名）
                </label>
                <input
                  type="text"
                  placeholder="担当コンサルタントの名前"
                  value={formConsultantName}
                  onChange={(e) => setFormConsultantName(e.target.value)}
                  className="w-full px-3 py-2 border border-[#E0D9CE] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A1A2E] focus:ring-offset-1"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#5B5560] uppercase tracking-wide mb-2">
                  説明
                </label>
                <textarea
                  placeholder="介入の内容と目的..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-[#E0D9CE] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A1A2E] focus:ring-offset-1 resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#5B5560] uppercase tracking-wide mb-2">
                  参加者（タップで選択）
                </label>
                {participantsError ? (
                  <p className="text-xs text-red-600">
                    参加者一覧を取得できませんでした。再読み込みしてください。
                  </p>
                ) : participants.length === 0 ? (
                  <p className="text-xs text-[#8B8489]">
                    選択できる参加者がいません
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {participants.map((p) => {
                      const selected = selectedParticipantIds.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => toggleParticipant(p.id)}
                          aria-pressed={selected}
                          className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                            selected
                              ? "bg-[#1A1A2E] text-white border-[#1A1A2E]"
                              : "bg-white text-[#5B5560] border-[#E0D9CE] hover:border-[#1A1A2E]"
                          }`}
                        >
                          {p.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#5B5560] uppercase tracking-wide mb-2">
                  成果・メモ（任意）
                </label>
                <textarea
                  placeholder="この介入の成果や学び..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-[#E0D9CE] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A1A2E] focus:ring-offset-1 resize-none"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full btn-primary text-sm py-2 disabled:opacity-50"
              >
                {submitting ? "記録中..." : "記録"}
              </button>
            </form>
          </div>
        )}

        {/* Timeline */}
        {interventions.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-[#8B8489] text-sm">介入記録がまだありません</p>
          </div>
        ) : (
          <div className="space-y-3">
            {interventions.map((intervention) => (
              <div key={intervention.id} className="card p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="px-2 py-1 bg-[#1A1A2E] text-white text-xs font-medium rounded">
                        {intervention.interventionType}
                      </span>
                      <time className="text-xs text-[#8B8489]">
                        {new Date(intervention.date).toLocaleDateString("ja-JP")}
                      </time>
                      {intervention.durationMinutes > 0 && (
                        <span className="text-xs text-[#8B8489] whitespace-nowrap">
                          {intervention.durationMinutes}分
                        </span>
                      )}
                      {intervention.consultantName && (
                        <span className="text-xs text-[#8B8489] whitespace-nowrap">
                          記録者: {intervention.consultantName}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-[#5B5560]">{intervention.description}</p>
                  </div>
                </div>

                {intervention.participantNames.length > 0 && (
                  <div className="pt-2 border-t border-[#EFE8DD]">
                    <p className="text-xs font-semibold text-[#5B5560] mb-1">参加者</p>
                    <div className="flex flex-wrap gap-1">
                      {intervention.participantNames.map((name, i) => (
                        <span key={`${intervention.id}-${i}`} className="px-2 py-1 bg-[#EFE8DD] text-[#5B5560] text-xs rounded">
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {intervention.notes && (
                  <div className="pt-2 border-t border-[#EFE8DD]">
                    <p className="text-xs font-semibold text-[#5B5560] mb-1">成果・メモ</p>
                    <p className="text-xs text-[#5B5560]">{intervention.notes}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
