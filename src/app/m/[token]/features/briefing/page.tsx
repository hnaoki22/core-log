"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useFeatures } from "@/lib/use-features";
import Link from "next/link";

interface BriefingData {
  briefing: {
    summary: string;
    trends: string[];
    ruminationRisk: string;
    suggestedQuestions: string[];
    keyTopics: string[];
  };
}

interface ParticipantInfo {
  name: string;
}

export default function BriefingPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const { isOn } = useFeatures();

  const [participants, setParticipants] = useState<ParticipantInfo[]>([]);
  const [selectedParticipant, setSelectedParticipant] = useState<string>("");
  const [briefing, setBriefing] = useState<BriefingData["briefing"] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dataLoading, setDataLoading] = useState(true);

  // Fetch participants from manager API
  useEffect(() => {
    async function fetchParticipants() {
      try {
        const res = await fetch(`/api/manager?token=${token}`);
        if (!res.ok) {
          setError("マネージャー情報が見つかりません");
          return;
        }
        const data = await res.json();
        setParticipants(data.participants || []);
        if (data.participants && data.participants.length > 0) {
          setSelectedParticipant(data.participants[0].name);
        }
      } catch {
        setError("参加者データの取得に失敗しました");
      } finally {
        setDataLoading(false);
      }
    }
    fetchParticipants();
  }, [token]);

  const handleGenerateBriefing = async () => {
    if (!selectedParticipant) {
      setError("参加者を選択してください");
      return;
    }

    setLoading(true);
    setError("");
    setBriefing(null);

    try {
      const res = await fetch(`/api/features/briefing?token=${token}&participantName=${encodeURIComponent(selectedParticipant)}`);
      if (!res.ok) {
        if (res.status === 403) {
          setError("ブリーフィング機能が有効化されていません");
        } else {
          setError("ブリーフィングの生成に失敗しました");
        }
        return;
      }
      const data = await res.json();
      if (data.briefing) {
        setBriefing(data.briefing);
      } else {
        setError("ブリーフィングデータを取得できませんでした");
      }
    } catch {
      setError("ブリーフィングの生成中にエラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  if (!isOn("tier-a.oneOnOneBriefing")) {
    return (
      <div className="min-h-screen bg-[#F5F0EB] flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-[#5B5560] mb-4">このフィーチャーは現在利用できません</p>
          <Link href={`/m/${token}`} className="text-[#1A1A2E] font-medium hover:underline">
            ダッシュボードに戻る
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F0EB] pb-8">
      {/* Header */}
      <div className="gradient-header-manager text-white px-6 pt-12 pb-6">
        <div className="max-w-md mx-auto relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => router.back()}
              className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25 transition-colors"
              aria-label="戻る"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight mb-1">1on1ブリーフィング</h1>
          <p className="text-indigo-300 text-sm font-light">対話の準備支援</p>
        </div>
      </div>

      <div className="max-w-md mx-auto px-5 pt-5 space-y-4 animate-fade-up relative z-10">
        {/* Participant Selection */}
        {!dataLoading && participants.length > 0 && (
          <div className="card p-4 space-y-3">
            <label className="block text-xs font-semibold text-[#5B5560] uppercase tracking-wide">
              参加者を選択
            </label>
            <select
              value={selectedParticipant}
              onChange={(e) => setSelectedParticipant(e.target.value)}
              className="w-full px-3 py-2.5 border border-[#E5DCD0] rounded-xl bg-white text-[#1A1A2E] text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              {participants.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>

            <button
              onClick={handleGenerateBriefing}
              disabled={loading}
              className="w-full btn-primary h-10 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>生成中...</span>
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                  <span>ブリーフィング生成</span>
                </>
              )}
            </button>
          </div>
        )}

        {error && (
          <div className="card p-3 border-red-200 bg-red-50">
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        {/* Briefing Display */}
        {briefing && (
          <div className="space-y-3">
            {/* Summary */}
            {briefing.summary && (
              <div className="card p-4 space-y-2">
                <h3 className="text-xs font-semibold text-[#5B5560] uppercase tracking-wide">
                  週間サマリー
                </h3>
                <p className="text-sm text-[#1A1A2E] leading-relaxed">{briefing.summary}</p>
              </div>
            )}

            {/* Trends */}
            {briefing.trends && briefing.trends.length > 0 && (
              <div className="card p-4 space-y-2">
                <h3 className="text-xs font-semibold text-[#5B5560] uppercase tracking-wide">
                  トレンド
                </h3>
                <ul className="space-y-1.5">
                  {briefing.trends.map((trend, idx) => (
                    <li key={idx} className="flex gap-2 text-sm text-[#1A1A2E]">
                      <span className="text-indigo-500 font-bold mt-0.5">•</span>
                      <span>{trend}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Rumination Risk */}
            {briefing.ruminationRisk && (
              <div className="card p-4 space-y-2 border-amber-200 bg-amber-50">
                <h3 className="text-xs font-semibold text-amber-900 uppercase tracking-wide">
                  反すうリスク
                </h3>
                <p className="text-sm text-amber-900 leading-relaxed">{briefing.ruminationRisk}</p>
              </div>
            )}

            {/* Suggested Questions */}
            {briefing.suggestedQuestions && briefing.suggestedQuestions.length > 0 && (
              <div className="card p-4 space-y-2">
                <h3 className="text-xs font-semibold text-[#5B5560] uppercase tracking-wide">
                  おすすめの質問
                </h3>
                <ul className="space-y-1.5">
                  {briefing.suggestedQuestions.map((q, idx) => (
                    <li key={idx} className="text-sm text-[#1A1A2E]">
                      <span className="text-indigo-500 font-bold mr-2">{idx + 1}.</span>
                      {q}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Key Topics */}
            {briefing.keyTopics && briefing.keyTopics.length > 0 && (
              <div className="card p-4 space-y-2">
                <h3 className="text-xs font-semibold text-[#5B5560] uppercase tracking-wide">
                  主要トピック
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {briefing.keyTopics.map((topic, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center px-2.5 py-1.5 rounded-lg bg-indigo-100 text-indigo-700 text-xs font-medium"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Empty State */}
        {!loading && !briefing && !error && !dataLoading && (
          <div className="card p-8 text-center space-y-3">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto text-[#8B8489]">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <p className="text-sm text-[#5B5560]">参加者を選択して、ブリーフィングを生成してください</p>
          </div>
        )}

        {/* Footer */}
        <div className="text-center py-6 text-[11px] text-[#C9BDAE]">
          CORE Log — ブリーフィング
        </div>
      </div>
    </div>
  );
}
