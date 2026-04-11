"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useFeatures } from "@/lib/use-features";
import Link from "next/link";

interface PsychAnalysis {
  analysisId: string;
  managerId: string;
  managerName: string;
  score: number;
  negativeSignals: string[];
  positiveSignals: string[];
  summary: string;
  feedbackCount: number;
}

interface PsychSafetyResponse {
  success: boolean;
  analyses: PsychAnalysis[];
  timestamp: string;
}

export default function PsychSafetyPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const { isOn } = useFeatures();

  const [analyses, setAnalyses] = useState<PsychAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAnalyses() {
      try {
        const res = await fetch(`/api/features/psych-safety?token=${token}`);
        if (!res.ok) {
          if (res.status === 403) {
            setError("心理的安全性監視機能が有効化されていません");
          } else {
            setError("データの取得に失敗しました");
          }
          return;
        }
        const data: PsychSafetyResponse = await res.json();
        setAnalyses(data.analyses || []);
      } catch {
        setError("データ取得中にエラーが発生しました");
      } finally {
        setLoading(false);
      }
    }
    fetchAnalyses();
  }, [token]);

  const getScoreColor = (score: number): { bg: string; text: string; gradient: string } => {
    if (score >= 0.7) {
      return { bg: "bg-green-50", text: "text-green-900", gradient: "from-green-400 to-emerald-500" };
    } else if (score >= 0.4) {
      return { bg: "bg-amber-50", text: "text-amber-900", gradient: "from-amber-400 to-orange-500" };
    } else {
      return { bg: "bg-red-50", text: "text-red-900", gradient: "from-red-400 to-rose-500" };
    }
  };

  if (!isOn("tier-a.psychSafetyMonitor")) {
    return (
      <div className="min-h-screen bg-[#F5F0EB] flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-[#5B5560] mb-4">このフィーチャーは現在利用できません</p>
          <Link href={`/m/${token}`} className="text-[#1A1A2E] font-medium hover:underline">
            ダッシュボードに戻る
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F0EB] flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#1A1A2E] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[#8B8489] text-sm">読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F0EB] pb-8">
      {/* Header */}
      <div className="gradient-header-manager text-white px-6 pt-12 pb-6">
        <div className="max-w-md mx-auto relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => router.back()}
              className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25 transition-colors"
              aria-label="戻る"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight mb-1">心理的安全性監視</h1>
          <p className="text-indigo-300 text-sm font-light">チーム環境分析</p>
        </div>
      </div>

      <div className="max-w-md mx-auto px-5 pt-5 space-y-4 animate-fade-up relative z-10">
        {error && (
          <div className="card p-3 border-red-200 bg-red-50">
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        {analyses.length === 0 ? (
          <div className="card p-8 text-center space-y-3">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto text-[#8B8489]">
              <path d="M12 2v20m10-10H2"/>
            </svg>
            <p className="text-sm text-[#5B5560]">分析データはまだありません</p>
            <p className="text-xs text-[#8B8489]">フィードバックが蓄積されると分析が表示されます</p>
          </div>
        ) : (
          <div className="space-y-3">
            {analyses.map((analysis) => {
              const colors = getScoreColor(analysis.score);
              const scorePercentage = Math.round(analysis.score * 100);

              return (
                <div key={analysis.analysisId} className={`card p-4 ${colors.bg}`}>
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className={`font-medium text-sm ${colors.text}`}>{analysis.managerName}</h3>
                      <p className="text-[10px] text-[#8B8489] mt-0.5">
                        フィードバック: {analysis.feedbackCount}件
                      </p>
                    </div>
                  </div>

                  {/* Score Gauge */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className={`text-xs font-semibold ${colors.text}`}>安全性スコア</p>
                      <p className={`text-sm font-bold ${colors.text}`}>{scorePercentage}%</p>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full bg-gradient-to-r ${colors.gradient} transition-all duration-500`}
                        style={{ width: `${scorePercentage}%` }}
                      />
                    </div>
                  </div>

                  {/* Signals and Recommendations */}
                  <button
                    onClick={() => setExpandedId(expandedId === analysis.analysisId ? null : analysis.analysisId)}
                    className="w-full text-left py-2 flex items-center justify-between hover:bg-black/5 px-2 -mx-2 rounded-lg transition-colors"
                  >
                    <span className={`text-xs font-medium ${colors.text}`}>詳細を表示</span>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={`${colors.text} transition-transform ${expandedId === analysis.analysisId ? "rotate-180" : ""}`}
                    >
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>

                  {/* Expanded Content */}
                  {expandedId === analysis.analysisId && (
                    <div className="mt-3 pt-3 border-t border-gray-300 border-opacity-50 space-y-2.5">
                      {/* Summary */}
                      {analysis.summary && (
                        <div>
                          <p className={`text-[10px] font-semibold uppercase tracking-wide mb-1 ${colors.text}`}>
                            分析サマリー
                          </p>
                          <p className={`text-xs leading-relaxed ${colors.text}`}>
                            {analysis.summary}
                          </p>
                        </div>
                      )}

                      {/* Positive Signals */}
                      {analysis.positiveSignals && analysis.positiveSignals.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold text-green-700 uppercase tracking-wide mb-1">
                            ✓ ポジティブシグナル
                          </p>
                          <ul className="space-y-1">
                            {analysis.positiveSignals.map((signal, idx) => (
                              <li key={idx} className="flex gap-1.5 text-xs text-green-700">
                                <span className="flex-shrink-0 mt-0.5">✓</span>
                                <span>{signal}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Negative Signals */}
                      {analysis.negativeSignals && analysis.negativeSignals.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold text-red-700 uppercase tracking-wide mb-1">
                            ⚠ リスクシグナル
                          </p>
                          <ul className="space-y-1">
                            {analysis.negativeSignals.map((signal, idx) => (
                              <li key={idx} className="flex gap-1.5 text-xs text-red-700">
                                <span className="flex-shrink-0 mt-0.5">⚠</span>
                                <span>{signal}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="text-center py-6 text-[11px] text-[#C9BDAE]">
          CORE Log — 心理的安全性分析
        </div>
      </div>
    </div>
  );
}
