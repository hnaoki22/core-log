"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useFeatures } from "@/lib/use-features";
import Link from "next/link";

// ---------- Types (mirror llm.ts) ----------
type ReflectionLevel = "L1" | "L2" | "L3" | "L4";

type SpotlightParticipant = {
  name: string;
  reason: string;
  reflectionLevel: ReflectionLevel;
  trajectory: "deepening" | "stable" | "flattening";
  suggestedIntervention: string;
  priority: "high" | "medium" | "low";
};

type DepthAnalysis = {
  name: string;
  currentLevel: ReflectionLevel;
  trajectory: "deepening" | "stable" | "flattening";
  themePersistence: { theme: string; dayCount: number; description: string }[];
  newConcepts: string[];
  notableShift: string | null;
  summary: string;
};

type SpotlightApiResponse = {
  success: boolean;
  spotlight: {
    spotlight: SpotlightParticipant[];
    orgPulse: string;
    weekSummary: string;
  };
  depthAnalyses: DepthAnalysis[];
  generatedAt: string;
  cached: boolean;
  error?: string;
};

// ---------- Constants ----------
const LEVEL_LABELS: Record<ReflectionLevel, string> = {
  L1: "事実報告",
  L2: "感情・気づき",
  L3: "構造的洞察",
  L4: "行動変容",
};

const LEVEL_COLORS: Record<ReflectionLevel, { bg: string; text: string; border: string }> = {
  L1: { bg: "bg-gray-100", text: "text-gray-600", border: "border-gray-300" },
  L2: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-300" },
  L3: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-400" },
  L4: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-400" },
};

const TRAJECTORY_ICONS: Record<string, { icon: string; label: string; color: string }> = {
  deepening: { icon: "↗", label: "深化中", color: "text-emerald-600" },
  stable: { icon: "→", label: "安定", color: "text-blue-600" },
  flattening: { icon: "↘", label: "停滞傾向", color: "text-orange-600" },
};

const PRIORITY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  high: { bg: "bg-red-50", text: "text-red-700", label: "要注目" },
  medium: { bg: "bg-amber-50", text: "text-amber-700", label: "注目" },
  low: { bg: "bg-blue-50", text: "text-blue-700", label: "経過観察" },
};

export default function ConsultantSpotlightPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const { isOn, loaded } = useFeatures();

  const [data, setData] = useState<SpotlightApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedParticipant, setExpandedParticipant] = useState<string | null>(null);

  // Feature flag guard
  useEffect(() => {
    if (!loaded) return;
    if (!isOn("tier-a.consultantSpotlight")) {
      router.push(`/a/${token}`);
    }
  }, [loaded, isOn, token, router]);

  // Fetch spotlight data
  useEffect(() => {
    async function fetchSpotlight() {
      try {
        const res = await fetch(
          `/api/features/consultant-spotlight?token=${token}`
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "データの取得に失敗しました");
        }
        const json = (await res.json()) as SpotlightApiResponse;
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "読み込みエラー");
      } finally {
        setLoading(false);
      }
    }
    if (token) fetchSpotlight();
  }, [token]);

  // Force-regenerate
  const handleRegenerate = async () => {
    setRegenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/features/consultant-spotlight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "再分析に失敗しました");
      }
      const json = (await res.json()) as SpotlightApiResponse;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "再分析エラー");
    } finally {
      setRegenerating(false);
    }
  };

  const toggleExpand = (name: string) => {
    setExpandedParticipant((prev) => (prev === name ? null : name));
  };

  // ---------- Loading ----------
  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F0EB] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-[3px] border-[#1A1A2E] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[#8B8489] text-sm">スポットライト分析を取得中...</p>
        </div>
      </div>
    );
  }

  // ---------- Error ----------
  if (error && !data) {
    return (
      <div className="min-h-screen bg-[#F5F0EB]">
        <header className="gradient-header-admin text-white px-5 pt-12 pb-6">
          <div className="max-w-2xl mx-auto relative z-10">
            <Link
              href={`/a/${token}`}
              className="inline-flex items-center gap-1 text-[#C9BDAE] hover:text-white text-sm mb-3 transition-colors"
            >
              <ChevronLeft />
              管理画面に戻る
            </Link>
            <h1 className="text-xl font-semibold tracking-tight">
              コンサルタント・スポットライト
            </h1>
          </div>
        </header>
        <main className="px-5 py-6 max-w-2xl mx-auto">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        </main>
      </div>
    );
  }

  const spotlight = data?.spotlight;
  const depthMap = new Map(
    (data?.depthAnalyses || []).map((d) => [d.name, d])
  );

  return (
    <div className="min-h-screen bg-[#F5F0EB]">
      {/* Header */}
      <header className="gradient-header-admin text-white px-5 pt-12 pb-6">
        <div className="max-w-2xl mx-auto relative z-10">
          <Link
            href={`/a/${token}`}
            className="inline-flex items-center gap-1 text-[#C9BDAE] hover:text-white text-sm mb-3 transition-colors"
          >
            <ChevronLeft />
            管理画面に戻る
          </Link>
          <h1 className="text-xl font-semibold tracking-tight">
            コンサルタント・スポットライト
          </h1>
          <p className="text-xs text-[#C9BDAE] mt-1">
            今週注目すべき参加者のAI分析
          </p>
        </div>
      </header>

      <main className="px-5 py-6 space-y-5 max-w-2xl mx-auto">
        {/* Error banner */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Meta info + Regenerate */}
        <div className="flex items-center justify-between">
          <div className="text-xs text-[#8B8489]">
            {data?.generatedAt && (
              <span>
                分析日時:{" "}
                {new Date(data.generatedAt).toLocaleString("ja-JP", {
                  timeZone: "Asia/Tokyo",
                })}
                {data.cached && " (キャッシュ)"}
              </span>
            )}
          </div>
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[#1A1A2E] text-[#1A1A2E] hover:bg-[#1A1A2E] hover:text-white transition-colors disabled:opacity-50"
          >
            {regenerating ? (
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
                分析中...
              </span>
            ) : (
              "再分析"
            )}
          </button>
        </div>

        {/* Org Pulse Card */}
        {spotlight && (
          <div className="card p-5 space-y-3 border-l-4 border-[#1A1A2E]">
            <h2 className="text-sm font-semibold text-[#1A1A2E] flex items-center gap-2">
              <span className="text-base">🫀</span>
              組織パルス
            </h2>
            <p className="text-sm text-[#5B5560] leading-relaxed">
              {spotlight.orgPulse}
            </p>
            <div className="pt-2 border-t border-[#EFE8DD]">
              <p className="text-xs text-[#8B8489] font-medium mb-1">
                週間サマリー
              </p>
              <p className="text-xs text-[#5B5560] leading-relaxed">
                {spotlight.weekSummary}
              </p>
            </div>
          </div>
        )}

        {/* Spotlight Participants */}
        {spotlight && spotlight.spotlight.length > 0 ? (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-[#1A1A2E]">
              注目参加者（{spotlight.spotlight.length}名）
            </h2>
            {spotlight.spotlight.map((p, idx) => {
              const depth = depthMap.get(p.name);
              const isExpanded = expandedParticipant === p.name;
              const priority = PRIORITY_STYLES[p.priority] || PRIORITY_STYLES.medium;
              const levelColor = LEVEL_COLORS[p.reflectionLevel];
              const traj = TRAJECTORY_ICONS[p.trajectory] || TRAJECTORY_ICONS.stable;

              return (
                <div key={p.name} className="card overflow-hidden">
                  {/* Main row */}
                  <button
                    onClick={() => toggleExpand(p.name)}
                    className="w-full text-left p-5 hover:bg-[#FAF7F3] transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      {/* Rank badge */}
                      <div className="w-7 h-7 rounded-full bg-[#1A1A2E] text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                        {idx + 1}
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Name row */}
                        <div className="flex items-center gap-2 flex-wrap mb-1.5">
                          <span className="font-semibold text-sm text-[#1A1A2E]">
                            {p.name}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${priority.bg} ${priority.text}`}
                          >
                            {priority.label}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 text-[10px] font-bold rounded border ${levelColor.bg} ${levelColor.text} ${levelColor.border}`}
                          >
                            {p.reflectionLevel} {LEVEL_LABELS[p.reflectionLevel]}
                          </span>
                          <span className={`text-xs font-medium ${traj.color}`}>
                            {traj.icon} {traj.label}
                          </span>
                        </div>

                        {/* Reason */}
                        <p className="text-xs text-[#5B5560] leading-relaxed">
                          {p.reason}
                        </p>

                        {/* Suggested intervention */}
                        <div className="mt-2 px-3 py-2 bg-[#F5F0EB] rounded-lg">
                          <p className="text-[10px] font-semibold text-[#8B8489] uppercase tracking-wide mb-0.5">
                            推奨介入
                          </p>
                          <p className="text-xs text-[#1A1A2E]">
                            {p.suggestedIntervention}
                          </p>
                        </div>
                      </div>

                      {/* Expand chevron */}
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={`text-[#8B8489] flex-shrink-0 mt-1 transition-transform ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </div>
                  </button>

                  {/* Expanded depth analysis */}
                  {isExpanded && depth && (
                    <div className="px-5 pb-5 pt-0 border-t border-[#EFE8DD] space-y-4">
                      {/* Summary */}
                      <div className="pt-4">
                        <p className="text-xs font-semibold text-[#5B5560] uppercase tracking-wide mb-1">
                          省察深度サマリー
                        </p>
                        <p className="text-sm text-[#5B5560] leading-relaxed">
                          {depth.summary}
                        </p>
                      </div>

                      {/* Notable shift */}
                      {depth.notableShift && (
                        <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                          <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide mb-0.5">
                            特筆すべき変化
                          </p>
                          <p className="text-xs text-amber-800">
                            {depth.notableShift}
                          </p>
                        </div>
                      )}

                      {/* Theme persistence */}
                      {depth.themePersistence.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-[#5B5560] uppercase tracking-wide mb-2">
                            テーマの持続性
                          </p>
                          <div className="space-y-2">
                            {depth.themePersistence.map((t, i) => (
                              <div
                                key={i}
                                className="flex items-start gap-2 text-xs"
                              >
                                <span className="px-1.5 py-0.5 bg-[#1A1A2E] text-white rounded font-bold flex-shrink-0">
                                  {t.dayCount}日
                                </span>
                                <div>
                                  <span className="font-medium text-[#1A1A2E]">
                                    {t.theme}
                                  </span>
                                  <span className="text-[#8B8489] ml-1">
                                    — {t.description}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* New concepts */}
                      {depth.newConcepts.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-[#5B5560] uppercase tracking-wide mb-2">
                            新しく使い始めた概念
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {depth.newConcepts.map((c, i) => (
                              <span
                                key={i}
                                className="px-2 py-1 bg-emerald-50 text-emerald-700 text-xs rounded-full border border-emerald-200"
                              >
                                {c}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="card p-8 text-center">
            <p className="text-[#8B8489] text-sm">
              直近1週間のログがないか、分析データがありません
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

// ---------- Icon Components ----------
function ChevronLeft() {
  return (
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
  );
}
