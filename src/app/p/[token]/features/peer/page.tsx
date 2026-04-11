"use client";

import { useParams } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { useFeatures } from "@/lib/use-features";
import Link from "next/link";
import { useState, useEffect } from "react";

type ReceivedReflection = {
  id: string;
  date: string;
  senderName: string;
  question: string;
  reflection: string;
};

export default function PeerPage() {
  const params = useParams();
  const token = params.token as string;

  const { isOn } = useFeatures();
  const [reflections, setReflections] = useState<ReceivedReflection[]>([]);
  const [form, setForm] = useState({ targetName: "", question: "", reflection: "" });
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [badges, setBadges] = useState<{ feedback: number; feedbackTotal: number; mission: number }>({ feedback: 0, feedbackTotal: 0, mission: 0 });

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/features/peer-reflection?token=${token}`);
        if (res.ok) {
          const data = await res.json();
          setReflections(data.reflections || []);
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
    if (!form.targetName.trim() || !form.question.trim() || !form.reflection.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/features/peer-reflection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...form }),
      });
      if (res.ok) {
        setForm({ targetName: "", question: "", reflection: "" });
      }
    } catch {
      // silently fail
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOn("tier-b.peerReflection")) {
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
          <h1 className="text-2xl font-semibold tracking-tight">ピア振り返り</h1>
          <p className="text-indigo-200 text-sm mt-1 font-light">仲間へのフィードバックと受取</p>
        </div>
      </div>

      <div className="max-w-md mx-auto px-5 pt-5 animate-fade-up relative z-10">
        {/* Send Reflection Form */}
        <div className="card p-5 mb-5">
          <h3 className="font-semibold text-sm text-[#1A1A2E] mb-4">仲間へフィードバックを送る</h3>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-[#1A1A2E] block mb-2">相手の名前 *</label>
              <input
                type="text"
                value={form.targetName}
                onChange={(e) => setForm({ ...form, targetName: e.target.value })}
                placeholder="フィードバックを送る相手"
                className="w-full text-sm border border-[#E5DCD0] rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#1A1A2E]/10 focus:border-[#1A1A2E] bg-white transition-all"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-[#1A1A2E] block mb-2">質問/テーマ *</label>
              <input
                type="text"
                value={form.question}
                onChange={(e) => setForm({ ...form, question: e.target.value })}
                placeholder="例: 最近の成長点は?"
                className="w-full text-sm border border-[#E5DCD0] rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#1A1A2E]/10 focus:border-[#1A1A2E] bg-white transition-all"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-[#1A1A2E] block mb-2">振り返り *</label>
              <textarea
                value={form.reflection}
                onChange={(e) => setForm({ ...form, reflection: e.target.value })}
                placeholder="相手へのフィードバックや質問への答え"
                className="w-full text-sm border border-[#E5DCD0] rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-[#1A1A2E]/10 focus:border-[#1A1A2E] bg-white transition-all"
                rows={3}
              />
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={submitting || !form.targetName.trim() || !form.question.trim() || !form.reflection.trim()}
            className="w-full mt-5 bg-[#1A1A2E] text-white py-3 rounded-xl hover:bg-[#141423] disabled:bg-[#C9BDAE] disabled:text-[#8B8489] transition-colors font-medium text-sm"
          >
            {submitting ? "送信中..." : "フィードバックを送る"}
          </button>
        </div>

        {/* Received Reflections */}
        <h3 className="font-semibold text-sm text-[#1A1A2E] mb-3">受け取ったフィードバック</h3>
        {reflections.length === 0 ? (
          <div className="card p-8 text-center">
            <div className="w-12 h-12 bg-[#EFE8DD] rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8B8489" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <p className="text-[#5B5560] text-sm mb-1">フィードバックがまだありません</p>
            <p className="text-xs text-[#8B8489]">仲間からのフィードバックがここに表示されます</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reflections.map((r) => (
              <div key={r.id} className="card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium text-[#1A1A2E]">{r.senderName}</span>
                  <span className="text-[10px] text-[#8B8489]">{new Date(r.date).toLocaleDateString("ja-JP")}</span>
                </div>

                <p className="text-[10px] font-medium text-[#8B8489] tracking-wide uppercase mb-1.5">{r.question}</p>
                <p className="text-sm text-[#2C2C4A] leading-relaxed">{r.reflection}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <BottomNav active="home" baseUrl={`/p/${token}`} badges={badges} />
    </div>
  );
}
