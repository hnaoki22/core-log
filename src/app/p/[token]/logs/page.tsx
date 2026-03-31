"use client";

import { useParams } from "next/navigation";
import { energyEmoji } from "@/lib/mock-data";
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
      <div className="min-h-screen bg-[#F8F7FF] flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-8 h-8 border-3 border-[#5B4FD6] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[#8B85A8]">読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F7FF] pb-24">
      {/* Header */}
      <div className="gradient-purple text-white p-6 rounded-b-3xl">
        <div className="max-w-md mx-auto">
          <h1 className="text-2xl font-bold">📋 ログ一覧</h1>
        </div>
      </div>

      <div className="max-w-md mx-auto px-6 pt-6">
        {logs.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-[#8B85A8]">まだログがありません</p>
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div key={log.id} className="bg-white rounded-xl overflow-hidden shadow-sm">
                <button
                  onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                  className="w-full p-4 flex gap-3 hover:bg-[#F8F7FF] transition-colors text-left"
                >
                  {/* Date Circle */}
                  <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-white text-sm font-bold ${
                    log.hasFeedback ? "bg-[#FF8C42]" : "bg-[#5B4FD6]"
                  }`}>
                    <div className="text-center">
                      <div className="font-bold">{log.dayNum}</div>
                      <div className="text-xs opacity-80">{log.dayOfWeek}</div>
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#1E1B3A] font-medium truncate">
                      {log.morningIntent || "(未記入)"}
                    </p>
                    <p className="text-xs text-[#8B85A8] mt-1">{log.date}</p>
                    <div className="flex gap-2 mt-2">
                      {log.energy && <span className="text-lg">{energyEmoji[log.energy]}</span>}
                      {log.status === "morning_only" && (
                        <span className="inline-block px-2 py-0.5 bg-[#EDE9FF] text-[#5B4FD6] text-xs rounded font-medium">
                          朝のみ
                        </span>
                      )}
                      {log.status === "complete" && (
                        <span className="inline-block px-2 py-0.5 bg-[#E0F7E0] text-[#22C55E] text-xs rounded font-medium">
                          完了
                        </span>
                      )}
                      {log.hasFeedback && (
                        <span className="inline-block px-2 py-0.5 bg-[#FFE8D0] text-[#FF8C42] text-xs rounded font-medium">
                          FB済
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex-shrink-0 flex items-center justify-center w-6 h-6 text-[#8B85A8]">
                    {expandedId === log.id ? "▼" : "▶"}
                  </div>
                </button>

                {/* Expanded View */}
                {expandedId === log.id && (
                  <div className="border-t border-[#E8E5F0] p-4 bg-[#F8F7FF]/50 space-y-4">
                    {/* Morning Intent */}
                    <div>
                      <p className="text-xs font-semibold text-[#8B85A8] mb-1">朝の意図</p>
                      <p className="text-sm text-[#1E1B3A]">
                        {log.morningIntent || "(未記入)"}
                      </p>
                    </div>

                    {/* Evening Insight */}
                    {log.eveningInsight && (
                      <div>
                        <p className="text-xs font-semibold text-[#8B85A8] mb-1">夜の振り返り</p>
                        <p className="text-sm text-[#1E1B3A]">{log.eveningInsight}</p>
                      </div>
                    )}

                    {/* Energy */}
                    {log.energy && (
                      <div>
                        <p className="text-xs font-semibold text-[#8B85A8] mb-1">エネルギー</p>
                        <p className="text-lg">{energyEmoji[log.energy]}</p>
                      </div>
                    )}

                    {/* Manager Comment */}
                    {log.managerComment && (
                      <div className="bg-[#EDE9FF] border border-[#5B4FD6] p-3 rounded-lg">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-xs font-semibold text-[#5B4FD6]">上司コメント</p>
                          {log.managerCommentTime && (
                            <span className="text-[10px] text-[#8B85A8]">🕐 {formatTime(log.managerCommentTime)}</span>
                          )}
                        </div>
                        <p className="text-sm text-[#1E1B3A]">{log.managerComment}</p>
                      </div>
                    )}

                    {/* HM Feedback */}
                    {log.hmFeedback && (
                      <div className="bg-[#FFE8D0] border border-[#FF8C42] p-3 rounded-lg">
                        <p className="text-xs font-semibold text-[#FF8C42] mb-1">HMフィードバック</p>
                        <p className="text-sm text-[#1E1B3A]">{log.hmFeedback}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <BottomNav active="logs" baseUrl={`/p/${token}`} badges={badges} />
    </div>
  );
}
