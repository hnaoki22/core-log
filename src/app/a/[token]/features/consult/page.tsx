"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useFeatures } from "@/lib/use-features";
import Link from "next/link";

type Intervention = {
  id: string;
  date: string;
  type: string;
  description: string;
  participantNames: string[];
  outcome: string;
};

type ApiResponse = {
  interventions?: Intervention[];
  error?: string;
  success?: boolean;
};

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
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState(INTERVENTION_TYPES[0]);
  const [formDescription, setFormDescription] = useState("");
  const [formParticipants, setFormParticipants] = useState("");
  const [formOutcome, setFormOutcome] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Load feature flag
  useEffect(() => {
    if (!loaded) return;
    if (!isOn("tier-g.consultIntervention")) {
      router.push(`/a/${token}`);
    }
  }, [loaded, isOn, token, router]);

  // Fetch interventions
  useEffect(() => {
    async function fetchInterventions() {
      try {
        const res = await fetch(`/api/features/consult-intervention?token=${token}`);
        if (!res.ok) throw new Error("failed to fetch");
        const data = (await res.json()) as ApiResponse;
        setInterventions(data.interventions || []);
      } catch {
        setMessage({ type: "err", text: "読み込みに失敗しました" });
      } finally {
        setLoading(false);
      }
    }
    if (token) fetchInterventions();
  }, [token]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formDescription.trim() || !formParticipants.trim()) {
      setMessage({ type: "err", text: "説明と参加者は必須です" });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/features/consult-intervention?token=${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          type: formType,
          description: formDescription,
          participantNames: formParticipants
            .split(",")
            .map((n) => n.trim())
            .filter(Boolean),
          outcome: formOutcome,
        }),
      });
      if (!res.ok) throw new Error("failed to add");
      const newData = (await res.json()) as ApiResponse;
      setInterventions(newData.interventions || []);
      setFormDescription("");
      setFormParticipants("");
      setFormOutcome("");
      setFormType(INTERVENTION_TYPES[0]);
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
                  参加者（カンマ区切り）
                </label>
                <input
                  type="text"
                  placeholder="山田太郎, 田中花子"
                  value={formParticipants}
                  onChange={(e) => setFormParticipants(e.target.value)}
                  className="w-full px-3 py-2 border border-[#E0D9CE] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A1A2E] focus:ring-offset-1"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#5B5560] uppercase tracking-wide mb-2">
                  成果
                </label>
                <textarea
                  placeholder="この介入の成果や学び..."
                  value={formOutcome}
                  onChange={(e) => setFormOutcome(e.target.value)}
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
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-1 bg-[#1A1A2E] text-white text-xs font-medium rounded">
                        {intervention.type}
                      </span>
                      <time className="text-xs text-[#8B8489]">
                        {new Date(intervention.date).toLocaleDateString("ja-JP")}
                      </time>
                    </div>
                    <p className="text-sm text-[#5B5560]">{intervention.description}</p>
                  </div>
                </div>

                {intervention.participantNames.length > 0 && (
                  <div className="pt-2 border-t border-[#EFE8DD]">
                    <p className="text-xs font-semibold text-[#5B5560] mb-1">参加者</p>
                    <div className="flex flex-wrap gap-1">
                      {intervention.participantNames.map((name) => (
                        <span key={name} className="px-2 py-1 bg-[#EFE8DD] text-[#5B5560] text-xs rounded">
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {intervention.outcome && (
                  <div className="pt-2 border-t border-[#EFE8DD]">
                    <p className="text-xs font-semibold text-[#5B5560] mb-1">成果</p>
                    <p className="text-xs text-[#5B5560]">{intervention.outcome}</p>
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
