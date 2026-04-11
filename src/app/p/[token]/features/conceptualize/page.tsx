"use client";

import { useParams } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { useFeatures } from "@/lib/use-features";
import Link from "next/link";
import { useState, useEffect } from "react";

type Concept = {
  id: string;
  date: string;
  thesis: string;
  selected: boolean;
};

type ConceptCandidate = {
  id: string;
  thesis: string;
};

export default function ConceptualizePage() {
  const params = useParams();
  const token = params.token as string;

  const { isOn } = useFeatures();
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [candidates, setCandidates] = useState<ConceptCandidate[]>([]);
  const [showCandidates, setShowCandidates] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [badges, setBadges] = useState<{ feedback: number; feedbackTotal: number; mission: number }>({ feedback: 0, feedbackTotal: 0, mission: 0 });

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/features/conceptualize?token=${token}`);
        if (res.ok) {
          const data = await res.json();
          setConcepts(data.concepts || []);
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

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/features/conceptualize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action: "generate" }),
      });
      if (res.ok) {
        const data = await res.json();
        setCandidates(data.candidates || []);
        setShowCandidates(true);
      }
    } catch {
      // silently fail
    } finally {
      setGenerating(false);
    }
  };

  const handleSelect = async (conceptId: string) => {
    setSelecting(conceptId);
    try {
      const res = await fetch("/api/features/conceptualize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action: "select", conceptId }),
      });
      if (res.ok) {
        const refreshRes = await fetch(`/api/features/conceptualize?token=${token}`);
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          setConcepts(data.concepts || []);
        }
        setShowCandidates(false);
        setCandidates([]);
      }
    } catch {
      // silently fail
    } finally {
      setSelecting(null);
    }
  };

  if (!isOn("tier-s.weeklyConceptualization")) {
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
          <h1 className="text-2xl font-semibold tracking-tight">週次コンセプト化</h1>
          <p className="text-indigo-200 text-sm mt-1 font-light">今週の学びのテーゼ選定</p>
        </div>
      </div>

      <div className="max-w-md mx-auto px-5 pt-5 animate-fade-up relative z-10">
        {!showCandidates && (
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="w-full mb-5 flex items-center justify-center gap-2 py-3 rounded-2xl bg-[#1A1A2E] text-white hover:bg-[#141423] disabled:bg-[#C9BDAE] disabled:text-[#8B8489] transition-colors font-medium text-sm"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 2.2"/>
            </svg>
            {generating ? "生成中..." : "3つの候補を生成"}
          </button>
        )}

        {showCandidates && candidates.length > 0 && (
          <div className="space-y-3 mb-5">
            <p className="text-sm font-semibold text-[#1A1A2E] mb-3">今週のテーゼ候補を選んでください</p>
            {candidates.map((candidate) => (
              <button
                key={candidate.id}
                onClick={() => handleSelect(candidate.id)}
                disabled={selecting !== null}
                className="card p-4 w-full text-left hover:bg-[#FBF8F4] transition-colors disabled:opacity-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-[#2C2C4A] leading-relaxed flex-1">{candidate.thesis}</p>
                  <div className="flex-shrink-0 w-5 h-5 rounded-full border-2 border-[#1A1A2E] flex items-center justify-center">
                    {selecting === candidate.id && <div className="w-2 h-2 bg-[#1A1A2E] rounded-full"></div>}
                  </div>
                </div>
              </button>
            ))}
            <button
              onClick={() => setShowCandidates(false)}
              className="text-xs text-[#8B8489] hover:text-[#5B5560] px-3 py-2 transition-colors"
            >
              キャンセル
            </button>
          </div>
        )}

        {concepts.length === 0 ? (
          <div className="card p-8 text-center">
            <div className="w-12 h-12 bg-[#EFE8DD] rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8B8489" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>
              </svg>
            </div>
            <p className="text-[#5B5560] text-sm mb-1">テーゼが未設定です</p>
            <p className="text-xs text-[#8B8489]">「候補を生成」ボタンで今週のテーゼを決定しましょう</p>
          </div>
        ) : (
          <div className="space-y-3">
            {concepts.map((concept) => (
              <div key={concept.id} className={`card p-4 ${concept.selected ? "border-2 border-[#1A1A2E] bg-gradient-to-br from-indigo-50 to-purple-50" : ""}`}>
                <div className="flex items-start gap-3 mb-2">
                  {concept.selected && (
                    <div className="flex-shrink-0 w-5 h-5 bg-[#1A1A2E] rounded-full flex items-center justify-center flex-none">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    </div>
                  )}
                  <div className="flex-1">
                    <p className="text-[10px] text-[#8B8489] font-medium tracking-wide uppercase mb-1">
                      {new Date(concept.date).toLocaleDateString("ja-JP")}
                    </p>
                    <p className="text-sm text-[#2C2C4A] leading-relaxed">{concept.thesis}</p>
                  </div>
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
