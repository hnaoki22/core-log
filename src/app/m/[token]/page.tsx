"use client";

import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import Link from "next/link";

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
    status: string;
    energy: string | null;
  } | null;
  recentEnergy: (string | null)[];
};

type ManagerData = {
  manager: { name: string; department: string };
  participants: ParticipantData[];
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
  const [data, setData] = useState<ManagerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/manager?token=${token}`);
        if (!res.ok) { setError("上司が見つかりません"); return; }
        const json = await res.json();
        setData(json);
      } catch {
        setError("データの取得に失敗しました");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#4338CA] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[#9CA3AF] text-sm">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-[#6B7280] mb-4">{error || "上司が見つかりません"}</p>
          <a href="/" className="text-[#4338CA] font-medium hover:underline">ホームに戻る</a>
        </div>
      </div>
    );
  }

  const { manager, participants } = data;
  const totalParticipants = participants.length;
  const avgEntryRate = participants.length > 0
    ? Math.round(participants.reduce((sum, p) => sum + p.entryRate, 0) / participants.length)
    : 0;
  const todayLogCount = participants.filter((p) => p.todayHasLog).length;

  const getStatusIndicator = (participant: ParticipantData) => {
    if (participant.streak > 0) return { color: "bg-emerald-500", label: "活動中" };
    if (participant.entryRate > 50) return { color: "bg-amber-500", label: "スローダウン" };
    if (participant.entryDays > 0) return { color: "bg-red-500", label: "要注意" };
    return { color: "bg-gray-300", label: "未開始" };
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB] pb-8">
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
          <p className="text-indigo-300 text-sm font-light">ダッシュボード</p>
        </div>
      </div>

      <div className="max-w-md mx-auto px-5 pt-5 space-y-4 animate-fade-up relative z-10">
        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-2.5">
          <div className="card p-3.5 text-center">
            <div className="text-2xl font-bold text-[#111827] tracking-tight">{totalParticipants}</div>
            <div className="text-[10px] text-[#9CA3AF] font-medium tracking-wide mt-0.5">参加者</div>
          </div>
          <div className="bg-[#EEF2FF] border border-indigo-200 p-3.5 rounded-2xl text-center">
            <div className="text-2xl font-bold text-[#4338CA] tracking-tight">{avgEntryRate}%</div>
            <div className="text-[10px] text-[#6366F1] font-medium tracking-wide mt-0.5">平均記入率</div>
          </div>
          <div className="card p-3.5 text-center">
            <div className="text-2xl font-bold text-[#111827] tracking-tight">{todayLogCount}<span className="text-sm text-[#9CA3AF] font-normal">/{totalParticipants}</span></div>
            <div className="text-[10px] text-[#9CA3AF] font-medium tracking-wide mt-0.5">今日の記入</div>
          </div>
        </div>

        {/* Participant Cards */}
        <div>
          <h2 className="text-xs font-semibold text-[#6B7280] tracking-wide uppercase mb-3 px-1">
            直属部下 ({participants.length}名)
          </h2>
          <div className="space-y-2.5">
            {participants.map((participant) => {
              const status = getStatusIndicator(participant);

              return (
                <Link key={participant.name} href={`/m/${token}/${encodeURIComponent(participant.name)}`}>
                  <div className="card-interactive p-4 cursor-pointer">
                    {/* Header Row */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-sm text-[#111827]">{participant.name}</h3>
                          {participant.todayHasLog && (
                            <span className="bg-[#4338CA] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md">
                              NEW
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[#9CA3AF] mt-0.5">{participant.department}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${status.color}`}></div>
                        <span className="text-[10px] text-[#9CA3AF]">{status.label}</span>
                      </div>
                    </div>

                    {/* Progress */}
                    <div className="flex items-center gap-3 mb-3">
                      <div className="flex-shrink-0">
                        <div className="relative w-11 h-11">
                          <svg viewBox="0 0 36 36" className="w-11 h-11 -rotate-90">
                            <circle cx="18" cy="18" r="15.5" fill="none" stroke="#F3F4F6" strokeWidth="3" />
                            <circle cx="18" cy="18" r="15.5" fill="none" stroke="#4338CA" strokeWidth="3"
                              strokeDasharray={`${participant.entryRate * 0.9738} 97.38`}
                              strokeLinecap="round" />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-[10px] font-bold text-[#111827]">{participant.entryRate}%</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex-1 text-xs text-[#6B7280]">
                        <span>{participant.entryDays}日記入</span>
                        <span className="mx-1.5 text-[#E5E7EB]">|</span>
                        <span>{participant.streak}連続</span>
                      </div>
                    </div>

                    {/* Latest Log */}
                    {participant.latestLog && participant.latestLog.morningIntent && (
                      <div className="mb-3 p-2.5 bg-[#F9FAFB] rounded-xl border border-[#F3F4F6]">
                        <p className="text-[10px] text-[#9CA3AF] mb-0.5">最新 ({participant.latestLog.date})</p>
                        <p className="text-xs text-[#374151] line-clamp-2 leading-relaxed">{participant.latestLog.morningIntent}</p>
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
                      <div className="flex items-center gap-1 text-[10px] text-[#4338CA] font-medium">
                        <span>詳細</span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="9 18 15 12 9 6"/>
                        </svg>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center py-6 text-[11px] text-[#D1D5DB]">
          CORE Log — マネージャービュー
        </div>
      </div>
    </div>
  );
}
