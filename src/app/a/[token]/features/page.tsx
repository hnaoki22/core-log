"use client";

import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import Link from "next/link";

type FlagCategory =
  | "core" | "existing"
  | "tier-s" | "tier-a" | "tier-b" | "tier-c" | "tier-d" | "tier-e" | "tier-f" | "tier-g";

type FeatureFlag = {
  key: string;
  label: string;
  description: string;
  category: FlagCategory;
  defaultEnabled: boolean;
  phase1Enabled: boolean;
  implemented: boolean;
  dependencies?: string[];
  recommendedPhase?: 1 | 2 | 3;
};

type Preset = { id: string; label: string; description: string };

type ApiData = {
  clientId: string;
  catalog: FeatureFlag[];
  presets: Preset[];
  flags: Record<string, boolean>;
  notionConfigured: boolean;
};

const CATEGORY_META: Record<FlagCategory, { label: string; color: string; desc: string }> = {
  "core":     { label: "コア機能",              color: "bg-gray-100 text-gray-700 border-gray-300",   desc: "CORE Logの中核。基本的に常時ON推奨" },
  "existing": { label: "既存機能",              color: "bg-blue-50 text-blue-700 border-blue-200",    desc: "現在実装済みの機能群" },
  "tier-s":   { label: "Tier S: 差別化機能",    color: "bg-orange-50 text-orange-700 border-orange-200", desc: "反芻検知・持論化等、CORE Logの独自性を生む機能" },
  "tier-a":   { label: "Tier A: マネージャー支援", color: "bg-indigo-50 text-indigo-700 border-indigo-200", desc: "Safety Net層。1on1ブリーフィング・離職予兆等" },
  "tier-b":   { label: "Tier B: 組織学習",      color: "bg-emerald-50 text-emerald-700 border-emerald-200", desc: "Cultural Engine層。AAR・組織ナレッジ等" },
  "tier-c":   { label: "Tier C: アンラーン",     color: "bg-amber-50 text-amber-700 border-amber-200", desc: "コンピテンシートラップ脱却・リーダー育成" },
  "tier-d":   { label: "Tier D: PsyCap",       color: "bg-pink-50 text-pink-700 border-pink-200",    desc: "心理的資本(HERO)の育成" },
  "tier-e":   { label: "Tier E: UX強化",        color: "bg-purple-50 text-purple-700 border-purple-200", desc: "マイクロリチュアル・音声入力等" },
  "tier-f":   { label: "Tier F: ROI証明",       color: "bg-teal-50 text-teal-700 border-teal-200",    desc: "成長ROI・導入効果レポート" },
  "tier-g":   { label: "Tier G: ビジネスモデル", color: "bg-rose-50 text-rose-700 border-rose-200",    desc: "マルチテナント・コンサル連携" },
};

const CATEGORY_ORDER: FlagCategory[] = [
  "core", "existing",
  "tier-s", "tier-a", "tier-b", "tier-c", "tier-d", "tier-e", "tier-f", "tier-g",
];

export default function FeatureFlagsAdminPage() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<ApiData | null>(null);
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/admin/features?token=${token}`);
        if (!res.ok) throw new Error("load failed");
        const d = (await res.json()) as ApiData;
        setData(d);
        setFlags(d.flags);
      } catch {
        setMessage({ type: "err", text: "読み込みに失敗しました。管理者権限を確認してください。" });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token]);

  const toggleFlag = (key: string) => {
    const flag = data?.catalog.find((f) => f.key === key);
    if (!flag || !flag.implemented) return;
    setFlags((prev) => ({ ...prev, [key]: !prev[key] }));
    setDirty(true);
    setMessage(null);
  };

  const applyPreset = async (presetId: string) => {
    if (!confirm(`プリセット「${data?.presets.find(p => p.id === presetId)?.label}」を適用しますか?\n現在の設定は上書きされます。`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/features?token=${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presetId }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "save failed");
      setFlags(result.flags);
      setDirty(false);
      setMessage({ type: "ok", text: "プリセットを適用し保存しました" });
    } catch (e) {
      setMessage({ type: "err", text: `保存失敗: ${(e as Error).message}` });
    } finally {
      setSaving(false);
    }
  };

  const saveFlags = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/features?token=${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flags }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "save failed");
      setDirty(false);
      setMessage({ type: "ok", text: "保存しました" });
    } catch (e) {
      setMessage({ type: "err", text: `保存失敗: ${(e as Error).message}` });
    } finally {
      setSaving(false);
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

  if (!data) {
    return (
      <div className="min-h-screen bg-[#F5F0EB] flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <p className="text-[#5B5560] mb-4">{message?.text || "読み込めませんでした"}</p>
          <Link href={`/a/${token}`} className="text-[#1A1A2E] font-medium hover:underline text-sm">
            管理画面に戻る
          </Link>
        </div>
      </div>
    );
  }

  const grouped: Record<FlagCategory, FeatureFlag[]> = {
    "core": [], "existing": [],
    "tier-s": [], "tier-a": [], "tier-b": [], "tier-c": [], "tier-d": [], "tier-e": [], "tier-f": [], "tier-g": [],
  };
  for (const f of data.catalog) grouped[f.category].push(f);

  return (
    <div className="min-h-screen bg-[#F5F0EB] pb-32">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#040408] via-[#080810] to-[#1A1A2E] text-white px-6 pt-10 pb-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <Link href={`/a/${token}`} className="text-indigo-200 text-xs hover:text-white transition">
              ← 管理画面に戻る
            </Link>
            <span className="text-[10px] text-indigo-200 font-mono bg-white/10 px-2 py-1 rounded">
              client: {data.clientId}
            </span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight mt-2">機能設定(Feature Flags)</h1>
          <p className="text-indigo-200 text-sm mt-1.5 leading-relaxed">
            クライアントの導入フェーズに応じて、機能を段階的にON/OFFできます。
          </p>
          {!data.notionConfigured && (
            <div className="mt-3 bg-amber-400/20 border border-amber-300/40 text-amber-100 text-xs rounded-lg p-3">
              ⚠ <code className="bg-black/20 px-1.5 py-0.5 rounded">NOTION_FEATURE_FLAGS_PAGE_ID</code> が未設定です。現在はデフォルト値のみ表示され、保存できません。Notionページを作成し、環境変数を設定してください。
            </div>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-5 mt-6 space-y-4">
        {/* Presets */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-[#1A1A2E] mb-1">プリセット(ワンクリック適用)</h2>
          <p className="text-xs text-[#5B5560] mb-4">
            よく使う構成をワンクリックで適用できます。個別調整は下のセクションで。
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.presets.map((p) => (
              <button
                key={p.id}
                onClick={() => applyPreset(p.id)}
                disabled={saving}
                className="text-left p-4 rounded-xl border border-gray-200 hover:border-[#1A1A2E] hover:bg-indigo-50/40 transition disabled:opacity-50"
              >
                <div className="font-semibold text-sm text-[#1A1A2E] mb-1">{p.label}</div>
                <div className="text-xs text-[#5B5560] leading-relaxed">{p.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Status bar */}
        {message && (
          <div
            className={`rounded-xl p-3 text-sm ${
              message.type === "ok"
                ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
                : "bg-red-50 border border-red-200 text-red-700"
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Categories */}
        {CATEGORY_ORDER.map((cat) => {
          const items = grouped[cat];
          if (items.length === 0) return null;
          const meta = CATEGORY_META[cat];
          const enabledCount = items.filter((f) => flags[f.key]).length;
          const isCollapsed = collapsed[cat];
          return (
            <div key={cat} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <button
                onClick={() => setCollapsed((c) => ({ ...c, [cat]: !c[cat] }))}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition"
              >
                <div className="flex items-center gap-3 text-left">
                  <span className={`text-[10px] font-semibold px-2 py-1 rounded-md border ${meta.color}`}>
                    {meta.label}
                  </span>
                  <div>
                    <div className="text-xs text-[#5B5560]">{meta.desc}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[#8B8489] font-mono">
                    {enabledCount}/{items.length} ON
                  </span>
                  <svg
                    className={`w-4 h-4 text-[#8B8489] transition-transform ${isCollapsed ? "" : "rotate-180"}`}
                    fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </button>

              {!isCollapsed && (
                <div className="divide-y divide-gray-100">
                  {items.map((f) => {
                    const enabled = !!flags[f.key];
                    const disabled = !f.implemented;
                    const depMissing = (f.dependencies || []).filter((d) => !flags[d]);
                    return (
                      <div
                        key={f.key}
                        className={`flex items-start gap-4 px-5 py-4 ${disabled ? "opacity-50" : ""}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-semibold text-[#1A1A2E]">{f.label}</h3>
                            {!f.implemented && (
                              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                                準備中
                              </span>
                            )}
                            {f.recommendedPhase && (
                              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">
                                Phase {f.recommendedPhase}〜推奨
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[#5B5560] mt-1 leading-relaxed">{f.description}</p>
                          <div className="mt-1.5 flex items-center gap-3">
                            <code className="text-[10px] text-[#8B8489] font-mono">{f.key}</code>
                            {depMissing.length > 0 && enabled && (
                              <span className="text-[10px] text-amber-600">
                                ⚠ 依存機能がOFF: {depMissing.join(", ")}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Toggle */}
                        <button
                          onClick={() => toggleFlag(f.key)}
                          disabled={disabled}
                          className={`flex-shrink-0 relative w-11 h-6 rounded-full transition-colors ${
                            enabled ? "bg-[#1A1A2E]" : "bg-gray-300"
                          } ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
                          aria-pressed={enabled}
                          aria-label={`${f.label}をトグル`}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                              enabled ? "translate-x-5" : ""
                            }`}
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Sticky save bar */}
      {dirty && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 shadow-lg px-5 py-4 z-50">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
            <p className="text-sm text-[#1A1A2E] font-medium">未保存の変更があります</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setFlags(data.flags); setDirty(false); setMessage(null); }}
                disabled={saving}
                className="px-4 py-2 text-sm text-[#5B5560] hover:bg-gray-50 rounded-lg transition disabled:opacity-50"
              >
                破棄
              </button>
              <button
                onClick={saveFlags}
                disabled={saving}
                className="px-5 py-2 text-sm bg-[#1A1A2E] text-white font-medium rounded-lg hover:bg-[#141423] transition disabled:opacity-50"
              >
                {saving ? "保存中..." : "保存する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
