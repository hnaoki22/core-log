"use client";

import { useParams } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { useFeatures } from "@/lib/use-features";
import Link from "next/link";
import { useState, useEffect } from "react";

type AAREntry = {
  id: string;
  date: string;
  projectName: string;
  expected: string;
  actual: string;
  gap: string;
  lessons: string;
};

export default function AARPage() {
  const params = useParams();
  const token = params.token as string;

  const { isOn } = useFeatures();
  const [entries, setEntries] = useState<AAREntry[]>([]);
  const [form, setForm] = useState({ projectName: "", expected: "", actual: "", gap: "", lessons: "" });
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [badges, setBadges] = useState<{ feedback: number; feedbackTotal: number; mission: number }>({ feedback: 0, feedbackTotal: 0, mission: 0 });

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/features/aar?token=${token}`);
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
    if (!form.projectName.trim() || !form.expected.trim() || !form.actual.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/features/aar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...form }),
      });
      if (res.ok) {
        const refreshRes = await fetch(`/api/features/aar?token=${token}`);
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          setEntries(data.entries || []);
        }
        setForm({ projectName: "", expected: "", actual: "", gap: "", lessons: "" });
      }
    } catch {
      // silently fail
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOn("tier-b.aar")) {
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
          <h1 className="text-2xl font-semibold tracking-tight">AAR（後行為レビュー）</h1>
          <p className="text-indigo-200 text-sm mt-1 font-light">プロジェクトからの学習を記録</p>
        </div>
      </div>

      <div className="max-w-md mx-auto px-5 pt-5 animate-fade-up relative z-10">
        {/* Form Card */}
        <div className="card p-5 mb-5">
          <h3 className="font-semibold text-sm text-[#1A1A2E] mb-4">新しいAAR</h3>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-[#1A1A2E] block mb-2">プロジェクト名 *</label>
              <input
                type="text"
                value={form.projectName}
                onChange={(e) => setForm({ ...form, projectName: e.target.value })}
                placeholder="プロジェクト名"
                className="w-full text-sm border border-[#E5DCD0] rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#1A1A2E]/10 focus:border-[#1A1A2E] bg-white transition-all"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-[#1A1A2E] block mb-2">期待していたこと *</label>
              <textarea
                value={form.expected}
                onChange={(e) => setForm({ ...form, expected: e.target.value })}
                placeholder="プロジェクト開始時の期待"
                className="w-full text-sm border border-[#E5DCD0] rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-[#1A1A2E]/10 focus:border-[#1A1A2E] bg-white transition-all"
                rows={2}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-[#1A1A2E] block mb-2">実際に起こったこと *</label>
              <textarea
                value={form.actual}
                onChange={(e) => setForm({ ...form, actual: e.target.value })}
                placeholder="実際の結果や経験"
                className="w-full text-sm border border-[#E5DCD0] rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-[#1A1A2E]/10 focus:border-[#1A1A2E] bg-white transition-all"
                rows={2}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-[#1A1A2E] block mb-2">その差異の原因</label>
              <textarea
                value={form.gap}
                onChange={(e) => setForm({ ...form, gap: e.target.value })}
                placeholder="期待と実際の違いの理由"
                className="w-full text-sm border border-[#E5DCD0] rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-[#1A1A2E]/10 focus:border-[#1A1A2E] bg-white transition-all"
                rows={2}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-[#1A1A2E] block mb-2">学んだ教訓</label>
              <textarea
                value={form.lessons}
                onChange={(e) => setForm({ ...form, lessons: e.target.value })}
                placeholder="今後に活かす教訓"
                className="w-full text-sm border border-[#E5DCD0] rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-[#1A1A2E]/10 focus:border-[#1A1A2E] bg-white transition-all"
                rows={2}
              />
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={submitting || !form.projectName.trim() || !form.expected.trim() || !form.actual.trim()}
            className="w-full mt-5 bg-[#1A1A2E] text-white py-3 rounded-xl hover:bg-[#141423] disabled:bg-[#C9BDAE] disabled:text-[#8B8489] transition-colors font-medium text-sm"
          >
            {submitting ? "保存中..." : "AARを保存"}
          </button>
        </div>

        {/* Past AARs */}
        {entries.length === 0 ? (
          <div className="card p-8 text-center">
            <div className="w-12 h-12 bg-[#EFE8DD] rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8B8489" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              </svg>
            </div>
            <p className="text-[#5B5560] text-sm mb-1">AARがまだありません</p>
            <p className="text-xs text-[#8B8489]">プロジェクト完了時にAARを記録しましょう</p>
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <div key={entry.id} className="card p-4">
                <p className="text-[10px] text-[#8B8489] font-medium tracking-wide uppercase mb-2">
                  {new Date(entry.date).toLocaleDateString("ja-JP")} • {entry.projectName}
                </p>

                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="bg-blue-50 p-2.5 rounded-lg border border-blue-100">
                    <p className="text-[9px] font-medium text-blue-600 tracking-wide uppercase mb-1">期待</p>
                    <p className="text-xs text-[#2C2C4A] line-clamp-2">{entry.expected}</p>
                  </div>
                  <div className="bg-amber-50 p-2.5 rounded-lg border border-amber-100">
                    <p className="text-[9px] font-medium text-amber-600 tracking-wide uppercase mb-1">実際</p>
                    <p className="text-xs text-[#2C2C4A] line-clamp-2">{entry.actual}</p>
                  </div>
                </div>

                {entry.lessons && (
                  <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100">
                    <p className="text-[10px] font-medium text-emerald-600 tracking-wide uppercase mb-1">教訓</p>
                    <p className="text-xs text-[#2C2C4A]">{entry.lessons}</p>
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
