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
        if (!res.ok) {
          setError("上司が見つかりません");
          return;
        }
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
      <div className="min-h-screen bg-[#F8F7FF] flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-8 h-8 border-3 border-[#5B4FD6] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[#8B85A8]">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#F8F7FF] flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-[#8B85A8] mb-4">{error || "上司が見つかりません"}</p>
          <a href="/" className="text-[#5B4FD6] font-semibold hover:underline">
            ホームに戻る
          </a>
        </div>
      </div>
    );
  }

  const { manager, participants } = data;

  // Calculate summary stats from real data
  const totalParticipants = participants.length;
  const avgEntryRate =
    participants.length > 0
      ? Math.round(
          participants.reduce((sum, p) => sum + p.entryRate, 0) /
            participants.length
        )
      : 0;
  const fbWaitingCount = participants.reduce((sum, p) => {
    return sum + (p.latestLog?.status === "morning_only" ? 1 : 0);
  }, 0);

  const getStatusIndicator = (participant: ParticipantData) => {
    if (participant.streak > 0) {
      return { emoji: "🟢", label: "活動中" };
    } else if (participant.entryRate > 50) {
      return { emoji: "🟡", label: "スローダウン中" };
    } else if (participant.entryDays > 0) {
      return { emoji: "🔴", label: "注意必要" };
    } else {
      return { emoji: "⚪", label: "未開始" };
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F7FF] pb-8">
      {/* Header - Darker purple for manager */}
      <div className="bg-gradient-to-br from-[#4A3FBF] to-[#6B5FEA] text-white p-6 pb-8">
        <div className="max-w-md mx-auto">
          <div className="inline-block bg-white/25 backdrop-blur-sm px-3 py-1 rounded-full text-sm mb-3 font-medium">
            上司
          </div>
          <h1 className="text-2xl font-bold mb-1">{manager.name}</h1>
          <p className="text-sm opacity-90">上司ダッシュボード</p>
        </div>
      </div>

      <div className="max-w-md mx-auto px-6 pt-6 space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white p-4 rounded-xl text-center shadow-sm">
            <div className="text-2xl font-bold text-[#5B4FD6] mb-1">
              {totalParticipants}
            </div>
            <div className="text-xs text-[#8B85A8]">参加者数</div>
          </div>
          <div className="bg-white p-4 rounded-xl text-center shadow-sm">
            <div className="text-2xl font-bold text-[#22C55E] mb-1">
              {avgEntryRate}%
            </div>
            <div className="text-xs text-[#8B85A8]">平均記入率</div>
          </div>
          <div className="bg-white p-4 rounded-xl text-center shadow-sm border-2 border-[#FF8C42]">
            <div className="text-2xl font-bold text-[#FF8C42] mb-1">
              {fbWaitingCount}
            </div>
            <div className="text-xs text-[#8B85A8]">FB待ち</div>
          </div>
        </div>

        {/* Participant Cards */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-[#1E1B3A] px-1">
            直属部下（{participants.length}名）
          </h2>
          {participants.map((participant) => {
            const status = getStatusIndicator(participant);
            const recentEnergy = participant.recentEnergy || [];

            return (
              <Link
                key={participant.name}
                href={`/m/${token}/${encodeURIComponent(participant.name)}`}
              >
                <div className="bg-white p-4 rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                  {/* Header Row */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-semibold text-[#1E1B3A]">
                        {participant.name}
                      </h3>
                      <p className="text-xs text-[#8B85A8]">
                        {participant.department}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xl">{status.emoji}</span>
                    </div>
                  </div>

                  {/* Entry Rate Badge */}
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex-shrink-0">
                      <div className="relative w-12 h-12 rounded-full bg-[#F8F7FF] flex items-center justify-center">
                        <div
                          className="absolute inset-0 rounded-full flex items-center justify-center"
                          style={{
                            background: `conic-gradient(#5B4FD6 0deg ${
                              participant.entryRate * 3.6
                            }deg, #E8E5F0 ${
                              participant.entryRate * 3.6
                            }deg 360deg)`,
                          }}
                        >
                          <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-xs font-bold text-[#5B4FD6]">
                            {participant.entryRate}%
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-[#8B85A8]">記入率</p>
                      <p className="text-sm font-semibold text-[#1E1B3A]">
                        {participant.entryDays}日記入 / {participant.streak}{" "}
                        連続
                      </p>
                    </div>
                  </div>

                  {/* Latest Log Preview */}
                  {participant.latestLog &&
                    participant.latestLog.morningIntent && (
                      <div className="mb-3 p-2 bg-[#F8F7FF] rounded-lg">
                        <p className="text-xs text-[#8B85A8] mb-1">
                          最新ログ ({participant.latestLog.date})
                        </p>
                        <p className="text-sm text-[#1E1B3A] line-clamp-2">
                          {participant.latestLog.morningIntent}
                        </p>
                      </div>
                    )}

                  {/* Energy Trend */}
                  {recentEnergy.length > 0 && (
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs text-[#8B85A8]">
                        エネルギー:
                      </span>
                      <div className="flex gap-1">
                        {recentEnergy.map((energy, idx) => (
                          <div
                            key={idx}
                            className="w-2 h-2 rounded-full"
                            style={{
                              backgroundColor:
                                energy === "excellent"
                                  ? "#FF8C42"
                                  : energy === "good"
                                    ? "#22C55E"
                                    : energy === "okay"
                                      ? "#8B85A8"
                                      : energy === "low"
                                        ? "#FF6B6B"
                                        : "#E8E5F0",
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Bottom Info */}
                  <div className="flex items-center justify-between text-xs text-[#8B85A8]">
                    <span>FB受領: {participant.fbCount}件</span>
                    <span className="text-[#5B4FD6] font-semibold">
                      詳細を見る →
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Footer Message */}
        <div className="text-center py-6 text-xs text-[#8B85A8]">
          <p>上司として見ています</p>
        </div>
      </div>
    </div>
  );
}
