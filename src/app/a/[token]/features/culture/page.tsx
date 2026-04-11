"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useFeatures } from "@/lib/use-features";
import Link from "next/link";

type CultureMetrics = {
  reflectionVolume: number;
  avgDepth: number;
  doubleLoopRate: number;
  knowledgeShares: number;
  peerInteractions: number;
};

type ApiResponse = {
  metrics?: CultureMetrics;
  period?: string;
  trends?: { label: string; value: number }[];
  error?: string;
};

export default function CultureScorePage() {
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
    if (!isOn("tier-b.cultureScore")) {
      router.push(`/a/${token}`);
    }
  }, [loaded, isOn, token, router]);

  // Fetch data
  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/features/culture-score?token=${token}`);
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
    reflectionVolume: 0,
    avgDepth: 0,
    doubleLoopRate: 0,
    knowledgeShares: 0,
    peerInteractions: 0,
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
          <h1 className="text-xl font-semibold tracking-tight">カルチャースコア</h1>
          <p className="text-xs text-[#C9BDAE] mt-1">組織文化メトリクス ダッシュボード</p>
        </div>
      </header>

      <main className="px-5 py-6 space-y-5 max-w-2xl mx-auto">
        {message && (
          <div className="px-4 py-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
            {message}
          </div>
        )}

        {/* Metrics Grid */}
        <div className="space-y-3">
          {/* Reflection Volume */}
          <div className="card p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-xs font-semibold text-[#5B5560] uppercase tracking-wide">振り返り数量</p>
                <p className="text-xs text-[#8B8489] mt-1">過去30日間</p>
              </div>
              <span className="text-xs text-[#1A1A2E] bg-[#EFE8DD] px-2 py-1 rounded">↑ 12%</span>
            </div>
            <p className="text-3xl font-bold text-[#1A1A2E]">{metrics.reflectionVolume}</p>
          </div>

          {/* Avg Depth */}
          <div className="card p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-xs font-semibold text-[#5B5560] uppercase tracking-wide">平均深さスコア</p>
                <p className="text-xs text-[#8B8489] mt-1">反芻度合い</p>
              </div>
              <span className="text-xs text-[#1A1A2E] bg-[#EFE8DD] px-2 py-1 rounded">→ 0%</span>
            </div>
            <p className="text-3xl font-bold text-[#1A1A2E]">{metrics.avgDepth.toFixed(1)}</p>
          </div>

          {/* Double Loop Rate */}
          <div className="card p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-xs font-semibold text-[#5B5560] uppercase tracking-wide">ダブルループ率</p>
                <p className="text-xs text-[#8B8489] mt-1">フレーム変更の検知</p>
              </div>
              <span className="text-xs text-[#1A1A2E] bg-[#EFE8DD] px-2 py-1 rounded">↑ 8%</span>
            </div>
            <p className="text-3xl font-bold text-[#1A1A2E]">{metrics.doubleLoopRate}%</p>
            <div className="mt-3 w-full bg-[#EFE8DD] rounded-full h-2">
              <div
                className="bg-[#1A1A2E] h-2 rounded-full transition-all"
                style={{ width: `${Math.min(metrics.doubleLoopRate, 100)}%` }}
              ></div>
            </div>
          </div>

          {/* Knowledge Shares */}
          <div className="card p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-xs font-semibold text-[#5B5560] uppercase tracking-wide">ナレッジ共有数</p>
                <p className="text-xs text-[#8B8489] mt-1">組織内の学習共有</p>
              </div>
              <span className="text-xs text-[#1A1A2E] bg-[#EFE8DD] px-2 py-1 rounded">↑ 24%</span>
            </div>
            <p className="text-3xl font-bold text-[#1A1A2E]">{metrics.knowledgeShares}</p>
          </div>

          {/* Peer Interactions */}
          <div className="card p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-xs font-semibold text-[#5B5560] uppercase tracking-wide">ピア相互作用</p>
                <p className="text-xs text-[#8B8489] mt-1">同料レベルでの対話</p>
              </div>
              <span className="text-xs text-[#1A1A2E] bg-[#EFE8DD] px-2 py-1 rounded">↑ 15%</span>
            </div>
            <p className="text-3xl font-bold text-[#1A1A2E]">{metrics.peerInteractions}</p>
          </div>
        </div>

        {/* Period Info */}
        {data?.period && (
          <div className="card p-5 text-center">
            <p className="text-xs text-[#8B8489]">期間: {data.period}</p>
          </div>
        )}
      </main>
    </div>
  );
}
