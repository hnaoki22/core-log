"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useFeatures } from "@/lib/use-features";
import Link from "next/link";

interface BurnoutScore {
  participantId: string;
  participantName: string;
  energyAvg: number;
  entryRate: number;
  ruminationAvg: number;
  composite: number;
  riskLevel: "low" | "medium" | "high";
}

interface BurnoutResponse {
  success: boolean;
  scores: BurnoutScore[];
  timestamp: string;
}

export default function BurnoutPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const { isOn } = useFeatures();

  const [scores, setScores] = useState<BurnoutScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchScores() {
      try {
        const res = await fetch(`/api/features/burnout?token=${token}`);
        if (!res.ok) {
          if (res.status === 403) {
            setError("バーンアウトスコア機能が有効化されていません");
          } else {
            setError("スコアの取得に失敗しました");
          }
          return;
        }
        const data: BurnoutResponse = await res.json();
        setScores(data.scores.sort((a, b) => {
          const riskOrder = { high: 0, medium: 1, low: 2 };
          return riskOrder[a.riskLevel] - riskOrder[b.riskLevel];
        }));
      } catch {
        setError("スコア取得中にエラーが発生しました");
      } finally {
        setLoading(false);
      }
    }
    fetchScores();
  }, [token]);

  const getRiskColor = (level: string): { bg: string; text: string; badge: string } => {
    switch (level) {
      case "high":
        return { bg: "bg-red-50", text: "text-red-900", badge: "bg-red-100 text-red-700" };
      case "medium":
        return { bg: "bg-amber-50", text: "text-amber-900", badge: "bg-amber-100 text-amber-700" };
      case "low":
        return { bg: "bg-green-50", text: "text-green-900", badge: "bg-green-100 text-green-700" };
      default:
        return { bg: "bg-gray-50", text: "text-gray-900", badge: "bg-gray-100 text-gray-700" };
    }
  };

  const getRiskLabel = (level: string): string => {
    switch (level) {
      case "high":
        return "高リスク";
      case "medium":
        return "中程度";
      case "low":
        return "低リスク";
      default:
        return "不明";
    }
  };

  if (!isOn("tier-a.burnoutScore")) {
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
          <h1 className="text-2xl font-semibold tracking-tight mb-1">バーンアウトスコア</h1>
          <p className="text-indigo-300 text-sm font-light">リスク評価と監視</p>
        </div>
      </div>

      <div className="max-w-md mx-auto px-5 pt-5 space-y-4 animate-fade-up relative z-10">
        {error && (
          <div className="card p-3 border-red-200 bg-red-50">
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        {scores.length === 0 ? (
          <div className="card p-8 text-center space-y-3">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto text-[#8B8489]">
              <path d="M12 2v20m10-10H2"/>
            </svg>
            <p className="text-sm text-[#5B5560]">データがありません</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {scores.map((score) => {
              const colors = getRiskColor(score.riskLevel);
              return (
                <div key={score.participantId} className={`card p-4 ${colors.bg} border-2 border-opacity-20`}>
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className={`font-medium text-sm ${colors.text}`}>{score.participantName}</h3>
                      <span className={`inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium mt-1 ${colors.badge}`}>
                        {getRiskLabel(score.riskLevel)}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className={`text-xl font-bold ${colors.text}`}>
                        {(score.composite * 100).toFixed(0)}
                      </div>
                      <p className={`text-[10px] ${colors.text} opacity-75`}>総合スコア</p>
                    </div>
                  </div>

                  {/* Metrics Grid */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className={`p-2 rounded-lg ${colors.badge} bg-opacity-30`}>
                      <p className={`text-[9px] ${colors.text} opacity-75 font-medium`}>エネルギー</p>
                      <p className={`text-sm font-bold ${colors.text} mt-0.5`}>{score.energyAvg.toFixed(1)}</p>
                    </div>
                    <div className={`p-2 rounded-lg ${colors.badge} bg-opacity-30`}>
                      <p className={`text-[9px] ${colors.text} opacity-75 font-medium`}>記入率</p>
                      <p className={`text-sm font-bold ${colors.text} mt-0.5`}>{score.entryRate}%</p>
                    </div>
                    <div className={`p-2 rounded-lg ${colors.badge} bg-opacity-30`}>
                      <p className={`text-[9px] ${colors.text} opacity-75 font-medium`}>反すう</p>
                      <p className={`text-sm font-bold ${colors.text} mt-0.5`}>{score.ruminationAvg.toFixed(1)}</p>
                    </div>
                  </div>

                  {/* Risk Alert */}
                  {score.riskLevel === "high" && (
                    <div className="mt-3 p-2 rounded-lg bg-red-100/50 border border-red-200">
                      <p className="text-[10px] text-red-700 font-medium">
                        ⚠️ 早期の対応が必要です。1on1面談やサポートを検討してください。
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="text-center py-6 text-[11px] text-[#C9BDAE]">
          CORE Log — バーンアウト監視
        </div>
      </div>
    </div>
  );
}
