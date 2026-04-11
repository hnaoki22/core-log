"use client";

import { useParams } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { useFeatures } from "@/lib/use-features";
import Link from "next/link";
import { useState, useEffect } from "react";

type IdentityEntry = {
  id: string;
  date: string;
  periodLabel: string;
  thenSelf: string;
  nowSelf: string;
  keyShift: string;
};

export default function IdentityPage() {
  const params = useParams();
  const token = params.token as string;

  const { isOn } = useFeatures();
  const [entries, setEntries] = useState<IdentityEntry[]>([]);
  const [form, setForm] = useState({ periodLabel: "", thenSelf: "", nowSelf: "", keyShift: "" });
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [badges, setBadges] = useState<{ feedback: number; feedbackTotal: number; mission: number }>({ feedback: 0, feedbackTotal: 0, mission: 0 });

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/features/identity?token=${token}`);
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
    if (!form.periodLabel.trim() || !form.thenSelf.trim() || !form.nowSelf.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/features/identity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...form }),
      });
      if (res.ok) {
        const refreshRes = await fetch(`/api/features/identity?token=${token}`);
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          setEntries(data.entries || []);
        }
        setForm({ periodLabel: "", thenSelf: "", nowSelf: "", keyShift: "" });
      }
    } catch {
      // silently fail
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOn("tier-c.identityTracking")) {
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
          <h1 className="text-2xl font-semibold tracking-tight">アイデンティティ追跡</h1>
          <p className="text-indigo-200 text-sm mt-1 font-light">自分の変化を記録する</p>
        </div>
      </div>

      <div className="max-w-md mx-auto px-5 pt-5 animate-fade-up relative z-10">
        {/* Form Card */}
        <div className="card p-5 mb-5">
          <h3 className="font-semibold text-sm text-[#1A1A2E] mb-4">新しいアイデンティティ記録</h3>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-[#1A1A2E] block mb-2">時期ラベル (例: 3ヶ月前) *</label>
              <input
                type="text"
                value={form.periodLabel}
                onChange={(e) => setForm({ ...form, periodLabel: e.target.value })}
                placeholder="3ヶ月前 など"
                className="w-full text-sm border border-[#E5DCD0] rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#1A1A2E]/10 focus:border-[#1A1A2E] bg-white transition-all"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-[#1A1A2E] block mb-2">あの時の自分 *</label>
              <textarea
                value={form.thenSelf}
                onChange={(e) => setForm({ ...form, thenSelf: e.target.value })}
                placeholder="その時の自分の考え方や特徴"
                className="w-full text-sm border border-[#E5DCD0] rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-[#1A1A2E]/10 focus:border-[#1A1A2E] bg-white transition-all"
                rows={2}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-[#1A1A2E] block mb-2">今の自分 *</label>
              <textarea
                value={form.nowSelf}
                onChange={(e) => setForm({ ...form, nowSelf: e.target.value })}
                placeholder="今の自分の考え方や特徴"
                className="w-full text-sm border border-[#E5DCD0] rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-[#1A1A2E]/10 focus:border-[#1A1A2E] bg-white transition-all"
                rows={2}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-[#1A1A2E] block mb-2">キーとなる変化</label>
              <textarea
                value={form.keyShift}
                onChange={(e) => setForm({ ...form, keyShift: e.target.value })}
                placeholder="何がこの変化をもたらしたか"
                className="w-full text-sm border border-[#E5DCD0] rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-[#1A1A2E]/10 focus:border-[#1A1A2E] bg-white transition-all"
                rows={2}
              />
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={submitting || !form.periodLabel.trim() || !form.thenSelf.trim() || !form.nowSelf.trim()}
            className="w-full mt-5 bg-[#1A1A2E] text-white py-3 rounded-xl hover:bg-[#141423] disabled:bg-[#C9BDAE] disabled:text-[#8B8489] transition-colors font-medium text-sm"
          >
            {submitting ? "保存中..." : "記録を保存"}
          </button>
        </div>

        {/* Past Entries */}
        {entries.length === 0 ? (
          <div className="card p-8 text-center">
            <div className="w-12 h-12 bg-[#EFE8DD] rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8B8489" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20v-6m0 0V4m0 10H6m6 0h6"/>
              </svg>
            </div>
            <p className="text-[#5B5560] text-sm mb-1">記録がまだありません</p>
            <p className="text-xs text-[#8B8489]">自分の成長を記録していきましょう</p>
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <div key={entry.id} className="card p-4">
                <p className="text-[10px] text-[#8B8489] font-medium tracking-wide uppercase mb-3">
                  {entry.periodLabel}
                </p>

                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="bg-red-50 p-3 rounded-xl border border-red-100">
                    <p className="text-[10px] font-medium text-red-600 tracking-wide uppercase mb-1.5">あの時</p>
                    <p className="text-xs text-[#2C2C4A] leading-relaxed">{entry.thenSelf}</p>
                  </div>
                  <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100">
                    <p className="text-[10px] font-medium text-emerald-600 tracking-wide uppercase mb-1.5">今</p>
                    <p className="text-xs text-[#2C2C4A] leading-relaxed">{entry.nowSelf}</p>
                  </div>
                </div>

                {entry.keyShift && (
                  <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-100">
                    <p className="text-[10px] font-medium text-indigo-600 tracking-wide uppercase mb-1.5">変化のキー</p>
                    <p className="text-sm text-[#2C2C4A] leading-relaxed">{entry.keyShift}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <BottomNav active="home" baseUrl={`/p/${token}`} badges={badges} />
    </div>
  );
}
