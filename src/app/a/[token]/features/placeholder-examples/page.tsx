"use client";

import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import Link from "next/link";

type PlaceholderExample = {
  text: string;
  source: string;
};

type ExampleSet = {
  phase: number | "universal";
  type: "morning" | "evening";
  examples: PlaceholderExample[];
};

type StoreData = {
  approved: ExampleSet[];
  draft: ExampleSet[];
  updatedAt: string | null;
  generationContext?: string;
};

type TenantOption = {
  id: string;
  slug: string;
  name: string;
  companyName?: string;
};

export default function PlaceholderExamplesAdminPage() {
  const params = useParams();
  const token = params.token as string;

  const [storeData, setStoreData] = useState<StoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  // Generation form
  const [mvv, setMvv] = useState("");
  const [courseBooks, setCourseBooks] = useState("");
  const [dojoPhase, setDojoPhase] = useState<string>("1");
  const [count, setCount] = useState(7);

  // Default examples (hardcoded)
  const [defaults, setDefaults] = useState<ExampleSet[]>([]);
  const [showDefaults, setShowDefaults] = useState(false);

  // Tenant state
  const [tenantSlug, setTenantSlug] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [allTenants, setAllTenants] = useState<TenantOption[]>([]);

  // Editing state
  const [editingSet, setEditingSet] = useState<{
    source: "draft" | "approved";
    setIndex: number;
    exampleIndex: number;
    text: string;
    source_label: string;
  } | null>(null);

  useEffect(() => {
    loadData();
  }, [token]);

  // Build API URL with tenant param
  function apiUrl(path: string): string {
    const base = `${path}?token=${token}`;
    if (tenantSlug) return `${base}&tenant=${tenantSlug}`;
    // On first load, check URL for tenant param
    if (typeof window !== "undefined") {
      const urlTenant = new URL(window.location.href).searchParams.get("tenant");
      if (urlTenant) return `${base}&tenant=${urlTenant}`;
    }
    return base;
  }

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/admin/placeholder-examples"));
      if (res.ok) {
        const json = await res.json();
        setStoreData(json.data);
        setDefaults(json.defaults ?? []);
        setTenantSlug(json.tenantSlug ?? null);
        setTenantName(json.tenantName ?? null);
        setIsSuperAdmin(!!json.isSuperAdmin);
        setAllTenants(json.allTenants ?? []);
      } else {
        setMessage({ type: "err", text: "データの読み込みに失敗しました" });
      }
    } catch {
      setMessage({ type: "err", text: "通信エラー" });
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    if (!mvv.trim() || !courseBooks.trim()) {
      setMessage({
        type: "err",
        text: "MVVと課題図書情報は必須です",
      });
      return;
    }
    setGenerating(true);
    setMessage(null);
    try {
      const res = await fetch(
        apiUrl("/api/admin/placeholder-examples/generate"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            mvv: mvv.trim(),
            courseBooks: courseBooks.trim(),
            dojoPhase: dojoPhase === "universal" ? null : Number(dojoPhase),
            count,
          }),
        }
      );
      const json = await res.json();
      if (json.success) {
        setMessage({
          type: "ok",
          text: `AI生成完了: ${json.summary}`,
        });
        await loadData();
      } else {
        setMessage({
          type: "err",
          text: json.error || "生成に失敗しました",
        });
      }
    } catch {
      setMessage({ type: "err", text: "通信エラー" });
    } finally {
      setGenerating(false);
    }
  }

  async function handleApprove() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(
        apiUrl("/api/admin/placeholder-examples"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, action: "approve" }),
        }
      );
      const json = await res.json();
      if (json.success) {
        setMessage({ type: "ok", text: "ドラフトを承認しました" });
        await loadData();
      } else {
        setMessage({ type: "err", text: json.error || "承認に失敗しました" });
      }
    } catch {
      setMessage({ type: "err", text: "通信エラー" });
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    if (!confirm("カスタム例示を全て削除しますか？デフォルトの例示に戻ります。")) return;
    setSaving(true);
    try {
      const res = await fetch(
        apiUrl("/api/admin/placeholder-examples"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, action: "clear" }),
        }
      );
      if ((await res.json()).success) {
        setMessage({ type: "ok", text: "カスタム例示を削除しました" });
        await loadData();
      }
    } catch {
      setMessage({ type: "err", text: "通信エラー" });
    } finally {
      setSaving(false);
    }
  }

  function startEdit(
    source: "draft" | "approved",
    setIndex: number,
    exampleIndex: number,
    example: PlaceholderExample
  ) {
    setEditingSet({
      source,
      setIndex,
      exampleIndex,
      text: example.text,
      source_label: example.source,
    });
  }

  async function saveEdit() {
    if (!editingSet || !storeData) return;
    const { source, setIndex, exampleIndex, text, source_label } = editingSet;

    const sets = source === "draft" ? [...storeData.draft] : [...storeData.approved];
    const set = { ...sets[setIndex] };
    const examples = [...set.examples];
    examples[exampleIndex] = { text, source: source_label };
    set.examples = examples;
    sets[setIndex] = set;

    setSaving(true);
    try {
      const action = source === "draft" ? "save_draft" : "save_approved";
      const body: Record<string, unknown> = { token, action };
      if (source === "draft") body.draft = sets;
      else body.approved = sets;

      const res = await fetch(
        apiUrl("/api/admin/placeholder-examples"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if ((await res.json()).success) {
        setMessage({ type: "ok", text: "保存しました" });
        setEditingSet(null);
        await loadData();
      }
    } catch {
      setMessage({ type: "err", text: "保存に失敗しました" });
    } finally {
      setSaving(false);
    }
  }

  function deleteExample(source: "draft" | "approved", setIndex: number, exampleIndex: number) {
    if (!storeData) return;
    const sets = source === "draft" ? [...storeData.draft] : [...storeData.approved];
    const set = { ...sets[setIndex] };
    set.examples = set.examples.filter((_, i) => i !== exampleIndex);
    sets[setIndex] = set;

    const action = source === "draft" ? "save_draft" : "save_approved";
    const body: Record<string, unknown> = { token, action };
    if (source === "draft") body.draft = sets;
    else body.approved = sets;

    fetch(apiUrl("/api/admin/placeholder-examples"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(() => loadData());
  }

  function phaseLabel(phase: number | "universal"): string {
    if (phase === "universal") return "全道場共通";
    return `道場${phase}`;
  }

  function typeLabel(type: "morning" | "evening"): string {
    return type === "morning" ? "朝の意図" : "本日の振り返り";
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F0EB] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#8B1A2B]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F0EB]">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link
              href={`/a/${token}`}
              className="text-sm text-[#8B1A2B] hover:underline mb-2 inline-block"
            >
              ← ダッシュボードに戻る
            </Link>
            <h1 className="text-2xl font-bold text-[#1A1A2E]">
              プレースホルダー例示管理
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              AI生成でテナント別の朝の意図・振り返り例示をカスタマイズ
            </p>
          </div>
          {/* Tenant switcher */}
          <div className="text-right">
            {isSuperAdmin && allTenants.length > 1 ? (
              <select
                value={tenantSlug ?? ""}
                onChange={(e) => {
                  const slug = e.target.value;
                  const url = new URL(window.location.href);
                  if (slug) url.searchParams.set("tenant", slug);
                  else url.searchParams.delete("tenant");
                  window.location.href = url.toString();
                }}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-[#8B1A2B]/20 focus:border-[#8B1A2B]"
              >
                {allTenants.map((t) => (
                  <option key={t.id} value={t.slug}>
                    {t.name} ({t.slug})
                  </option>
                ))}
              </select>
            ) : tenantName ? (
              <span className="text-sm text-gray-600">
                編集中のテナント: <strong className="text-[#1A1A2E]">{tenantName}</strong>
              </span>
            ) : null}
          </div>
        </div>

        {/* Messages */}
        {message && (
          <div
            className={`mb-4 p-3 rounded-lg text-sm ${
              message.type === "ok"
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                : "bg-red-50 text-red-800 border border-red-200"
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Generation Form */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-bold text-[#1A1A2E] mb-4">
            AI例示生成
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            クライアントのMVVと課題図書情報をAIに読み込ませ、
            COREグラウンドルールに基づいた例示を自動生成します。
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ミッション・ビジョン・バリュー (MVV)
              </label>
              <textarea
                value={mvv}
                onChange={(e) => setMvv(e.target.value)}
                placeholder="クライアント企業のミッション、ビジョン、バリューを入力してください"
                className="w-full border border-gray-300 rounded-lg p-3 text-sm min-h-[100px] resize-none focus:ring-2 focus:ring-[#8B1A2B]/20 focus:border-[#8B1A2B]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                課題図書・教材情報
              </label>
              <textarea
                value={courseBooks}
                onChange={(e) => setCourseBooks(e.target.value)}
                placeholder={"例：\n- 7つの習慣（スティーブン・コヴィー）: 主体性、終わりを思い描く、重要事項を優先\n- イシューからはじめよ（安宅和人）: イシュー度×解の質、犬の道"}
                className="w-full border border-gray-300 rounded-lg p-3 text-sm min-h-[100px] resize-none focus:ring-2 focus:ring-[#8B1A2B]/20 focus:border-[#8B1A2B]"
              />
            </div>

            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  対象道場ステージ
                </label>
                <select
                  value={dojoPhase}
                  onChange={(e) => setDojoPhase(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-[#8B1A2B]/20 focus:border-[#8B1A2B]"
                >
                  {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                    <option key={n} value={String(n)}>
                      道場{n}
                    </option>
                  ))}
                  <option value="universal">全道場共通（ユニバーサル）</option>
                </select>
              </div>
              <div className="w-32">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  生成数（各）
                </label>
                <select
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-[#8B1A2B]/20 focus:border-[#8B1A2B]"
                >
                  {[3, 5, 7, 10].map((n) => (
                    <option key={n} value={n}>
                      {n}個
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={generating || !mvv.trim() || !courseBooks.trim()}
              className="w-full py-3 rounded-lg font-medium text-white bg-[#8B1A2B] hover:bg-[#6D1522] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {generating ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  AI生成中...
                </span>
              ) : (
                "AIで例示を生成する"
              )}
            </button>
          </div>
        </div>

        {/* Draft Section */}
        {storeData?.draft && storeData.draft.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-amber-200 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-[#1A1A2E]">
                  レビュー待ち（ドラフト）
                </h2>
                <p className="text-sm text-amber-700 mt-1">
                  AI生成済み。確認・編集後、承認すると本番に反映されます。
                </p>
              </div>
              <button
                onClick={handleApprove}
                disabled={saving}
                className="px-4 py-2 rounded-lg font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {saving ? "保存中..." : "全て承認する"}
              </button>
            </div>

            {storeData.draft.map((set, setIdx) => (
              <div key={`draft-${setIdx}`} className="mb-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-xs">
                    {phaseLabel(set.phase)}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-xs">
                    {typeLabel(set.type)}
                  </span>
                  <span className="text-gray-400 text-xs">
                    {set.examples.length}件
                  </span>
                </h3>
                <div className="space-y-2">
                  {set.examples.map((ex, exIdx) => (
                    <div
                      key={exIdx}
                      className="flex items-start gap-2 p-3 bg-amber-50/50 rounded-lg border border-amber-100"
                    >
                      {editingSet?.source === "draft" &&
                      editingSet.setIndex === setIdx &&
                      editingSet.exampleIndex === exIdx ? (
                        <div className="flex-1 space-y-2">
                          <textarea
                            value={editingSet.text}
                            onChange={(e) =>
                              setEditingSet({
                                ...editingSet,
                                text: e.target.value,
                              })
                            }
                            className="w-full border border-gray-300 rounded p-2 text-sm min-h-[60px] resize-none"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={saveEdit}
                              className="px-3 py-1 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700"
                            >
                              保存
                            </button>
                            <button
                              onClick={() => setEditingSet(null)}
                              className="px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                            >
                              キャンセル
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex-1">
                            <p className="text-sm text-gray-800">{ex.text}</p>
                            <p className="text-xs text-gray-400 mt-1">
                              {ex.source}
                            </p>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button
                              onClick={() =>
                                startEdit("draft", setIdx, exIdx, ex)
                              }
                              className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded"
                            >
                              編集
                            </button>
                            <button
                              onClick={() =>
                                deleteExample("draft", setIdx, exIdx)
                              }
                              className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
                            >
                              削除
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Approved Section */}
        {storeData?.approved && storeData.approved.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-emerald-200 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-[#1A1A2E]">
                  承認済み（本番適用中）
                </h2>
                <p className="text-sm text-emerald-700 mt-1">
                  参加者のフォームにプレースホルダーとして表示されています。
                </p>
                {storeData.updatedAt && (
                  <p className="text-xs text-gray-400 mt-1">
                    最終更新:{" "}
                    {new Date(storeData.updatedAt).toLocaleString("ja-JP")}
                  </p>
                )}
              </div>
              <button
                onClick={handleClear}
                disabled={saving}
                className="px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
              >
                カスタム例示を削除
              </button>
            </div>

            {storeData.approved.map((set, setIdx) => (
              <div key={`approved-${setIdx}`} className="mb-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-xs">
                    {phaseLabel(set.phase)}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-xs">
                    {typeLabel(set.type)}
                  </span>
                  <span className="text-gray-400 text-xs">
                    {set.examples.length}件
                  </span>
                </h3>
                <div className="space-y-2">
                  {set.examples.map((ex, exIdx) => (
                    <div
                      key={exIdx}
                      className="flex items-start gap-2 p-3 bg-emerald-50/50 rounded-lg border border-emerald-100"
                    >
                      {editingSet?.source === "approved" &&
                      editingSet.setIndex === setIdx &&
                      editingSet.exampleIndex === exIdx ? (
                        <div className="flex-1 space-y-2">
                          <textarea
                            value={editingSet.text}
                            onChange={(e) =>
                              setEditingSet({
                                ...editingSet,
                                text: e.target.value,
                              })
                            }
                            className="w-full border border-gray-300 rounded p-2 text-sm min-h-[60px] resize-none"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={saveEdit}
                              className="px-3 py-1 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700"
                            >
                              保存
                            </button>
                            <button
                              onClick={() => setEditingSet(null)}
                              className="px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                            >
                              キャンセル
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex-1">
                            <p className="text-sm text-gray-800">{ex.text}</p>
                            <p className="text-xs text-gray-400 mt-1">
                              {ex.source}
                            </p>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button
                              onClick={() =>
                                startEdit("approved", setIdx, exIdx, ex)
                              }
                              className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded"
                            >
                              編集
                            </button>
                            <button
                              onClick={() =>
                                deleteExample("approved", setIdx, exIdx)
                              }
                              className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
                            >
                              削除
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {(!storeData?.approved || storeData.approved.length === 0) &&
          (!storeData?.draft || storeData.draft.length === 0) && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
              <p className="text-gray-500">
                カスタム例示はまだ設定されていません。
              </p>
              <p className="text-sm text-gray-400 mt-2">
                上のフォームからAI生成を実行するか、デフォルトの例示（ハードコード）が使用されます。
              </p>
            </div>
          )}

        {/* Default examples reference */}
        {defaults.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-300 p-6 mb-6">
            <button
              onClick={() => setShowDefaults(!showDefaults)}
              className="flex items-center justify-between w-full text-left"
            >
              <div>
                <h2 className="text-lg font-bold text-[#1A1A2E]">
                  デフォルト例示（ハードコード）
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  カスタム例示が未設定のテナントに表示される例示です。
                  {storeData?.approved && storeData.approved.length > 0 && (
                    <span className="text-emerald-600 ml-1">
                      このテナントはカスタム例示で上書き済みです。
                    </span>
                  )}
                </p>
              </div>
              <span className="text-gray-400 text-xl shrink-0 ml-4">
                {showDefaults ? "▲" : "▼"}
              </span>
            </button>

            {showDefaults && (
              <div className="mt-4 space-y-4">
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800">
                    デフォルト例示はCOREグラウンドルール（C/O/R/E）に基づく汎用的な内容です。
                    テナント固有の課題図書に紐づく例示は、上のAI生成機能でカスタム例示として設定してください。
                  </p>
                </div>
                {defaults.map((set, setIdx) => (
                  <div key={`default-${setIdx}`}>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-gray-200 text-gray-700 text-xs">
                        {phaseLabel(set.phase)}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-600 text-xs">
                        {typeLabel(set.type)}
                      </span>
                      <span className="text-gray-400 text-xs">
                        {set.examples.length}件
                      </span>
                    </h3>
                    <div className="space-y-1">
                      {set.examples.map((ex, exIdx) => (
                        <div
                          key={exIdx}
                          className="p-2 bg-gray-50 rounded border border-gray-100 flex items-start gap-2"
                        >
                          <div className="flex-1">
                            <p className="text-sm text-gray-700">{ex.text}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {ex.source}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
