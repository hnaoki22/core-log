"use client";

import { useParams } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { useFeatures } from "@/lib/use-features";
import Link from "next/link";
import { useState, useEffect } from "react";

type UnlearnEntry = {
  id: string;
  date: string;
  situation: string;
  oldApproach: string;
  newInsight: string;
};

export default function UnlearnPage() {
  const params = useParams();
  const token = params.token as string;

  const { isOn } = useFeatures();
  const [entries, setEntries] = useState<UnlearnEntry[]>([]);
  const [form, setForm] = useState({ situation: "", oldApproach: "", newInsight: "" });
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [badges, setBadges] = useState<{ feedback: number; feedbackTotal: number; mission: number }>({ feedback: 0, feedbackTotal: 0, mission: 0 });

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/features/unlearn?token=${token}`);
        if (res.ok) {
          const data = await res.json();
          setEntries(data.entries || []);
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

  const handleSubmit = async () => {
    if (!form.situation.trim() || !form.oldApproach.trim() || !form.newInsight.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/features/unlearn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...form }),
      });
      if (res.ok) {
        const refreshRes = await fetch(`/api/features/unlearn?token=${token}`);
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          setEntries(data.entries || []);
        }
        setForm({ situation: "", oldApproach: "", newInsight: "" });
      }
    } catch {
      // silently fail
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOn("tier-c.unlearnChallenge")) {
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
          <h1 className="text-2xl font-semibold tracking-tight">アンラーン・チャレンジ</h1>
          <p className="text-indigo-200 text-sm mt-1 font-light">古い思考パターンから解放される</p>
        </div>
      </div>

      <div className="max-w-md mx-auto px-5 pt-5 animate-fade-up relative z-10">
        {/* Form Card */}
        <div className="card p-5 mb-5">
          <h3 className="font-semibold text-sm text-[#1A1A2E] mb-4">新しいアンラーン経験</h3>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-[#1A1A2E] block mb-2">状況 *</label>
              <input
                type="text"
                value={form.situation}
                onChange={(e) => setForm({ ...form, situation: e.target.value })}
                placeholder="何があったか"
                className="w-full text-sm border border-[#E5DCD0] rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#1A1A2E]/10 focus:border-[#1A1A2E] bg-white transition-all"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-[#1A1A2E] block mb-2">従来のアプローチ *</label>
              <textarea
                value={form.oldApproach}
                onChange={(e) => setForm({ ...form, oldApproach: e.target.value })}
                placeholder="これまでの対応方法"
                className="w-full text-sm border border-[#E5DCD0] rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-[#1A1A2E]/10 focus:border-[#1A1A2E] bg-white transition-all"
                rows={2}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-[#1A1A2E] block mb-2">新しい気づき *</label>
              <textarea
                value={form.newInsight}
                onChange={(e) => setForm({ ...form, newInsight: e.target.value })}
                placeholder="今回学んだこと"
                className="w-full text-sm border border-[#E5DCD0] rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-[#1A1A2E]/10 focus:border-[#1A1A2E] bg-white transition-all"
                rows={2}
              />
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={submitting || !form.situation.trim() || !form.oldApproach.trim() || !form.newInsight.trim()}
            className="w-full mt-5 bg-[#1A1A2E] text-white py-3 rounded-xl hover:bg-[#141423] disabled:bg-[#C9BDAE] disabled:text-[#8B8489] transition-colors font-medium text-sm"
          >
            {submitting ? "保存中..." : "経験を記録"}
          </button>
        </div>

        {/* Past Entries */}
        {entries.length === 0 ? (
          <div className="card p-8 text-center">
            <div className="w-12 h-12 bg-[#EFE8DD] rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8B8489" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
              </svg>
            </div>
            <p className="text-[#5B5560] text-sm mb-1">経験がまだありません</p>
            <p className="text-xs text-[#8B8489]">アンラーン経験を記録していきましょう</p>
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <div key={entry.id} className="card p-4">
                <p className="text-[10px] text-[#8B8489] font-medium tracking-wide uppercase mb-3">
                  {new Date(entry.date).toLocaleDateString("ja-JP")}
                </p>

                <div className="mb-3">
                  <p className="text-[10px] font-medium text-[#8B8489] tracking-wide uppercase mb-1">状況</p>
                  <p className="text-sm text-[#2C2C4A]">{entry.situation}</p>
                </div>

                <div className="mb-3">
                  <p className="text-[10px] font-medium text-[#8B8489] tracking-wide uppercase mb-1">従来のアプローチ</p>
                  <p className="text-sm text-[#2C2C4A]">{entry.oldApproach}</p>
                </div>

                <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100">
                  <p className="text-[10px] font-medium text-emerald-600 tracking-wide uppercase mb-1">新しい気づき</p>
                  <p className="text-sm text-[#2C2C4A] leading-relaxed">{entry.newInsight}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <BottomNav active="home" baseUrl={`/p/${token}`} badges={badges} />
    </div>
  );
}
