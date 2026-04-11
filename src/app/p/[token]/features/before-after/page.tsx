"use client";

import { useParams } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { useFeatures } from "@/lib/use-features";
import Link from "next/link";
import { useState, useEffect } from "react";

type Dimension = {
  name: string;
  before: number;
  after: number;
};

type BeforeAfterAssessment = {
  id: string;
  date: string;
  type: string;
  dimensions: Dimension[];
};

export default function BeforeAfterPage() {
  const params = useParams();
  const token = params.token as string;

  const { isOn } = useFeatures();
  const [assessments, setAssessments] = useState<BeforeAfterAssessment[]>([]);
  const [form, setForm] = useState({
    type: "",
    dimensions: [{ name: "", before: 3, after: 3 }],
  });
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [badges, setBadges] = useState<{ feedback: number; feedbackTotal: number; mission: number }>({ feedback: 0, feedbackTotal: 0, mission: 0 });

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/features/before-after?token=${token}`);
        if (res.ok) {
          const data = await res.json();
          setAssessments(data.assessments || []);
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
    if (!form.type.trim() || form.dimensions.some(d => !d.name.trim())) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/features/before-after", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...form }),
      });
      if (res.ok) {
        const refreshRes = await fetch(`/api/features/before-after?token=${token}`);
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          setAssessments(data.assessments || []);
        }
        setForm({ type: "", dimensions: [{ name: "", before: 3, after: 3 }] });
      }
    } catch {
      // silently fail
    } finally {
      setSubmitting(false);
    }
  };

  const updateDimension = (idx: number, field: "name" | "before" | "after", value: string | number) => {
    const dims = [...form.dimensions];
    if (field === "name") {
      dims[idx].name = value as string;
    } else {
      dims[idx][field] = parseInt(value as string);
    }
    setForm({ ...form, dimensions: dims });
  };

  const addDimension = () => {
    setForm({ ...form, dimensions: [...form.dimensions, { name: "", before: 3, after: 3 }] });
  };

  if (!isOn("tier-f.beforeAfter")) {
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
          <h1 className="text-2xl font-semibold tracking-tight">ビフォー・アフター評価</h1>
          <p className="text-indigo-200 text-sm mt-1 font-light">成長を可視化する自己評価</p>
        </div>
      </div>

      <div className="max-w-md mx-auto px-5 pt-5 animate-fade-up relative z-10">
        {/* Form Card */}
        <div className="card p-5 mb-5">
          <h3 className="font-semibold text-sm text-[#1A1A2E] mb-4">新しい評価を作成</h3>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-[#1A1A2E] block mb-2">評価タイプ (例: リーダーシップ) *</label>
              <input
                type="text"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                placeholder="評価のテーマ"
                className="w-full text-sm border border-[#E5DCD0] rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#1A1A2E]/10 focus:border-[#1A1A2E] bg-white transition-all"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-[#1A1A2E]">評価項目</label>
                <button
                  onClick={addDimension}
                  className="text-xs text-[#1A1A2E] hover:text-[#5B5560]"
                >
                  + 項目追加
                </button>
              </div>

              <div className="space-y-3">
                {form.dimensions.map((dim, idx) => (
                  <div key={idx}>
                    <input
                      type="text"
                      value={dim.name}
                      onChange={(e) => updateDimension(idx, "name", e.target.value)}
                      placeholder={`項目 ${idx + 1}`}
                      className="w-full text-sm border border-[#E5DCD0] rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#1A1A2E]/10 focus:border-[#1A1A2E] bg-white transition-all mb-2"
                    />

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-[#8B8489] block mb-1">ビフォー</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min="1"
                            max="5"
                            value={dim.before}
                            onChange={(e) => updateDimension(idx, "before", e.target.value)}
                            className="flex-1 h-2 bg-red-200 rounded-lg appearance-none cursor-pointer accent-red-500"
                          />
                          <span className="text-sm font-bold text-[#1A1A2E] w-8">{dim.before}</span>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs text-[#8B8489] block mb-1">アフター</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min="1"
                            max="5"
                            value={dim.after}
                            onChange={(e) => updateDimension(idx, "after", e.target.value)}
                            className="flex-1 h-2 bg-emerald-200 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                          />
                          <span className="text-sm font-bold text-[#1A1A2E] w-8">{dim.after}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={submitting || !form.type.trim() || form.dimensions.some(d => !d.name.trim())}
            className="w-full mt-5 bg-[#1A1A2E] text-white py-3 rounded-xl hover:bg-[#141423] disabled:bg-[#C9BDAE] disabled:text-[#8B8489] transition-colors font-medium text-sm"
          >
            {submitting ? "保存中..." : "評価を保存"}
          </button>
        </div>

        {/* Past Assessments */}
        {assessments.length === 0 ? (
          <div className="card p-8 text-center">
            <div className="w-12 h-12 bg-[#EFE8DD] rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8B8489" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><polyline points="8 12 12 16 16 12"/>
              </svg>
            </div>
            <p className="text-[#5B5560] text-sm mb-1">評価がまだありません</p>
            <p className="text-xs text-[#8B8489]">成長を記録して比較しましょう</p>
          </div>
        ) : (
          <div className="space-y-3">
            {assessments.map((assessment) => (
              <div key={assessment.id} className="card p-4">
                <p className="text-[10px] text-[#8B8489] font-medium tracking-wide uppercase mb-3">
                  {new Date(assessment.date).toLocaleDateString("ja-JP")} • {assessment.type}
                </p>

                <div className="space-y-2">
                  {assessment.dimensions.map((dim, idx) => (
                    <div key={idx}>
                      <p className="text-xs font-medium text-[#1A1A2E] mb-1">{dim.name}</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-red-100 rounded-full h-2 relative">
                          <div
                            className="bg-red-500 h-2 rounded-full"
                            style={{ width: `${(dim.before / 5) * 100}%` }}
                          ></div>
                        </div>
                        <span className="text-xs text-[#8B8489]">{dim.before}</span>
                        <div className="flex-1 bg-emerald-100 rounded-full h-2 relative">
                          <div
                            className="bg-emerald-500 h-2 rounded-full"
                            style={{ width: `${(dim.after / 5) * 100}%` }}
                          ></div>
                        </div>
                        <span className="text-xs text-[#8B8489]">{dim.after}</span>
                        {dim.after > dim.before && (
                          <span className="text-sm font-bold text-emerald-600">+{dim.after - dim.before}</span>
                        )}
                      </div>
                    </div>
                  ))}
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
