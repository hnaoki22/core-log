"use client";

import { useParams } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { useFeatures } from "@/lib/use-features";
import Link from "next/link";
import { useState, useEffect, useCallback } from "react";

type Member = { id: string; name: string; role: string };
type PeerReflection = {
  id: string;
  from_participant_id: string;
  to_participant_id: string;
  from_name: string;
  to_name: string;
  question: string;
  answer: string | null;
  status: string;
  created_at: string;
  answered_at: string | null;
};

export default function PeerPage() {
  const params = useParams();
  const token = params.token as string;

  const { isOn } = useFeatures();
  const [members, setMembers] = useState<Member[]>([]);
  const [pendingForMe, setPendingForMe] = useState<PeerReflection[]>([]);
  const [sentByMe, setSentByMe] = useState<PeerReflection[]>([]);
  const [receivedAnswers, setReceivedAnswers] = useState<PeerReflection[]>([]);
  const [form, setForm] = useState({ toParticipantId: "", question: "", reflection: "" });
  const [answerForm, setAnswerForm] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"send" | "pending" | "sent">("send");
  const [badges, setBadges] = useState<{ feedback: number; feedbackTotal: number; mission: number }>({ feedback: 0, feedbackTotal: 0, mission: 0 });

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/features/peer-reflection?token=${token}`);
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members || []);
        setPendingForMe(data.pendingForMe || []);
        setSentByMe(data.sentByMe || []);
        setReceivedAnswers(data.receivedAnswers || []);
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
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubmit = async () => {
    if (!form.toParticipantId || !form.question.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/features/peer-reflection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          toParticipantId: form.toParticipantId,
          question: form.question,
          reflection: form.reflection || undefined,
        }),
      });
      if (res.ok) {
        setForm({ toParticipantId: "", question: "", reflection: "" });
        await fetchData();
        setTab("sent");
      }
    } catch {
      // silently fail
    } finally {
      setSubmitting(false);
    }
  };

  const handleAnswer = async (reflectionId: string) => {
    const answer = answerForm[reflectionId];
    if (!answer?.trim()) return;
    setAnsweringId(reflectionId);
    try {
      const res = await fetch("/api/features/peer-reflection", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, reflectionId, answer }),
      });
      if (res.ok) {
        setAnswerForm((prev) => ({ ...prev, [reflectionId]: "" }));
        await fetchData();
      }
    } catch {
      // silently fail
    } finally {
      setAnsweringId(null);
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
      {/* Header */}
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
        {/* Tab Navigation */}
        <div className="flex gap-1 bg-white rounded-xl p-1 mb-5 shadow-sm">
          <button
            onClick={() => setTab("send")}
            className={`flex-1 py-2.5 text-xs font-medium rounded-lg transition-all ${tab === "send" ? "bg-[#1A1A2E] text-white" : "text-[#5B5560] hover:bg-[#F5F0EB]"}`}
          >
            送る
          </button>
          <button
            onClick={() => setTab("pending")}
            className={`flex-1 py-2.5 text-xs font-medium rounded-lg transition-all relative ${tab === "pending" ? "bg-[#1A1A2E] text-white" : "text-[#5B5560] hover:bg-[#F5F0EB]"}`}
          >
            届いた依頼
            {pendingForMe.length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">
                {pendingForMe.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab("sent")}
            className={`flex-1 py-2.5 text-xs font-medium rounded-lg transition-all ${tab === "sent" ? "bg-[#1A1A2E] text-white" : "text-[#5B5560] hover:bg-[#F5F0EB]"}`}
          >
            送信済み
          </button>
        </div>

        {/* TAB: Send Reflection */}
        {tab === "send" && (
          <div className="card p-5 mb-5">
            <h3 className="font-semibold text-sm text-[#1A1A2E] mb-4">仲間へフィードバックを送る</h3>
            <div className="space-y-4">
              {/* Member Dropdown */}
              <div>
                <label className="text-sm font-medium text-[#1A1A2E] block mb-2">送り先 *</label>
                <select
                  value={form.toParticipantId}
                  onChange={(e) => setForm({ ...form, toParticipantId: e.target.value })}
                  className="w-full text-sm border border-[#E5DCD0] rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#1A1A2E]/10 focus:border-[#1A1A2E] bg-white transition-all appearance-none"
                >
                  <option value="">メンバーを選択してください</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Question */}
              <div>
                <label className="text-sm font-medium text-[#1A1A2E] block mb-2">質問/テーマ *</label>
                <input
                  type="text"
                  value={form.question}
                  onChange={(e) => setForm({ ...form, question: e.target.value })}
                  placeholder="例: 最近の成長点は？"
                  className="w-full text-sm border border-[#E5DCD0] rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#1A1A2E]/10 focus:border-[#1A1A2E] bg-white transition-all"
                />
              </div>

              {/* Optional Message */}
              <div>
                <label className="text-sm font-medium text-[#1A1A2E] block mb-2">メッセージ（任意）</label>
                <textarea
                  value={form.reflection}
                  onChange={(e) => setForm({ ...form, reflection: e.target.value })}
                  placeholder="相手へのフィードバックや応援メッセージ"
                  className="w-full text-sm border border-[#E5DCD0] rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-[#1A1A2E]/10 focus:border-[#1A1A2E] bg-white transition-all"
                  rows={3}
                />
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={submitting || !form.toParticipantId || !form.question.trim()}
              className="w-full mt-5 bg-[#1A1A2E] text-white py-3 rounded-xl hover:bg-[#141423] disabled:bg-[#C9BDAE] disabled:text-[#8B8489] transition-colors font-medium text-sm"
            >
              {submitting ? "送信中..." : "フィードバックを送る"}
            </button>
          </div>
        )}

        {/* TAB: Pending Requests for Me */}
        {tab === "pending" && (
          <div>
            <h3 className="font-semibold text-sm text-[#1A1A2E] mb-3">
              あなたに届いた質問
              {pendingForMe.length > 0 && (
                <span className="ml-2 text-xs text-[#8B8489] font-normal">({pendingForMe.length}件)</span>
              )}
            </h3>
            {pendingForMe.length === 0 ? (
              <div className="card p-8 text-center">
                <div className="w-12 h-12 bg-[#EFE8DD] rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8B8489" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                  </svg>
                </div>
                <p className="text-[#5B5560] text-sm mb-1">未回答のリクエストはありません</p>
                <p className="text-xs text-[#8B8489]">仲間からの質問が届くとここに表示されます</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingForMe.map((r) => (
                  <div key={r.id} className="card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-medium text-[#1A1A2E]">{r.from_name}</span>
                      <span className="text-[10px] text-[#8B8489]">{new Date(r.created_at).toLocaleDateString("ja-JP")}</span>
                    </div>
                    <p className="text-sm text-[#2C2C4A] mb-3 leading-relaxed bg-[#F5F0EB] rounded-lg px-3 py-2">{r.question}</p>

                    <textarea
                      value={answerForm[r.id] || ""}
                      onChange={(e) => setAnswerForm((prev) => ({ ...prev, [r.id]: e.target.value }))}
                      placeholder="回答を入力してください..."
                      className="w-full text-sm border border-[#E5DCD0] rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-[#1A1A2E]/10 focus:border-[#1A1A2E] bg-white transition-all"
                      rows={3}
                    />
                    <button
                      onClick={() => handleAnswer(r.id)}
                      disabled={answeringId === r.id || !answerForm[r.id]?.trim()}
                      className="w-full mt-3 bg-[#1A1A2E] text-white py-2.5 rounded-xl hover:bg-[#141423] disabled:bg-[#C9BDAE] disabled:text-[#8B8489] transition-colors font-medium text-sm"
                    >
                      {answeringId === r.id ? "送信中..." : "回答する"}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Show received answers */}
            {receivedAnswers.length > 0 && (
              <>
                <h3 className="font-semibold text-sm text-[#1A1A2E] mb-3 mt-6">回答済み</h3>
                <div className="space-y-3">
                  {receivedAnswers.map((r) => (
                    <div key={r.id} className="card p-4 opacity-75">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-medium text-[#1A1A2E]">{r.from_name}</span>
                        <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">回答済</span>
                      </div>
                      <p className="text-xs text-[#8B8489] mb-1">{r.question}</p>
                      <p className="text-sm text-[#2C2C4A] leading-relaxed">{r.answer}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* TAB: Sent by Me */}
        {tab === "sent" && (
          <div>
            <h3 className="font-semibold text-sm text-[#1A1A2E] mb-3">送信済みフィードバック</h3>
            {sentByMe.length === 0 ? (
              <div className="card p-8 text-center">
                <div className="w-12 h-12 bg-[#EFE8DD] rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8B8489" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                </div>
                <p className="text-[#5B5560] text-sm mb-1">まだフィードバックを送っていません</p>
                <p className="text-xs text-[#8B8489]">「送る」タブから仲間にフィードバックを送りましょう</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sentByMe.map((r) => (
                  <div key={r.id} className="card p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[#1A1A2E]">{r.to_name} へ</span>
                        <span className="text-[10px] text-[#8B8489]">{new Date(r.created_at).toLocaleDateString("ja-JP")}</span>
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${r.status === "answered" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                        {r.status === "answered" ? "回答あり" : "回答待ち"}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-[#8B8489] tracking-wide mb-1.5">{r.question}</p>
                    {r.answer && (
                      <div className="bg-[#F5F0EB] rounded-lg px-3 py-2 mt-2">
                        <p className="text-xs text-[#8B8489] mb-1">回答:</p>
                        <p className="text-sm text-[#2C2C4A] leading-relaxed">{r.answer}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <BottomNav active="home" baseUrl={`/p/${token}`} badges={badges} />
    </div>
  );
}
