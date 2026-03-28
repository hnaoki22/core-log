"use client";

import { useParams } from "next/navigation";
import { getParticipantByToken, energyEmoji } from "@/lib/mock-data";
import { BottomNav } from "A/components/BottomNav";
import Link from "next/link";

export default function ParticipantHome() {
  const params = useParams();
  const token = params.token as string;
  const participant = getParticipantByToken(token);

  if (!participant) {
    return (
      <div className="min-h-screen bg-[#F8F7FF] flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-[#8B85A8] mb-4">参加者が見つかりません</p>
          <a href="/" className="text-[#5B4FD6] font-semibold hover:underline">
            ホームに戻る
          </a>
        </div>
      </div>
    );
  }

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "おはようございます";
    if (hour < 18) return "こんにちは";
    return "お疲れさまです";
  };

  const getTodayStatus = () => {
    const today = new Date().toISOString().split("T")[0];
    const todayLog = participant.logs.find((log) => log.date === today);

    if (!todayLog || todayLog.status === "empty") {
      return {
        text: "今日の記入を始めましょう",
        href: `/p/${token}/input`,
      };
    }

    if (todayLog.status === "morning_only") {
      return {
        text: "夕方の振り返りがまだです",
        href: `/p/${token}/input`,
      };
    }

    return {
      text: "今日の記入が完了しました",
      href: null,
    };
  };

  const todayStatus = getTodayStatus();
  const recentLogs = participant.logs.slice(0, 5);
  const entryDays = participant.logs.filter((log) => log.status !== "empty").length;

  return (
    <div className="min-h-screen bg-[#F8F7FF] pb-24">
      {/* Header */}
      <div className="gradient-purple text-white p-6 rounded-b-3xl">
        <div className="max-w-md mx-auto">
          <p className="text-sm opacity-90 mb-2">{getGreeting()}</p>
          <h1 className="text-2xl font-bold mb-1">{participant.name}</h1>
          <div className="inline-block bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full text-sm">
            {participant.dojoPhase}
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-6 pt-6 space-y-6">
        {/* Today CTA Card */}
        {todayStatus.href ? (
          <Link href={todayStatus.href}>
            <div className="gradient-purple text-white p-6 rounded-xl shadow-md cursor-pointer hover:shadow-lg transition-shadow">
              <p className="text-sm opacity-90 mb-2">今日の状態</p>
              <p className="text-lg font-semibold mb-4">{todayStatus.text}</p>
              <button className="w-full bg-white/20 backdrop-blur-sm text-white py-2 rounded-lg font-medium hover:bg-white/30 transition-colors">
                記入する
              </button>
            </div>
          </Link>
        ) : (
          <div className="gradient-purple text-white p-6 rounded-xl shadow-md opacity-75">
            <p className="text-sm opacity-90 mb-2">今日の状態</p>
            <p className="text-lg font-semibold">{todayStatus.text}</p>
          </div>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white p-4 rounded-xl text-center">
            <div className="text-2xl font-bold text-[#5B4FD6] mb-1">{entryDays}</div>
            <div className="text-xs text-[#8B85A8]">記入日数</div>
          </div>
          <div className="bg-white p-4 rounded-xl text-center border-2 border-[#5B4FD6]">
            <div className="text-2xl font-bold text-[#5B4FD6] mb-1">{participant.entryRate}%</div>
            <div className="text-xs text-[#8B85A8]">記入率</div>
          </div>
          <div className="bg-white p-4 rounded-xl text-center">
            <div className="text-2xl font-bold text-[#FF8C42] mb-1">
              {participant.streak > 0 ? `${participant.streak}` : "0"}
              {participant.streak > 0 ? "🔥" : ""}
            </div>
            <div className="text-xs text-[#8B85A8]">連続</div>
          </div>
        </div>

        {/* Energy Chart */}
        <div className="bg-white p-4 rounded-xl">
          <h3 className="font-semibold text-[#1E1B3A] mb-4">エネルギーの推移</h3>
          <div className="flex items-end gap-1 h-32">
            {participant.logs.slice(0, 10).reverse().map((log) => {
              const energyMap: Record<string, { height: string; bg: string }> = {
                excellent: { height: "h-full", bg: "bg-[#FF8C42]" },
                good: { height: "h-3/4", bg: "bg-[#22C55E]" },
                okay: { height: "h-1/2", bg: "bg-[#8B85A8]" },
                low: { height: "h-1/4", bg: "bg-[#FF8C42] opacity-40" },
              };
              const config = log.energy ? energyMap[log.energy] : { height: "h-1/12", bg: "bg-[#E8E5F0]" };
              return (
                <div key={log.id} className="flex-1 flex items-end justify-center">
                  <div className={`w-full ${config.height} ${config.bg} rounded-t`}></div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Logs */}
        <div className="bg-white p-4 rounded-xl">
          <h3 className="font-semibold text-[#1E1B3A] mb-4">最近のログ</h3>
          <div className="space-y-3">
            {recentLogs.map((log) => (
              <Link key={log.id} href={`/p/${token}/logs`}>
                <div className="flex gap-3 p-3 rounded-lg hover:bg-[#F8F7FF] transition-colors cursor-pointer">
                  <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-semibold ${
                    log.hasFeedback ? "bg-[#FF8C42]" : "bg-[#5B4FD6]"
                  }`}>
                    {log.dayNum}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#1E1B3A] truncate">{log.morningIntent || "（未記入）"}</p>
                    <p className="text-xs text-[#8B85A8] mt-1">
                      {log.date} ({log.dayOfWeek})
                    </p>
                  </div>
                  <div className="flex-shrink-0 flex items-center gap-2">
                    {log.energy && <span className="text-lg">{energyEmoji[log.energy]}</span>}
                    {log.hasFeedback && <div className="w-2 h-2 bg-[#FF8C42] rounded-full"></div>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <BottomNav active="home" baseUrl={`/p/${token}`} />
    </div>
  );
}
