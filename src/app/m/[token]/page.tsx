"use client";

import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useFeatures } from "@/lib/use-features";

type ParticipantData = {
  name: string;
  department: string;
  dojoPhase: string;
  entryDays: number;
  entryRate: number;
  streak: number;
  fbCount: number;
  todayHasLog: boolean;
  latestLog: {
    date: string;
    morningIntent: string;
    eveningInsight: string | null;
    status: string;
    energy: string | null;
  } | null;
  recentEnergy: (string | null)[];
};

type ManagerData = {
  manager: { name: string; department: string; isAdmin?: boolean; role?: string };
  participants: ParticipantData[];
};

type BurnoutScore = {
  participantId: string;
  participantName: string;
  composite: number;
  riskLevel: "low" | "medium" | "high";
};

const energyEmoji: Record<string, string> = {
  excellent: "🔥",
  good: "😊",
  okay: "😐",
  low: "😞",
};

export default function ManagerHome() {
  const params = useParams();
  const token = params.token as string;
  const { isOn } = useFeatures();
  const [data, setData] = useState<ManagerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [highRiskParticipants, setHighRiskParticipants] = useState<BurnoutScore[]>([]);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/manager?token=${token}`);
        if (!res.ok) { setError("上司が見つかりません"); return; }
        const json = await res.json();
        setData(json);

        // Fetch burnout scores to check for high-risk participants
        if (isOn("tier-a.burnoutScore")) {
          try {
            const burnoutRes = await fetch(`/api/features/burnout?token=${token}`);
            if (burnoutRes.ok) {
              const burnoutData = await burnoutRes.json();
              const highRisks = burnoutData.scores?.filter((s: BurnoutScore) => s.riskLevel === "high") || [];
              if (highRisks.length > 0) {
                setHighRiskParticipants(highRisks);
              }
            }
          } catch {
            // Silent fail - burnout alert is optional
          }
        }
      } catch {
        setError("データの取得に失敗しました");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [token, isOn]);

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

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#F5F0EB] flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-[#5B5560] mb-4">{error || "上司が見つかりません"}</p>
          <a href="/" className="text-[#1A1A2E] font-medium hover:underline">ホームに戻る</a>
        </div>
      </div>
    );
  }

  const { manager, participants } = data;
  const totalParticipants = participants.length;
  const avgEntryRate = participants.length > 0
    ? Math.round(participants.reduce((sum, p) => sum + p.entryRate, 0) / participants.length)
    : 0;
  // Calculate low energy participants (past 7 days)
  const lowEnergyParticipants = participants.filter((p) => {
    const recentEnergy = (p.recentEnergy || []).slice(0, 7);
    return recentEnergy.some((e) => e === "low");
  }).length;

  const getStatusIndicator = (participant: ParticipantData) => {
    if (participant.streak > 0) return { color: "bg-emerald-500", label: "活動中" };
    if (participant.entryRate > 50) return { color: "bg-amber-500", label: "スローダウン" };
    if (participant.entryDays > 0) return { color: "bg-red-500", label: "要注意" };
    return { color: "bg-gray-300", label: "未開始" };
  };

  return (
    <div className="min-h-screen bg-[#F5F0EB] pb-8">
      {/* Header */}
      <div className="gradient-header-manager text-white px-6 pt-12 pb-6">
        <div className="max-w-md mx-auto relative z-10">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm px-3 py-1 rounded-lg text-xs font-medium text-indigo-200 mb-3">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            マネージャー
          </div>
          <h1 className="text-2xl font-semibold tracking-tight mb-1">{manager.name}</h1>
          <div className="flex items-center justify-between">
            <p className="text-indigo-300 text-sm font-light">ダッシュボード</p>
            {(manager.isAdmin || manager.role === "observer") && (
              <Link
                href={`/a/${token}`}
                className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur-sm text-white/90 hover:text-white hover:bg-white/25 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                </svg>
                管理者画面
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-5 pt-5 space-y-4 animate-fade-up relative z-10">
        {/* High Risk Burnout Alert */}
        {highRiskParticipants.length > 0 && isOn("tier-a.burnoutScore") && (
          <Link href={`/m/${token}/features/burnout`}>
            <div className="card p-3 border-2 border-red-300 bg-red-50 hover:bg-red-100 transition-colors cursor-pointer">
              <div className="flex items-start gap-2">
                <span className="text-lg flex-shrink-0">⚠️</span>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-red-700">
                    要注意: {highRiskParticipants.map((h) => h.participantName).join("・")}さんのバーンアウトリスクが高まっています
                  </p>
                  <p className="text-[10px] text-red-600 mt-0.5">詳細を確認する →</p>
                </div>
              </div>
            </div>
          </Link>
        )}

        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-2.5">
          <div className="card p-3.5 text-center">
            <div className="text-2xl font-bold text-[#1A1A2E] tracking-tight">{totalParticipants}</div>
            <div className="text-[10px] text-[#8B8489] font-medium tracking-wide mt-0.5">参加者</div>
          </div>
          <div className="bg-[#F2F2F7] border border-indigo-200 p-3.5 rounded-2xl text-center">
            <div className="text-2xl font-bold text-[#1A1A2E] tracking-tight">{avgEntryRate}%</div>
            <div className="text-[10px] text-[#4D4D6D] font-medium tracking-wide mt-0.5">平均記入率</div>
          </div>
          <div className="card p-3.5 text-center">
            <div className="text-2xl font-bold text-[#1A1A2E] tracking-tight">{lowEnergyParticipants}</div>
            <div className="text-[10px] text-[#8B8489] font-medium tracking-wide mt-0.5">低エネルギー</div>
          </div>
        </div>

        {/* Manager Tools Section */}
        {(isOn("tier-a.oneOnOneBriefing") ||
          isOn("tier-a.burnoutScore") ||
          isOn("tier-a.managerSelfReflection") ||
          isOn("tier-a.psychSafetyMonitor")) && (
          <div>
            <h2 className="text-xs font-semibold text-[#5B5560] tracking-wide uppercase mb-3 px-1">
              マネージャーツール
            </h2>
            <div className="overflow-x-auto pb-2 -mx-5 px-5">
              <div className="flex gap-2.5 w-max">
                {isOn("tier-a.oneOnOneBriefing") && (
                  <Link href={`/m/${token}/features/briefing`}>
                    <div className="card p-4 w-44 hover:shadow-md transition-shadow cursor-pointer flex-shrink-0">
                      <div className="flex items-center justify-center h-10 mb-2 rounded-lg bg-indigo-100/50">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-600">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                        </svg>
                      </div>
                      <h3 className="text-xs font-semibold text-[#1A1A2E]">1on1ブリーフィング</h3>
                      <p className="text-[10px] text-[#8B8489] mt-1 leading-relaxed">対話の準備を効率化</p>
                    </div>
                  </Link>
                )}

                {isOn("tier-a.burnoutScore") && (
                  <Link href={`/m/${token}/features/burnout`}>
                    <div className="card p-4 w-44 hover:shadow-md transition-shadow cursor-pointer flex-shrink-0">
                      <div className="flex items-center justify-center h-10 mb-2 rounded-lg bg-red-100/50">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-600">
                          <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
                        </svg>
                      </div>
                      <h3 className="text-xs font-semibold text-[#1A1A2E]">バーンアウトスコア</h3>
                      <p className="text-[10px] text-[#8B8489] mt-1 leading-relaxed">リスク監視と評価</p>
                    </div>
                  </Link>
                )}

                {isOn("tier-a.managerSelfReflection") && (
                  <Link href={`/m/${token}/features/reflection`}>
                    <div className="card p-4 w-44 hover:shadow-md transition-shadow cursor-pointer flex-shrink-0">
                      <div className="flex items-center justify-center h-10 mb-2 rounded-lg bg-blue-100/50">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                        </svg>
                      </div>
                      <h3 className="text-xs font-semibold text-[#1A1A2E]">自己省察</h3>
                      <p className="text-[10px] text-[#8B8489] mt-1 leading-relaxed">週次リーダーシップ振り返り</p>
                    </div>
                  </Link>
                )}

                {isOn("tier-a.psychSafetyMonitor") && (
                  <Link href={`/m/${token}/features/psych-safety`}>
                    <div className="card p-4 w-44 hover:shadow-md transition-shadow cursor-pointer flex-shrink-0">
                      <div className="flex items-center justify-center h-10 mb-2 rounded-lg bg-green-100/50">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600">
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                        </svg>
                      </div>
                      <h3 className="text-xs font-semibold text-[#1A1A2E]">心理的安全性</h3>
                      <p className="text-[10px] text-[#8B8489] mt-1 leading-relaxed">チーム環境分析</p>
                    </div>
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Participant Cards */}
        <div>
          <h2 className="text-xs font-semibold text-[#5B5560] tracking-wide uppercase mb-3 px-1">
            直属部下 ({participants.length}名)
          </h2>
          <div className="space-y-2.5">
            {participants.map((participant) => {
              const status = getStatusIndicator(participant);

              return (
                <div key={participant.name}>
                  <Link href={`/m/${token}/${encodeURIComponent(participant.name)}`}>
                    <div className="card-interactive p-4 cursor-pointer">
                      {/* Header Row */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium text-sm text-[#1A1A2E]">{participant.name}</h3>
                            {participant.todayHasLog && (
                              <span className="bg-[#1A1A2E] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md">
                                NEW
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-[#8B8489] mt-0.5">{participant.department}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${status.color}`}></div>
                          <span className="text-[10px] text-[#8B8489]">{status.label}</span>
                        </div>
                      </div>

                      {/* Progress */}
                      <div className="flex items-center gap-3 mb-3">
                        <div className="flex-shrink-0">
                          <div className="relative w-11 h-11">
                            <svg viewBox="0 0 36 36" className="w-11 h-11 -rotate-90">
                              <circle cx="18" cy="18" r="15.5" fill="none" stroke="#EFE8DD" strokeWidth="3" />
                              <circle cx="18" cy="18" r="15.5" fill="none" stroke="#1A1A2E" strokeWidth="3"
                                strokeDasharray={`${participant.entryRate * 0.9738} 97.38`}
                                strokeLinecap="round" />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="text-[10px] font-bold text-[#1A1A2E]">{participant.entryRate}%</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex-1 text-xs text-[#5B5560]">
                          <span>{participant.entryDays}日記入</span>
                          <span className="mx-1.5 text-[#E5DCD0]">|</span>
                          <span>{participant.streak}連続</span>
                        </div>
                      </div>

                      {/* Latest Log */}
                      {participant.latestLog && (participant.latestLog.morningIntent || participant.latestLog.eveningInsight) && (
                        <div className="mb-3 p-2.5 bg-[#F5F0EB] rounded-xl border border-[#EFE8DD]">
                          <p className="text-[10px] text-[#8B8489] mb-0.5">最新 ({participant.latestLog.date})</p>
                          <p className="text-xs text-[#2C2C4A] line-clamp-2 leading-relaxed">{participant.latestLog.morningIntent || participant.latestLog.eveningInsight}</p>
                        </div>
                      )}

                      {/* Energy + Bottom */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          {(participant.recentEnergy || []).map((energy, idx) => (
                            <span key={idx} className="text-sm leading-none">
                              {energy ? energyEmoji[energy] : "·"}
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-[#1A1A2E] font-medium">
                          <span>詳細</span>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="9 18 15 12 9 6"/>
                          </svg>
                        </div>
                      </div>
                    </div>
                  </Link>

                  {/* Quick Action: 1on1 Briefing */}
                  {isOn("tier-a.oneOnOneBriefing") && (
                    <Link href={`/m/${token}/features/briefing`}>
                      <button
                        className="w-full mt-2 px-3 py-2 rounded-xl text-xs font-medium bg-indigo-100/50 text-indigo-700 hover:bg-indigo-100 transition-colors flex items-center justify-center gap-1.5"
                        onClick={(e) => {
                          // This allows both Link and button to work
                          e.stopPropagation();
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                        </svg>
                        1on1準備
                      </button>
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center py-6 text-[11px] text-[#C9BDAE]">
          CORE Log — マネージャービュー
        </div>
      </div>
    </div>
  );
}
