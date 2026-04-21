"use client";

import { useParams } from "next/navigation";
import { getTodayJST, getCurrentHourJST, formatDateTimeJST } from "@/lib/date-utils";
import { BottomNav } from "@/components/BottomNav";
import { useFeatures } from "@/lib/use-features";
import Link from "next/link";
import { useState, useEffect } from "react";

/** Format datetime string to "2026/6/10 08:30" in JST */
const formatDateTime = formatDateTimeJST;

type LogEntry = {
  id: string;
  date: string;
  datetime?: string;
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
  excellent: "#C17817",
  good: "#2D6A4F",
  okay: "#8B8489",
  low: "#8B1A2B",
};

const energyEmoji: Record<string, string> = {
  excellent: "🔥",
  good: "😊",
  okay: "😐",
  low: "😞",
};

export default function ParticipantHome() {
  const params = useParams();
  const token = params.token as string;

  const [participant, setParticipant] = useState<ParticipantData | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [badges, setBadges] = useState<{ feedback: number; feedbackTotal: number; mission: number }>({ feedback: 0, feedbackTotal: 0, mission: 0 });
  const [unreadFeedback, setUnreadFeedback] = useState(0);
  const [serverStats, setServerStats] = useState<{
    entryDays: number; completeDays: number; completionRate: number;
    streak: number; todayStatus: string; businessDaysElapsed: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { isOn } = useFeatures(); // features hook is still used by BottomNav via context

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch logs and feedback in parallel instead of sequentially
        const [res, fbRes] = await Promise.all([
          fetch(`/api/logs?token=${token}`),
          fetch(`/api/feedback?token=${token}`),
        ]);

        if (!res.ok) {
          setError("データの取得に失敗しました");
          return;
        }
        const data = await res.json();
        setParticipant(data.participant);
        setLogs(data.logs || []);
        if (data.stats) setServerStats(data.stats);
        if (data.badges) setBadges(data.badges);

        if (fbRes.ok) {
          const fbData = await fbRes.json();
          setUnreadFeedback(fbData.unreadCount || 0);
          setBadges((prev) => ({
            ...prev,
            feedback: fbData.unreadCount || 0,
            feedbackTotal: fbData.totalCount || 0,
          }));
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
      <div className="min-h-screen bg-[#F5F0EB] flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#1A1A2E] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[#8B8489] text-sm">データを準備しています...</p>
        </div>
      </div>
    );
  }

  if (error || !participant) {
    return (
      <div className="min-h-screen bg-[#F5F0EB] flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-[#5B5560] mb-4">{error || "ページを読み込めませんでした。再度お試しください。"}</p>
          <button onClick={() => window.location.reload()} className="text-[#1A1A2E] font-medium hover:underline">再読み込み</button>
        </div>
      </div>
    );
  }

  const getGreeting = () => {
    const hour = getCurrentHourJST();
    if (hour < 4) return "お疲れさまです";   // 深夜帯
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
      return { text: "本日の振り返りがまだです", sub: "1日の気づきを記録しましょう", href: `/p/${token}/input` };
    }
    return { text: "今日の記入が完了しました", sub: "素晴らしい一日でしたね", href: null };
  };

  // Use server-computed stats (same logic as admin/manager dashboards)
  const entryDays = serverStats?.entryDays ?? logs.filter((log) => log.status !== "empty").length;
  const entryRate = serverStats?.completionRate ?? 0;
  const streak = serverStats?.streak ?? 0;
  const todayStatus = getTodayStatus();
  const recentLogs = logs.slice(0, 5);

  // Energy chart data
  const chartLogs = logs.slice(0, 10).reverse();
  const energyValue: Record<string, number> = { excellent: 4, good: 3, okay: 2, low: 1 };
  const chartWidth = 300;
  const chartHeight = 100;
  const paddingX = 20;
  const paddingTop = 8;
  const paddingBottom = 8;
  const plotWidth = chartWidth - paddingX * 2;
  const plotHeight = chartHeight - paddingTop - paddingBottom;
  const chartPoints = chartLogs.map((log, i) => {
    const x = chartLogs.length === 1 ? chartWidth / 2 : paddingX + (i / (chartLogs.length - 1)) * plotWidth;
    const val = log.energy ? energyValue[log.energy] : 0;
    const y = val > 0 ? paddingTop + plotHeight - ((val - 1) / 3) * plotHeight : paddingTop + plotHeight;
    return { x, y, log, val };
  }).filter(p => p.val > 0);
  const linePath = chartPoints.length > 1
    ? chartPoints.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ")
    : "";
  const areaPath = chartPoints.length > 1
    ? `${linePath} L${chartPoints[chartPoints.length - 1].x},${paddingTop + plotHeight} L${chartPoints[0].x},${paddingTop + plotHeight} Z`
    : "";

  return (
    <div className="min-h-screen bg-[#F5F0EB] pb-24">
      {/* Header */}
      <div className="gradient-header text-white px-6 pt-12 pb-6">
        <div className="max-w-md mx-auto relative z-10">
          <p className="text-indigo-200 text-sm font-light tracking-wide mb-1">{getGreeting()}</p>
          <h1 className="text-2xl font-semibold tracking-tight mb-3">{participant.name}</h1>
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm px-3 py-1.5 rounded-lg text-xs font-medium text-indigo-100">
            <div className="w-1.5 h-1.5 bg-indigo-300 rounded-full"></div>
            {participant.dojoPhase || "守"}
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-5 pt-5 space-y-4 animate-fade-up relative z-10">
        {/* Unread Feedback Banner */}
        {/* フィードバック機能がOFFでも未読があれば表示（HM送信分は常に表示） */}
        {unreadFeedback > 0 && (
          <Link href={`/p/${token}/feedback`}>
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 p-4 rounded-2xl flex items-center gap-3 cursor-pointer hover:shadow-md transition-all">
              <div className="bg-amber-500 text-white rounded-xl w-10 h-10 flex items-center justify-center flex-shrink-0 font-semibold text-sm">
                {unreadFeedback}
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm text-[#1A1A2E]">新しいフィードバック</p>
                <p className="text-xs text-[#5B5560] mt-0.5">タップして確認</p>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8B8489" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </div>
          </Link>
        )}

        {/* Today CTA Card */}
        {todayStatus.href ? (
          <Link href={todayStatus.href}>
            <div className="bg-[#1A1A2E] text-white p-5 rounded-2xl cursor-pointer hover:bg-[#141423] transition-all shadow-lg">
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
                <p className="font-semibold text-[#1A1A2E]">{todayStatus.text}</p>
                <p className="text-xs text-[#5B5560] mt-0.5">{todayStatus.sub}</p>
              </div>
            </div>
          </div>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="card p-4 text-center">
            <div className="text-2xl font-bold text-[#1A1A2E] tracking-tight">{entryDays}</div>
            <div className="text-[10px] text-[#8B8489] font-medium tracking-wide uppercase mt-1">記入日数</div>
          </div>
          <div className="bg-[#F2F2F7] border border-indigo-200 p-4 rounded-2xl text-center">
            <div className="text-2xl font-bold text-[#1A1A2E] tracking-tight">{entryRate}%</div>
            <div className="text-[10px] text-[#4D4D6D] font-medium tracking-wide uppercase mt-1">記入率</div>
          </div>
          <div className="card p-4 text-center">
            <div className="text-2xl font-bold text-[#1A1A2E] tracking-tight">
              {streak > 0 ? streak : "0"}
            </div>
            <div className="text-[10px] text-[#8B8489] font-medium tracking-wide uppercase mt-1">
              {streak > 0 ? "連続" : "連続"}
            </div>
            {streak >= 3 && <div className="w-1 h-1 bg-amber-400 rounded-full mx-auto mt-1.5"></div>}
          </div>
        </div>

        {/* Streak & Insights Cards */}
        {logs.length > 0 && (() => {
          // Energy trend analysis
          const recentEnergies = logs.slice(0, 5).map(l => l.energy ? energyValue[l.energy] : 0).filter(v => v > 0);
          const olderEnergies = logs.slice(5, 10).map(l => l.energy ? energyValue[l.energy] : 0).filter(v => v > 0);
          const recentAvg = recentEnergies.length > 0 ? recentEnergies.reduce((a, b) => a + b, 0) / recentEnergies.length : 0;
          const olderAvg = olderEnergies.length > 0 ? olderEnergies.reduce((a, b) => a + b, 0) / olderEnergies.length : 0;
          const energyTrend = olderEnergies.length >= 2 ? (recentAvg - olderAvg) : 0;
          const energyTrendLabel = energyTrend > 0.3 ? "上昇傾向" : energyTrend < -0.3 ? "低下傾向" : "安定";
          const energyTrendIcon = energyTrend > 0.3 ? "↑" : energyTrend < -0.3 ? "↓" : "→";
          const energyTrendColor = energyTrend > 0.3 ? "text-emerald-600" : energyTrend < -0.3 ? "text-red-500" : "text-blue-500";
          const energyTrendBg = energyTrend > 0.3 ? "from-emerald-50 to-green-50 border-emerald-200" : energyTrend < -0.3 ? "from-red-50 to-orange-50 border-red-200" : "from-blue-50 to-indigo-50 border-blue-200";

          // Completion rate for this week
          const todayStr = getTodayJST();
          const todayDate = new Date(todayStr + "T00:00:00");
          const dayOfWeek = todayDate.getDay();
          const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
          const monday = new Date(todayDate);
          monday.setDate(monday.getDate() - mondayOffset);
          const thisWeekLogs = logs.filter(l => {
            const ld = new Date(l.date + "T00:00:00");
            return ld >= monday && ld <= todayDate && l.status !== "empty";
          });
          const weekDaysPassed = mondayOffset + 1;
          const weekCompletionRate = Math.round((thisWeekLogs.length / Math.min(weekDaysPassed, 5)) * 100);

          return (
            <div className="grid grid-cols-2 gap-3">
              {/* Streak Card */}
              <div className={`p-4 rounded-2xl border ${streak >= 7 ? "bg-gradient-to-br from-amber-50 to-yellow-50 border-amber-200" : streak >= 3 ? "bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-200" : "card"}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{streak >= 7 ? "🔥" : streak >= 3 ? "✨" : "📝"}</span>
                  <span className="text-[10px] font-semibold text-[#5B5560] uppercase tracking-wide">連続記入</span>
                </div>
                <div className={`text-2xl font-bold tracking-tight ${streak >= 7 ? "text-amber-600" : streak >= 3 ? "text-[#1A1A2E]" : "text-[#1A1A2E]"}`}>
                  {streak}日
                </div>
                <p className="text-[10px] text-[#8B8489] mt-1">
                  {streak >= 7 ? "素晴らしい継続力!" : streak >= 3 ? "いい調子です!" : streak > 0 ? "続けていきましょう" : "今日から始めましょう"}
                </p>
              </div>

              {/* Energy Trend Card */}
              <div className={`p-4 rounded-2xl border bg-gradient-to-br ${energyTrendBg}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-lg font-bold ${energyTrendColor}`}>{energyTrendIcon}</span>
                  <span className="text-[10px] font-semibold text-[#5B5560] uppercase tracking-wide">エネルギー</span>
                </div>
                <div className={`text-lg font-bold tracking-tight ${energyTrendColor}`}>
                  {energyTrendLabel}
                </div>
                <p className="text-[10px] text-[#8B8489] mt-1">
                  今週の記入率 {weekCompletionRate}%
                </p>
              </div>
            </div>
          );
        })()}

        {/* Energy Chart - Line Graph */}
        {logs.length > 0 && (
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm text-[#1A1A2E]">エネルギーの推移</h3>
              <span className="text-[10px] text-[#8B8489] font-medium">直近{chartLogs.length}日</span>
            </div>

            <div className="relative">
              <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between py-2 text-[9px] text-[#C9BDAE] pointer-events-none" style={{ width: "16px" }}>
                <span>🔥</span>
                <span>😊</span>
                <span>😐</span>
                <span>😞</span>
              </div>

              <svg
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                className="w-full"
                style={{ height: "120px", marginLeft: "4px" }}
                preserveAspectRatio="none"
              >
                {[0, 1, 2, 3].map((i) => {
                  const gridY = paddingTop + (i / 3) * plotHeight;
                  return (
                    <line key={i} x1={paddingX} y1={gridY} x2={chartWidth - paddingX} y2={gridY}
                      stroke="#EFE8DD" strokeWidth="0.5" />
                  );
                })}

                {areaPath && (
                  <path d={areaPath} fill="url(#energyGradient)" opacity="0.3" />
                )}

                {linePath && (
                  <path d={linePath} fill="none" stroke="#1A1A2E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                )}

                {chartPoints.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r="3.5"
                    fill={p.log.energy ? energyColor[p.log.energy] : "#E5DCD0"}
                    stroke="white" strokeWidth="1.5" />
                ))}

                <defs>
                  <linearGradient id="energyGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1A1A2E" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#1A1A2E" stopOpacity="0.02" />
                  </linearGradient>
                </defs>
              </svg>
            </div>

            <div className="flex justify-between mt-1 px-5">
              {chartLogs.map((log, i) => (
                <span key={i} className="text-xs leading-none text-center" style={{ width: `${100 / chartLogs.length}%` }}>
                  {log.energy ? energyEmoji[log.energy] : ""}
                </span>
              ))}
            </div>

            <div className="flex justify-between mt-1.5 px-5">
              {chartLogs.length >= 2 && (
                <>
                  <span className="text-[9px] text-[#C9BDAE]">{chartLogs[0]?.date?.slice(5) || ""}</span>
                  <span className="text-[9px] text-[#C9BDAE]">{chartLogs[chartLogs.length - 1]?.date?.slice(5) || ""}</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Feature Menu Section */}
        <div>
          <h3 className="font-semibold text-sm text-[#1A1A2E] mb-3">機能メニュー</h3>

          {/* 内省深化 */}
          {(() => {
            const features = [
              { key: "tier-s.ruminationDetection", label: "反芻分析", icon: "🧠", path: "rumination" },
              { key: "tier-s.weeklyConceptualization", label: "週次コンセプト", icon: "💡", path: "conceptualize" },
              { key: "tier-c.unlearnChallenge", label: "アンラーン", icon: "🔄", path: "unlearn" },
              { key: "tier-c.identityTracking", label: "自分の変化", icon: "🌱", path: "identity" },
            ];
            const enabledFeatures = features.filter(f => isOn(f.key));
            return enabledFeatures.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-[#5B5560] tracking-wide uppercase mb-2 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-[#1A1A2E] rounded-full"></div>
                  内省深化
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {enabledFeatures.map(f => (
                    <Link key={f.key} href={`/p/${token}/features/${f.path}`}>
                      <div className="card p-3 text-center hover:bg-[#FBF8F4] transition-colors cursor-pointer">
                        <div className="text-xl mb-1">{f.icon}</div>
                        <p className="text-xs font-medium text-[#1A1A2E]">{f.label}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* 成長測定 */}
          {(() => {
            const features = [
              { key: "tier-d.heroAssessment", label: "HERO自己評価", icon: "📊", path: "hero" },
              { key: "tier-d.efficacyBooster", label: "効力感", icon: "💪", path: "efficacy" },
              { key: "tier-d.hopeDesign", label: "希望設計", icon: "🎯", path: "hope" },
              { key: "tier-f.beforeAfter", label: "ビフォー・アフター", icon: "📈", path: "before-after" },
            ];
            const enabledFeatures = features.filter(f => isOn(f.key));
            return enabledFeatures.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-[#5B5560] tracking-wide uppercase mb-2 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-[#1A1A2E] rounded-full"></div>
                  成長測定
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {enabledFeatures.map(f => (
                    <Link key={f.key} href={`/p/${token}/features/${f.path}`}>
                      <div className="card p-3 text-center hover:bg-[#FBF8F4] transition-colors cursor-pointer">
                        <div className="text-xl mb-1">{f.icon}</div>
                        <p className="text-xs font-medium text-[#1A1A2E]">{f.label}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* 組織学習 */}
          {(() => {
            const features = [
              { key: "tier-b.peerReflection", label: "ピア振り返り", icon: "👥", path: "peer" },
              { key: "tier-b.aar", label: "AAR", icon: "📋", path: "aar" },
              { key: "tier-c.outsightTask", label: "アウトサイト", icon: "🔍", path: "outsight" },
            ];
            const enabledFeatures = features.filter(f => isOn(f.key));
            return enabledFeatures.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-[#5B5560] tracking-wide uppercase mb-2 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-[#1A1A2E] rounded-full"></div>
                  組織学習
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {enabledFeatures.map(f => (
                    <Link key={f.key} href={`/p/${token}/features/${f.path}`}>
                      <div className="card p-3 text-center hover:bg-[#FBF8F4] transition-colors cursor-pointer">
                        <div className="text-xl mb-1">{f.icon}</div>
                        <p className="text-xs font-medium text-[#1A1A2E]">{f.label}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Recent Logs */}
        <div className="card overflow-hidden">
          <div className="px-5 pt-5 pb-3 flex items-center justify-between">
            <h3 className="font-semibold text-sm text-[#1A1A2E]">最近のログ</h3>
            <Link href={`/p/${token}/logs`} className="text-xs text-[#1A1A2E] font-medium">
              すべて見る
            </Link>
          </div>
          {recentLogs.length === 0 ? (
            <p className="text-[#8B8489] text-sm text-center py-8 pb-10">まだログがありません</p>
          ) : (
            <div>
              {recentLogs.map((log, idx) => (
                <Link key={log.id} href={`/p/${token}/logs`}>
                  <div className={`flex gap-3 px-5 py-3.5 hover:bg-[#F5F0EB] transition-colors cursor-pointer ${
                    idx < recentLogs.length - 1 ? "border-b border-[#EFE8DD]" : ""
                  }`}>
                    <div className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-semibold ${
                      log.hasFeedback ? "bg-amber-500" : "bg-[#1A1A2E]"
                    }`}>
                      {log.dayNum}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#1A1A2E] truncate leading-tight">{log.morningIntent || "（未記入）"}</p>
                      <p className="text-[11px] text-[#8B8489] mt-1">
                        {formatDateTime(log.datetime, log.date)} ({log.dayOfWeek})
                      </p>
                    </div>
                    <div className="flex-shrink-0 flex items-center gap-2">
                      {log.energy && (
                        <span className="text-base leading-none">{energyEmoji[log.energy]}</span>
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
