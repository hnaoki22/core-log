"use client";

// standalone §8: 21日AIレポート v0 の表示ページ（AI分析の入口から遷移）
// 相関レンズ＋テーマ反復レンズの2枚構成。スキップの一言は咎めないトーンで添える。

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type ReportPayload = {
  report: {
    correlationLens: string;
    themeLens: string;
    skipNote: string | null;
  };
  periodStart: string;
  periodEnd: string;
  entryDays: number;
  createdAt: string;
  cached?: boolean;
};

export default function StandaloneReportPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [data, setData] = useState<ReportPayload | null>(null);
  const [lockedInfo, setLockedInfo] = useState<{ daysElapsed: number; entryDays: number } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/standalone/report?token=${encodeURIComponent(token)}`);
        const body = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setData(body as ReportPayload);
        } else if (body?.locked) {
          setLockedInfo({ daysElapsed: body.daysElapsed ?? 0, entryDays: body.entryDays ?? 0 });
        } else {
          setError(body?.error || "レポートを取得できませんでした");
        }
      } catch {
        if (!cancelled) setError("通信エラーが発生しました");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F0EB] flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#1A1A2E] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[#5B5560] text-sm mb-1">3週間分のログを観ています…</p>
          <p className="text-[#8B8489] text-xs">初回は30秒ほどかかることがあります</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F0EB] pb-24">
      <div className="gradient-header text-white px-6 pt-12 pb-6">
        <div className="max-w-md mx-auto relative z-10">
          <button
            onClick={() => router.push(`/p/${token}`)}
            className="text-indigo-200 hover:text-white text-sm mb-4 flex items-center gap-1 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            ホームに戻る
          </button>
          <h1 className="text-xl font-semibold tracking-tight">AI分析</h1>
          {data && (
            <p className="text-indigo-200 text-sm mt-1.5 font-light">
              {data.periodStart.replace(/-/g, "/")} 〜 {data.periodEnd.replace(/-/g, "/")}（記入{data.entryDays}日）
            </p>
          )}
        </div>
      </div>

      <div className="max-w-md mx-auto px-5 pt-6 space-y-4 animate-fade-up">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {lockedInfo && (
          <div className="card p-6 text-center">
            <p className="text-sm text-[#1A1A2E] font-medium mb-2">まだ観ている途中です</p>
            <p className="text-xs text-[#5B5560] leading-relaxed">
              初回の記入から21日が経ち、記入が10日に届くと、ここにあなたのパターンが現れます。
              <br />（現在: {lockedInfo.daysElapsed}日経過・記入{lockedInfo.entryDays}日）
            </p>
          </div>
        )}

        {data && (
          <>
            {/* 相関レンズ */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">🕯️</span>
                <h2 className="font-semibold text-sm text-[#1A1A2E]">気分の動きから</h2>
              </div>
              <p className="text-sm text-[#1A1A2E] leading-relaxed whitespace-pre-wrap">
                {data.report.correlationLens}
              </p>
            </div>

            {/* テーマ反復レンズ */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">🔁</span>
                <h2 className="font-semibold text-sm text-[#1A1A2E]">繰り返し現れる言葉から</h2>
              </div>
              <p className="text-sm text-[#1A1A2E] leading-relaxed whitespace-pre-wrap">
                {data.report.themeLens}
              </p>
            </div>

            {/* スキップの一言（任意） */}
            {data.report.skipNote && (
              <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4">
                <p className="text-xs text-stone-600 leading-relaxed">{data.report.skipNote}</p>
              </div>
            )}

            <p className="text-[10px] text-[#8B8489] text-center leading-relaxed pt-2">
              これは装置が観た事の映し返しです。診断でも評価でもありません。
            </p>
          </>
        )}
      </div>
    </div>
  );
}
