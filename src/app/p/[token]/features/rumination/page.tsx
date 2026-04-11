"use client";

import { useParams } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { useFeatures } from "@/lib/use-features";
import Link from "next/link";
import { useState, useEffect } from "react";

type RuminationAnalysis = {
  id: string;
  date: string;
  level: "none" | "mild" | "moderate" | "severe";
  patterns: string[];
  reframing: string;
};

export default function RuminationPage() {
  const params = useParams();
  const token = params.token as string;

  const { isOn } = useFeatures();
  const [analyses, setAnalyses] = useState<RuminationAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [badges, setBadges] = useState<{ feedback: number; feedbackTotal: number; mission: number }>({ feedback: 0, feedbackTotal: 0, mission: 0 });

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/features/rumination?token=${token}`);
        if (res.ok) {
          const data = await res.json();
          setAnalyses(data.analyses || []);
        }
        const badgesRes = await fetch(`/api/logs?token=${token}`);
        if (badgesRes.ok) {
          const badgesData = await badgesRes.json();
          if (badgesData.badges) setBadges(badgesData.badges);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [token]);

  if (!isOn("tier-s.ruminationDetection")) {
    return (
      <div className="min-h-screen bg-[#F5F0EB] flex items-center justify-center p-6">
        <p className="text-[#5B5560] text-sm">このフィーチャーは有効になっていません</p>
      </div>
    );
  }

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

  const levelColor: Record<string, { bg: string; badge: string; label: string }> = {
    none: { bg: "from-emerald-50 to-green-50", badge: "text-emerald-600 bg-emerald-50", label: "なし" },
    mild: { bg: "from-blue-50 to-indigo-50", badge: "text-blue-600 bg-blue-50", label: "軽度" },
    moderate: { bg: "from-amber-50 to-yellow-50", badge: "text-amber-600 bg-amber-50", label: "中程度" },
    severe: { bg: "from-red-50 to-orange-50", badge: "text-red-600 bg-red-50", label: "強度" },
  };

  return (
    <div className="min-h-screen bg-[#F5F0EB] pb-24">
      {/* Header with Back Button */}
      <div className="gradient-header text-white px-6 pt-12 pb-6">
        <div className="max-w-md mx-auto relative z-10">
          <Link href={`/p/${token}`} className="inline-flex items-center gap-1 text-indigo-200 hover:text-white transition-colors mb-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            <span className="text-xs font-medium">戻る</span>
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">反芻思考分析</h1>
          <p className="text-indigo-200 text-sm mt-1 font-light">過去の反芻パターンと再構築の履歴</p>
        </div>
      </div>

      <div className="max-w-md mx-auto px-5 pt-5 animate-fade-up relative z-10">
        {analyses.length === 0 ? (
          <div className="card p-8 text-center">
            <div className="w-12 h-12 bg-[#EFE8DD] rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8B8489" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="8" y1="14" x2="16" y2="14"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="9" r="1"/>
              </svg>
            </div>
            <p className="text-[#5B5560] text-sm mb-1">分析がまだありません</p>
            <p className="text-xs text-[#8B8489]">反芻パターンの分析結果がここに表示されます</p>
          </div>
        ) : (
          <div className="space-y-3">
            {analyses.map((analysis) => {
              const style = levelColor[analysis.level];
              return (
                <div key={analysis.id} className={`card overflow-hidden border-l-4 ${
                  analysis.level === "none" ? "border-l-emerald-500" :
                  analysis.level === "mild" ? "border-l-blue-500" :
                  analysis.level === "moderate" ? "border-l-amber-500" : "border-l-red-500"
                }`}>
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="text-[10px] text-[#8B8489] font-medium tracking-wide uppercase mb-1">
                          {new Date(analysis.date).toLocaleDateString("ja-JP")}
                        </p>
                        <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${style.badge}`}>
                          {style.label}
                        </span>
                      </div>
                    </div>

                    {analysis.patterns.length > 0 && (
                      <div className="mb-3">
                        <p className="text-[10px] font-medium text-[#8B8489] tracking-wide uppercase mb-1.5">検出されたパターン</p>
                        <div className="flex flex-wrap gap-1.5">
                          {analysis.patterns.map((pattern, idx) => (
                            <span key={idx} className="text-xs bg-[#F5F0EB] text-[#5B5560] px-2.5 py-1 rounded-lg">
                              {pattern}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {analysis.reframing && (
                      <div className="bg-[#F5F0EB] p-3 rounded-xl border border-[#EFE8DD]">
                        <p className="text-[10px] font-medium text-[#8B8489] tracking-wide uppercase mb-1.5">再構築の気づき</p>
                        <p className="text-sm text-[#2C2C4A] leading-relaxed">{analysis.reframing}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <BottomNav active="home" baseUrl={`/p/${token}`} badges={badges} />
    </div>
  );
}
