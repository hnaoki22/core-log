"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useFeatures } from "@/lib/use-features";
import Link from "next/link";

type RitualMetrics = {
  avgDuration: number;
  totalSessions: number;
  streak: number;
  participants: { name: string; sessions: number }[];
};

type ApiResponse = {
  metrics?: RitualMetrics;
  error?: string;
};

export default function RitualMetricsPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const { isOn, loaded } = useFeatures();

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  // Load feature flag
  useEffect(() => {
    if (!loaded) return;
    if (!isOn("tier-e.microRitualOptimizer")) {
      router.push(`/a/${token}`);
    }
  }, [loaded, isOn, token, router]);

  // Fetch data
  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/features/ritual-metrics?token=${token}`);
        if (!res.ok) throw new Error("failed to fetch");
        const result = (await res.json()) as ApiResponse;
        setData(result);
      } catch {
        setMessage("データの読み込みに失敗しました");
      } finally {
        setLoading(false);
      }
    }
    if (token) fetchData();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F0EB] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-[3px] border-[#1A1A2E] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[#8B8489] text-sm">読み込み中...</p>
        </div>
      </div>
    );
  }

  const metrics = data?.metrics || {
    avgDuration: 0,
    totalSessions: 0,
    streak: 0,
    participants: [],
  };

  // Calculate max sessions for bar scaling
  const maxSessions = Math.max(...(metrics.participants || []).map((p) => p.sessions), 1);

  return (
    <div className="min-h-screen bg-[#F5F0EB]">
      {/* Header */}
      <header className="gradient-header-admin text-white px-5 pt-12 pb-6">
        <div className="max-w-2xl mx-auto relative z-10">
          <Link
            href={`/a/${token}`}
            className="inline-flex items-center gap-1 text-[#C9BDAE] hover:text-white text-sm mb-3 transition-colors"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
            管理画面に戻る
          </Link>
          <h1 className="text-xl font-semibold tracking-tight">リチュアルメトリクス</h1>
          <p className="text-xs text-[#C9BDAE] mt-1">マイクロリチュアルの実施統計</p>
        </div>
      </header>

      <main className="px-5 py-6 space-y-5 max-w-2xl mx-auto">
        {message && (
          <div className="px-4 py-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
            {message}
          </div>
        )}

        {/* Summary Stats */}
        <div className="space-y-3">
          {/* Avg Duration */}
          <div className="card p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-xs font-semibold text-[#5B5560] uppercase tracking-wide">平均実施時間</p>
                <p className="text-xs text-[#8B8489] mt-1">1回あたり</p>
              </div>
            </div>
            <p className="text-3xl font-bold text-[#1A1A2E]">{Math.round(metrics.avgDuration)}</p>
            <p className="text-xs text-[#8B8489] mt-1">分</p>
          </div>

          {/* Total Sessions */}
          <div className="card p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-xs font-semibold text-[#5B5560] uppercase tracking-wide">累計実施回数</p>
                <p className="text-xs text-[#8B8489] mt-1">全体</p>
              </div>
            </div>
            <p className="text-3xl font-bold text-[#1A1A2E]">{metrics.totalSessions}</p>
          </div>

          {/* Streak */}
          <div className="card p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-xs font-semibold text-[#5B5560] uppercase tracking-wide">実施継続日数</p>
                <p className="text-xs text-[#8B8489] mt-1">連続</p>
              </div>
            </div>
            <p className="text-3xl font-bold text-[#1A1A2E]">{metrics.streak}</p>
            <p className="text-xs text-[#8B8489] mt-1">日</p>
          </div>
        </div>

        {/* Participant Distribution */}
        {metrics.participants && metrics.participants.length > 0 && (
          <div className="card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-[#1A1A2E]">参加者別実施数</h2>
            <div className="space-y-3">
              {metrics.participants.map((participant) => (
                <div key={participant.name} className="space-y-1">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-medium text-[#5B5560]">{participant.name}</p>
                    <p className="text-xs font-semibold text-[#1A1A2E]">{participant.sessions}回</p>
                  </div>
                  <div className="w-full bg-[#EFE8DD] rounded-full h-2">
                    <div
                      className="bg-[#1A1A2E] h-2 rounded-full transition-all"
                      style={{ width: `${(participant.sessions / maxSessions) * 100}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {(!metrics.participants || metrics.participants.length === 0) && (
          <div className="card p-8 text-center">
            <p className="text-[#8B8489] text-sm">参加者データはまだありません</p>
          </div>
        )}
      </main>
    </div>
  );
}
