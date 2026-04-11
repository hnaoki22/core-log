"use client";

import { useParams } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { useFeatures } from "@/lib/use-features";
import Link from "next/link";
import { useState, useEffect } from "react";

type HopeDesign = {
  id: string;
  date: string;
  goal: string;
  pathways: string[];
  obstacles: string[];
  strategies: string[];
};

export default function HopePage() {
  const params = useParams();
  const token = params.token as string;

  const { isOn } = useFeatures();
  const [designs, setDesigns] = useState<HopeDesign[]>([]);
  const [form, setForm] = useState({ goal: "", pathways: [""], obstacles: [""], strategies: [""] });
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [badges, setBadges] = useState<{ feedback: number; feedbackTotal: number; mission: number }>({ feedback: 0, feedbackTotal: 0, mission: 0 });

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/features/hope-design?token=${token}`);
        if (res.ok) {
          const data = await res.json();
          setDesigns(data.designs || []);
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
    if (!form.goal.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/features/hope-design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          goal: form.goal,
          pathways: form.pathways.filter(p => p.trim()),
          obstacles: form.obstacles.filter(o => o.trim()),
          strategies: form.strategies.filter(s => s.trim()),
        }),
      });
      if (res.ok) {
        const refreshRes = await fetch(`/api/features/hope-design?token=${token}`);
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          setDesigns(data.designs || []);
        }
        setForm({ goal: "", pathways: [""], obstacles: [""], strategies: [""] });
      }
    } catch {
      // silently fail
    } finally {
      setSubmitting(false);
    }
  };

  const updateArray = (field: "pathways" | "obstacles" | "strategies", idx: number, value: string) => {
    const arr = [...form[field]];
    arr[idx] = value;
    setForm({ ...form, [field]: arr });
  };

  const addField = (field: "pathways" | "obstacles" | "strategies") => {
    setForm({ ...form, [field]: [...form[field], ""] });
  };

  if (!isOn("tier-d.hopeDesign")) {
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
          <h1 className="text-2xl font-semibold tracking-tight">希望設計</h1>
          <p className="text-indigo-200 text-sm mt-1 font-light">目標達成への道筋を設計</p>
        </div>
      </div>

      <div className="max-w-md mx-auto px-5 pt-5 animate-fade-up relative z-10">
        {/* Form Card */}
        <div className="card p-5 mb-5">
          <h3 className="font-semibold text-sm text-[#1A1A2E] mb-4">新しい希望設計</h3>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-[#1A1A2E] block mb-2">目標 *</label>
              <input
                type="text"
                value={form.goal}
                onChange={(e) => setForm({ ...form, goal: e.target.value })}
                placeholder="達成したい目標"
                className="w-full text-sm border border-[#E5DCD0] rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#1A1A2E]/10 focus:border-[#1A1A2E] bg-white transition-all"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-[#1A1A2E]">達成経路</label>
                <button
                  onClick={() => addField("pathways")}
                  className="text-xs text-[#1A1A2E] hover:text-[#5B5560]"
                >
                  + 追加
                </button>
              </div>
              <div className="space-y-2">
                {form.pathways.map((pathway, idx) => (
                  <input
                    key={idx}
                    type="text"
                    value={pathway}
                    onChange={(e) => updateArray("pathways", idx, e.target.value)}
                    placeholder={`経路 ${idx + 1}`}
                    className="w-full text-xs border border-[#E5DCD0] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1A1A2E]/10 focus:border-[#1A1A2E] bg-white transition-all"
                  />
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-[#1A1A2E]">障害</label>
                <button
                  onClick={() => addField("obstacles")}
                  className="text-xs text-[#1A1A2E] hover:text-[#5B5560]"
                >
                  + 追加
                </button>
              </div>
              <div className="space-y-2">
                {form.obstacles.map((obstacle, idx) => (
                  <input
                    key={idx}
                    type="text"
                    value={obstacle}
                    onChange={(e) => updateArray("obstacles", idx, e.target.value)}
                    placeholder={`障害 ${idx + 1}`}
                    className="w-full text-xs border border-[#E5DCD0] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1A1A2E]/10 focus:border-[#1A1A2E] bg-white transition-all"
                  />
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-[#1A1A2E]">戦略</label>
                <button
                  onClick={() => addField("strategies")}
                  className="text-xs text-[#1A1A2E] hover:text-[#5B5560]"
                >
                  + 追加
                </button>
              </div>
              <div className="space-y-2">
                {form.strategies.map((strategy, idx) => (
                  <input
                    key={idx}
                    type="text"
                    value={strategy}
                    onChange={(e) => updateArray("strategies", idx, e.target.value)}
                    placeholder={`戦略 ${idx + 1}`}
                    className="w-full text-xs border border-[#E5DCD0] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1A1A2E]/10 focus:border-[#1A1A2E] bg-white transition-all"
                  />
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={submitting || !form.goal.trim()}
            className="w-full mt-5 bg-[#1A1A2E] text-white py-3 rounded-xl hover:bg-[#141423] disabled:bg-[#C9BDAE] disabled:text-[#8B8489] transition-colors font-medium text-sm"
          >
            {submitting ? "保存中..." : "希望設計を保存"}
          </button>
        </div>

        {/* Past Designs */}
        {designs.length === 0 ? (
          <div className="card p-8 text-center">
            <div className="w-12 h-12 bg-[#EFE8DD] rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8B8489" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              </svg>
            </div>
            <p className="text-[#5B5560] text-sm mb-1">希望設計がまだありません</p>
            <p className="text-xs text-[#8B8489]">上記のフォームで新しい希望設計を作成しましょう</p>
          </div>
        ) : (
          <div className="space-y-3">
            {designs.map((design) => (
              <div key={design.id} className="card p-4">
                <p className="text-[10px] text-[#8B8489] font-medium tracking-wide uppercase mb-2">
                  {new Date(design.date).toLocaleDateString("ja-JP")}
                </p>
                <div className="bg-[#F5F0EB] p-3 rounded-xl border border-[#EFE8DD] mb-3">
                  <p className="text-sm font-medium text-[#1A1A2E] mb-2">目標</p>
                  <p className="text-sm text-[#2C2C4A]">{design.goal}</p>
                </div>
                {design.pathways.length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs font-medium text-[#8B8489] mb-1 tracking-wide uppercase">達成経路</p>
                    <div className="space-y-1">
                      {design.pathways.map((p, idx) => (
                        <p key={idx} className="text-xs text-[#2C2C4A]">• {p}</p>
                      ))}
                    </div>
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
