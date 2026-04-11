"use client";

import { useParams } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { useFeatures } from "@/lib/use-features";
import Link from "next/link";
import { useState, useEffect } from "react";

type HEROAssessment = {
  id: string;
  date: string;
  hope: number;
  efficacy: number;
  resilience: number;
  optimism: number;
};

export default function HEROPage() {
  const params = useParams();
  const token = params.token as string;

  const { isOn } = useFeatures();
  const [assessments, setAssessments] = useState<HEROAssessment[]>([]);
  const [values, setValues] = useState({ hope: 3, efficacy: 3, resilience: 3, optimism: 3 });
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [badges, setBadges] = useState<{ feedback: number; feedbackTotal: number; mission: number }>({ feedback: 0, feedbackTotal: 0, mission: 0 });

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/features/hero?token=${token}`);
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
    setSubmitting(true);
    try {
      const res = await fetch("/api/features/hero", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...values }),
      });
      if (res.ok) {
        const refreshRes = await fetch(`/api/features/hero?token=${token}`);
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          setAssessments(data.assessments || []);
        }
      }
    } catch {
      // silently fail
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOn("tier-d.heroAssessment")) {
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

  const labels = { hope: "希望", efficacy: "効力感", resilience: "回復力", optimism: "楽観性" };
  const keys = ["hope", "efficacy", "resilience", "optimism"] as const;

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
          <h1 className="text-2xl font-semibold tracking-tight">HERO自己評価</h1>
          <p className="text-indigo-200 text-sm mt-1 font-light">希望・効力感・回復力・楽観性の診断</p>
        </div>
      </div>

      <div className="max-w-md mx-auto px-5 pt-5 animate-fade-up relative z-10">
        {/* Input Card */}
        <div className="card p-5 mb-5">
          <h3 className="font-semibold text-sm text-[#1A1A2E] mb-5">現在のあなたの状態を評価してください (1-5)</h3>
          <div className="space-y-4">
            {keys.map((key) => (
              <div key={key}>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-[#1A1A2E]">{labels[key]}</label>
                  <span className="text-lg font-bold text-[#1A1A2E]">{values[key]}</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={values[key]}
                  onChange={(e) => setValues({ ...values, [key]: parseInt(e.target.value) })}
                  className="w-full h-2 bg-[#E5DCD0] rounded-lg appearance-none cursor-pointer accent-[#1A1A2E]"
                />
              </div>
            ))}
          </div>
          <button
            onClick={handleSubmit}
            disabled={submitting}
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
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>
              </svg>
            </div>
            <p className="text-[#5B5560] text-sm mb-1">評価がまだありません</p>
            <p className="text-xs text-[#8B8489]">上記で評価を入力して保存してください</p>
          </div>
        ) : (
          <div>
            <h3 className="font-semibold text-sm text-[#1A1A2E] mb-3">過去の評価</h3>
            <div className="space-y-2">
              {assessments.map((assessment) => (
                <div key={assessment.id} className="card p-4">
                  <p className="text-[10px] text-[#8B8489] font-medium tracking-wide uppercase mb-2">
                    {new Date(assessment.date).toLocaleDateString("ja-JP")}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {keys.map((key) => (
                      <div key={key} className="bg-[#F5F0EB] p-2.5 rounded-lg">
                        <p className="text-[10px] text-[#8B8489] font-medium mb-1">{labels[key]}</p>
                        <p className="text-lg font-bold text-[#1A1A2E]">{assessment[key]}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <BottomNav active="home" baseUrl={`/p/${token}`} badges={badges} />
    </div>
  );
}
