"use client";

import { useParams } from "next/navigation";
import { getTodayJST, getCurrentHourJST } from "@/lib/date-utils";
import { BottomNav } from "@/components/BottomNav";
import Link from "next/link";
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
};

type ParticipantData = {
  id: string;
  name: string;
  department: string;
  dojoPhase: string;
  weekNum: number;
};

const energyColor: Record<string, string> = {
  excellent: "#F59E0B",
  good: "#059669",
  okay: "#9CA3AF",
  low: "#DC2626",
};

export default function ParticipantHome() {
  const params = useParams();
  const token = params.token as string;

  const [participant, setParticipant] = useState<ParticipantData | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [badges, setBadges] = useState<{ feedback: number; mission: number }>({ feedback: 0, mission: 0 });
  const [unreadFeedback, setUnreadFeedback] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/logs?token=${token}`);
        if (!res.ok) {
          setError("データの取得に失敗しました");
          return;
        }
        const data = await res.json();
        setParticipant(data.participant);
        setLogs(data.logs || []);
        if (data.badges) setBadges(data.badges);

        const fbRes = await fetch(`/api/feedback?token=${token}`);
        if (fbRes.ok) {
          const fbData = await fbRes.json();
          setUnreadFeedback(fbData.unreadCount || 0);
          setBadges((prev) => ({ ...prev, feedback: fbData.unreadCount || 0 }));
        }
      } catch {
        setError("通信エラーが発生しました");
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

  if (error || !participant) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-[#6B7280] mb-4">{error || "参加者が見つかりません"}</p>
          <a href="/" className="text-[#4338CA] font-medium hover:underline">ホームに戻る</a>
        </div>
      </div>
    );
  }

  const getGreeting = () => {
    const hour = getCurrentHourJST();
    if (hour < 12) return "おはようございます";
    if (hour < 18) return "こんにちは";
    return "お疲れさまです";
  };

  const getTodayStatus = () => {
    const today = getTodayJST();
    const todayLog = logs.find((log) => log.date === today);

    if (!todayLog || todayLog.status === "empty") {
      return { text: "今日の記入を始めましょう", sub: "朝の意図設定からスタート", href: `/p/${token}/input` };
    }
    if (todayLog.status === "morning_only") {
      return { text: "夕方の振り返りがまだです", sub: "1日の気づきを記録しましょう", href: `/p/${token}/input` };
    }
    return { text: "今日の記入が完了しました", sub: "素晴らしい一日でしたね", href: null };
  };

  const entryDays = logs.filter((log) => log.status !== "empty").length;
  const totalPossibleDays = Math.max(entryDays, 1);
  const entryRate = totalPossibleDays > 0 ? Math.round((entryDays / totalPossibleDays) * 100) : 0;

  const computeStreak = () => {
    if (logs.length === 0) return 0;
    const sortedLogs = [...logs].filter((log) => log.status !== "empty").sort((a, b) => b.date.localeCompare(a.date));
    if (sortedLogs.length === 0) return 0;
    let streak = 0;
    const todayStr = getTodayJST();
    const today = new Date(todayStr + "T00:00:00");
    for (let i = 0; i < sortedLogs.length; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() - i);
      const checkStr = checkDate.toISOString().split("T")[0];
      if (sortedLogs.some((log) => log.date === checkStr)) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  };

  const streak = computeStreak();
  const todayStatus = getTodayStatus();
  const recentLogs = logs.slice(0, 5);

  return (
    <div className="min-h-screen bg-[#F9FAFB] pb-24">
      {/* Header */}
      <div className="gradient-header text-white px-6 pt-12 pb-8 rounded-b-[2rem]">
        <div className="max-w-md mx-auto relative z-10">
          <p className="text-indigo-200 text-sm font-light tracking-wide mb-1">{getGreeting()}</p>
          <h1 className="text-2xl font-semibold tracking-tight mb-3">{participant.name}</h1>
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm px-3 py-1.5 rounded-lg text-xs font-medium text-indigo-100">
            <div className="w-1.5 h-1.5 bg-indigo-300 rounded-full"></div>
            {participant.dojoPhase || "守"}
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-5 -mt-3 space-y-4 animate-fade-up">
        {/* Unread Feedback Banner */}
        {unreadFeedback > 0 && (
          <Link href={`/p/${token}/feedback`}>
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 p-4 rounded-2xl flex items-center gap-3 cursor-pointer hover:shadow-md transition-all">
              <div className="bg-amber-500 text-white rounded-xl w-10 h-10 flex items-center justify-center flex-shrink-0 font-semibold text-sm">
                {unreadFeedback}
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm text-[#111827]">新しいフィードバック</p>
                <p className="text-xs text-[#6B7280] mt-0.5">タップして確認</p>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </div>
          </Link>
        )}

        {/* Today CTA Card */}
        {todayStatus.href ? (
          <Link href={todayStatus.href}>
            <div className="bg-[#111827] text-white p-5 rounded-2xl cursor-pointer hover:bg-[#1F2937] transition-all shadow-lg">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-gray-400 text-xs font-medium tracking-wide uppercase mb-1">Today</p>
                  <p className="text-lg font-semibold tracking-tight">{todayStatus.text}</p>
                  <p className="text-gray-400 text-xs mt-1">{todayStatus.sub}</p>
                </div>
                <div className="bg-white/10 rounded-xl p-2.5">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                </div>
              </div>
              <div className="bg-white/10 rounded-xl py-2.5 text-center text-sm font-medium">
                記入する
              </div>
            </div>
          </Link>
        ) : (
          <div className="bg-gradient-to-br from-emerald-50 to-green-50 border border-emerald-200 p-5 rounded-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <div>
                <p className="font-semibold text-[#111827]">{todayStatus.text}</p>
                <p className="text-xs text-[#6B7280] mt-0.5">{todayStatus.sub}</p>
              </div>
            </div>
          </div>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="card p-4 text-center">
            <div className="text-2xl font-bold text-[#111827] tracking-tight">{entryDays}</div>
            <div className="text-[10px] text-[#9CA3AF] font-medium tracking-wide uppercase mt-1">記入日数</div>
          </div>
          <div className="bg-[#EEF2FF] border border-indigo-200 p-4 rounded-2xl text-center">
            <div className="text-2xl font-bold text-[#4338CA] tracking-tight">{entryRate}%</div>
            <div className="text-[10px] text-[#6366F1] font-medium tracking-wide uppercase mt-1">記入率</div>
          </div>
          <div className="card p-4 text-center">
            <div className="text-2xl font-bold text-[#111827] tracking-tight">
              {streak > 0 ? streak : "0"}
            </div>
            <div className="text-[10px] text-[#9CA3AF] font-medium tracking-wide uppercase mt-1">
              {streak > 0 ? "連続" : "連続"}
            </div>
            {streak >= 3 && <div className="w-1 h-1 bg-amber-400 rounded-full mx-auto mt-1.5"></div>}
          </div>
        </div>

        {/* Energy Chart */}
        {logs.length > 0 && (
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-sm text-[#111827]">エネルギーの推移</h3>
              <span className="text-[10px] text-[#9CA3AF] font-medium">直近10日</span>
            </div>
            <div className="flex items-end gap-1.5 h-24">
              {logs.slice(0, 10).reverse().map((log) => {
                const heightMap: Record<string, string> = {
                  excellent: "h-full",
                  good: "h-3/4",
                  okay: "h-1/2",
                  low: "h-1/4",
                };
                const height = log.energy ? heightMap[log.energy] : "h-[6px]";
                const color = log.energy ? energyColor[log.energy] : "#E5E7EB";
                return (
                  <div key={log.id} className="flex-1 flex items-end justify-center">
                    <div
                      className={`w-full ${height} rounded-md transition-all`}
                      style={{ backgroundColor: color, minHeight: "4px" }}
                    ></div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-3 px-0.5">
              <span className="text-[9px] text-[#D1D5DB]">10日前</span>
              <span className="text-[9px] text-[#D1D5DB]">今日</span>
            </div>
          </div>
        )}

        {/* Recent Logs */}
        <div className="card overflow-hidden">
          <div className="px-5 pt-5 pb-3 flex items-center justify-between">
            <h3 className="font-semibold text-sm text-[#111827]">最近のログ</h3>
            <Link href={`/p/${token}/logs`} className="text-xs text-[#4338CA] font-medium">
              すべて見る
            </Link>
          </div>
          {recentLogs.length === 0 ? (
            <p className="text-[#9CA3AF] text-sm text-center py-8 pb-10">まだログがありません</p>
          ) : (
            <div>
              {recentLogs.map((log, idx) => (
                <Link key={log.id} href={`/p/${token}/logs`}>
                  <div className={`flex gap-3 px-5 py-3.5 hover:bg-[#F9FAFB] transition-colors cursor-pointer ${
                    idx < recentLogs.length - 1 ? "border-b border-[#F3F4F6]" : ""
                  }`}>
                    <div className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-semibold ${
                      log.hasFeedback ? "bg-amber-500" : "bg-[#4338CA]"
                    }`}>
                      {log.dayNum}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#111827] truncate leading-tight">{log.morningIntent || "（未記入）"}</p>
                      <p className="text-[11px] text-[#9CA3AF] mt-1">
                        {log.date} ({log.dayOfWeek})
                      </p>
                    </div>
                    <div className="flex-shrink-0 flex items-center gap-2">
                      {log.energy && (
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: energyColor[log.energy] }}></div>
                      )}
                      {log.hasFeedback && (
                        <div className="w-1.5 h-1.5 bg-amber-400 rounded-full"></div>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <BottomNav active="home" baseUrl={`/p/${token}`} badges={badges} />
    </div>
  );
}
