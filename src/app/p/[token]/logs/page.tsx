"use client";

import { useParams } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { useState, useEffect } from "react";

type LogEntry = {
  id: string;
  date: string;
  dayOfWeek: string;
  dayNum: number;
  morningIntent: string;
  eveningInsight: string | null;
  energy: "excellent" | "good" | "okay" | "low" | null;
  status: "complete" | "morning_only" | "empty" | "fb_done";
  hasFeedback: boolean;
  hmFeedback?: string | null;
  managerComment?: string | null;
  managerCommentTime?: string | null;
  morningTime?: string | null;
  eveningTime?: string | null;
};

const energyEmoji: Record<string, string> = {
  excellent: "🔥",
  good: "😊",
  okay: "😐",
  low: "😞",
};

const energyLabel: Record<string, string> = {
  excellent: "絶好調",
  good: "良い",
  okay: "まあまあ",
  low: "低調",
};

function formatTime(isoStr: string | null | undefined): string {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    const h = d.getUTCHours().toString().padStart(2, "0");
    const m = d.getUTCMinutes().toString().padStart(2, "0");
    return `${h}:${m}`;
  } catch { return ""; }
}

export default function LogsPage() {
  const params = useParams();
  const token = params.token as string;

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [badges, setBadges] = useState<{ feedback: number; mission: number }>({ feedback: 0, mission: 0 });
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchLogs() {
      try {
        const res = await fetch(`/api/logs?token=${token}`);
        if (res.ok) {
          const data = await res.json();
          setLogs(data.logs || []);
          if (data.badges) setBadges(data.badges);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchLogs();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#4338CA] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[#9CA3AF] text-sm">データを準備しています...</p>
        </div>
      </div>
    );
  }

  const statusConfig = {
    morning_only: { label: "朝のみ", bg: "bg-indigo-50", text: "text-[#4338CA]" },
    complete: { label: "完了", bg: "bg-emerald-50", text: "text-emerald-600" },
    fb_done: { label: "FB済", bg: "bg-amber-50", text: "text-amber-600" },
    empty: { label: "未記入", bg: "bg-gray-50", text: "text-gray-400" },
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB] pb-24">
      {/* Header */}
      <div className="gradient-header text-white px-6 pt-12 pb-6 rounded-b-[2rem]">
        <div className="max-w-md mx-auto relative z-10">
          <h1 className="text-xl font-semibold tracking-tight">ログ一覧</h1>
          <p className="text-indigo-200 text-sm mt-1 font-light">{logs.length}件の記録</p>
        </div>
      </div>

      <div className="max-w-md mx-auto px-5 pt-5 animate-fade-up relative z-10">
        {logs.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-12 h-12 bg-[#F3F4F6] rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
            </div>
            <p className="text-[#6B7280] text-sm">まだログがありません</p>
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => {
              const config = statusConfig[log.status] || statusConfig.empty;
              return (
                <div key={log.id} className="card overflow-hidden">
                  <button
                    onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                    className="w-full p-4 flex gap-3 hover:bg-[#FAFAFA] transition-colors text-left"
                  >
                    <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-white text-xs font-semibold ${
                      log.hasFeedback ? "bg-amber-500" : "bg-[#4338CA]"
                    }`}>
                      <div className="text-center leading-tight">
                        <div className="font-bold text-sm">{log.dayNum}</div>
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#111827] font-medium truncate leading-tight">
                        {log.morningIntent || "(未記入)"}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[11px] text-[#9CA3AF]">{log.date} ({log.dayOfWeek})</span>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${config.bg} ${config.text}`}>
                          {config.label}
                        </span>
                      </div>
                    </div>

                    <div className="flex-shrink-0 flex items-center gap-2">
                      {log.energy && (
                        <span className="text-base leading-none">{energyEmoji[log.energy]}</span>
                      )}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        className={`transition-transform duration-200 ${expandedId === log.id ? "rotate-90" : ""}`}>
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                    </div>
                  </button>

                  {/* Expanded View */}
                  {expandedId === log.id && (
                    <div className="border-t border-[#F3F4F6] p-4 bg-[#FAFAFA] space-y-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-[10px] font-medium text-[#4338CA] tracking-wide uppercase">朝の意図</p>
                          {log.morningTime && (
                            <span className="text-[10px] text-[#D1D5DB]">{formatTime(log.morningTime)}</span>
                          )}
                        </div>
                        <p className="text-sm text-[#374151] leading-relaxed">{log.morningIntent || "(未記入)"}</p>
                      </div>

                      {log.eveningInsight && (
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-[10px] font-medium text-amber-600 tracking-wide uppercase">夜の振り返り</p>
                            {log.eveningTime && (
                              <span className="text-[10px] text-[#D1D5DB]">{formatTime(log.eveningTime)}</span>
                            )}
                          </div>
                          <p className="text-sm text-[#374151] leading-relaxed">{log.eveningInsight}</p>
                        </div>
                      )}

                      {log.energy && (
                        <div className="flex items-center gap-2">
                          <span className="text-base leading-none">{energyEmoji[log.energy]}</span>
                          <span className="text-xs text-[#6B7280]">{energyLabel[log.energy]}</span>
                        </div>
                      )}

                      {log.managerComment && (
                        <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-xl">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-[10px] font-medium text-[#4338CA] tracking-wide">上司コメント</p>
                            {log.managerCommentTime && (
                              <span className="text-[10px] text-[#D1D5DB]">{formatTime(log.managerCommentTime)}</span>
                            )}
                          </div>
                          <p className="text-sm text-[#374151] leading-relaxed">{log.managerComment}</p>
                        </div>
                      )}

                      {log.hmFeedback && (
                        <div className="bg-amber-50 border border-amber-100 p-3 rounded-xl">
                          <p className="text-[10px] font-medium text-amber-600 tracking-wide mb-1">HMフィードバック</p>
                          <p className="text-sm text-[#374151] leading-relaxed">{log.hmFeedback}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <BottomNav active="logs" baseUrl={`/p/${token}`} badges={badges} />
    </div>
  );
}
