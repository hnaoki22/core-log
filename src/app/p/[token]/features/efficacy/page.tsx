"use client";

import { useParams } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { useFeatures } from "@/lib/use-features";
import Link from "next/link";
import { useState, useEffect } from "react";

type EfficacyMoment = {
  date: string;
  excerpt: string;
  analysis: string;
};

export default function EfficacyPage() {
  const params = useParams();
  const token = params.token as string;

  const { isOn } = useFeatures();
  const [moments, setMoments] = useState<EfficacyMoment[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [badges, setBadges] = useState<{ feedback: number; feedbackTotal: number; mission: number }>({ feedback: 0, feedbackTotal: 0, mission: 0 });

  useEffect(() => {
    async function fetchBadges() {
      try {
        const badgesRes = await fetch(`/api/logs?token=${token}`);
        if (badgesRes.ok) {
          const badgesData = await badgesRes.json();
          if (badgesData.badges) setBadges(badgesData.badges);
        }
      } catch {
        // silently fail
      }
    }
    fetchBadges();
  }, [token]);

  const handleFetch = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/features/efficacy-boost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (res.ok) {
        const data = await res.json();
        setMoments(data.moments || []);
        setFetched(true);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  if (!isOn("tier-d.efficacyBooster")) {
    return (
      <div className="min-h-screen bg-[#F5F0EB] flex items-center justify-center p-6">
        <p className="text-[#5B5560] text-sm">このフィーチャーは有効になっていません</p>
      </div>
    );
  }

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
          <h1 className="text-2xl font-semibold tracking-tight">効力感ブースター</h1>
          <p className="text-indigo-200 text-sm mt-1 font-light">過去の克服体験から学ぶ</p>
        </div>
      </div>

      <div className="max-w-md mx-auto px-5 pt-5 animate-fade-up relative z-10">
        {!fetched && (
          <button
            onClick={handleFetch}
            disabled={loading}
            className="w-full mb-5 flex items-center justify-center gap-2 py-3 rounded-2xl bg-[#1A1A2E] text-white hover:bg-[#141423] disabled:bg-[#C9BDAE] disabled:text-[#8B8489] transition-colors font-medium text-sm"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            {loading ? "探索中..." : "過去の克服体験を探す"}
          </button>
        )}

        {fetched && moments.length === 0 ? (
          <div className="card p-8 text-center">
            <div className="w-12 h-12 bg-[#EFE8DD] rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8B8489" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
            </div>
            <p className="text-[#5B5560] text-sm mb-1">克服体験が見つかりません</p>
            <p className="text-xs text-[#8B8489]">もう一度試してみてください</p>
          </div>
        ) : fetched && moments.length > 0 ? (
          <div className="space-y-3">
            {moments.map((moment, idx) => (
              <div key={idx} className="card p-4 border-l-4 border-l-emerald-500">
                <p className="text-[10px] text-[#8B8489] font-medium tracking-wide uppercase mb-2">
                  {new Date(moment.date).toLocaleDateString("ja-JP")}
                </p>
                {moment.excerpt && (
                  <div className="bg-[#F5F0EB] p-3 rounded-xl border border-[#EFE8DD] mb-3">
                    <p className="text-sm text-[#2C2C4A] leading-relaxed">{moment.excerpt}</p>
                  </div>
                )}
                {moment.analysis && (
                  <div>
                    <p className="text-[10px] font-medium text-[#8B8489] tracking-wide uppercase mb-1.5">気づき</p>
                    <p className="text-sm text-[#2C2C4A] leading-relaxed">{moment.analysis}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <BottomNav active="home" baseUrl={`/p/${token}`} badges={badges} />
    </div>
  );
}
