"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useFeatures } from "@/lib/use-features";
import Link from "next/link";

type GrowthMetrics = {
  totalReflectionHours: number;
  conceptsGenerated: number;
  behaviorChanges: number;
  avgEnergyTrend: number;
};

type ApiResponse = {
  metrics?: GrowthMetrics;
  period?: string;
  error?: string;
};

export default function GrowthROIPage() {
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
    if (!isOn("tier-f.growthRoi")) {
      router.push(`/a/${token}`);
    }
  }, [loaded, isOn, token, router]);

  // Fetch data
  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/features/growth-roi?token=${token}`);
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
    totalReflectionHours: 0,
    conceptsGenerated: 0,
    behaviorChanges: 0,
    avgEnergyTrend: 0,
  };

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
          <h1 className="text-xl font-semibold tracking-tight">成長ROI</h1>
          <p className="text-xs text-[#C9BDAE] mt-1">組織の学習効果と成長を可視化</p>
        </div>
      </header>

      <main className="px-5 py-6 space-y-5 max-w-2xl mx-auto">
        {message && (
          <div className="px-4 py-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
            {message}
          </div>
        )}

        {/* Main Metrics Grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Reflection Hours */}
          <div className="card p-5 text-center">
            <p className="text-xs font-semibold text-[#5B5560] uppercase tracking-wide mb-2">振り返り時間</p>
            <p className="text-4xl font-bold text-[#1A1A2E]">{Math.round(metrics.totalReflectionHours)}</p>
            <p className="text-xs text-[#8B8489] mt-2">時間（累計）</p>
          </div>

          {/* Concepts Generated */}
          <div className="card p-5 text-center">
            <p className="text-xs font-semibold text-[#5B5560] uppercase tracking-wide mb-2">新規概念化</p>
            <p className="text-4xl font-bold text-[#1A1A2E]">{metrics.conceptsGenerated}</p>
            <p className="text-xs text-[#8B8489] mt-2">個（生成）</p>
          </div>

          {/* Behavior Changes */}
          <div className="card p-5 text-center">
            <p className="text-xs font-semibold text-[#5B5560] uppercase tracking-wide mb-2">行動変容</p>
            <p className="text-4xl font-bold text-[#1A1A2E]">{metrics.behaviorChanges}</p>
            <p className="text-xs text-[#8B8489] mt-2">件（検知）</p>
          </div>

          {/* Energy Trend */}
          <div className="card p-5 text-center">
            <p className="text-xs font-semibold text-[#5B5560] uppercase tracking-wide mb-2">エネルギー向上</p>
            <p className="text-4xl font-bold text-[#1A1A2E]">{metrics.avgEnergyTrend > 0 ? "↑" : "↓"}</p>
            <p className="text-xs text-[#8B8489] mt-2">{Math.abs(metrics.avgEnergyTrend).toFixed(1)}% 変化</p>
          </div>
        </div>

        {/* Detailed View Link */}
        <div className="card p-5">
          <Link
            href={`/a/${token}/features/growth-roi/details`}
            className="w-full block text-center py-2 px-4 bg-[#1A1A2E] text-white text-sm font-medium rounded-lg hover:bg-[#2A2A3E] transition-colors"
          >
            詳細比較を見る
          </Link>
        </div>

        {/* Period Info */}
        {data?.period && (
          <div className="card p-5 text-center">
            <p className="text-xs text-[#8B8489]">集計期間: {data.period}</p>
          </div>
        )}
      </main>
    </div>
  );
}
