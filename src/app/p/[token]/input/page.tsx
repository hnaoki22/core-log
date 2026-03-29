"use client";

import { useParams, useRouter } from "next/navigation";
import { getParticipantByToken } from "@/lib/mock-data";
import { useState, useEffect } from "react";

type TodayLog = {
  id: string;
  morningIntent: string;
  status: string;
};

export default function InputPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const participant = getParticipantByToken(token);

  const [step, setStep] = useState(1);
  const [morning, setMorning] = useState("");
  const [evening, setEvening] = useState("");
  const [energy, setEnergy] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [now, setNow] = useState(new Date());
  const [todayLog, setTodayLog] = useState<TodayLog | null>(null);
  const [isMorning, setIsMorning] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState(true);

  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch today's log status from API (Notion) to determine morning/evening mode
  useEffect(() => {
    async function checkTodayStatus() {
      try {
        const res = await fetch(`/api/logs?token=${token}`);
        if (res.ok) {
          const data = await res.json();
          const logs = data.logs || [];
          const todayEntry = logs.find((log: TodayLog & { date: string }) => log.date === today);
          if (todayEntry && todayEntry.morningIntent) {
            setTodayLog(todayEntry);
            setIsMorning(false);
          } else {
            setIsMorning(true);
          }
        }
      } catch {
        // If API fails, default to morning mode
        setIsMorning(true);
      } finally {
        setLoadingStatus(false);
      }
    }
    checkTodayStatus();
  }, [token, today]);

  // Format date and time for display
  const displayDate = now.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
  const displayTime = now.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (!participant) {
    return (
      <div className="min-h-screen bg-[#F8F7FF] flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-[#8B85A8]">参加者が見つかりません</p>
        </div>
      </div>
    );
  }

  if (loadingStatus) {
    return (
      <div className="min-h-screen bg-[#F8F7FF] flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-8 h-8 border-3 border-[#5B4FD6] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[#8B85A8]">読み込み中...</p>
        </div>
      </div>
    );
  }

  const submitEntry = async () => {
    setIsSubmitting(true);
    setSubmitError("");

    try {
      const body = isMorning
        ? {
            type: "morning",
            token,
            participantName: participant.name,
            date: today,
            morningIntent: morning,
            energy,
            dojoPhase: participant.dojoPhase || "守",
            weekNum: participant.weekNum || 1,
          }
        : {
            type: "evening",
            token,
            pageId: todayLog?.id || "",
            eveningInsight: evening,
            energy,
          };

      const res = await fetch("/api/entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setCompleted(true);
      } else {
        const data = await res.json();
        setSubmitError(data.error || "保存に失敗しました");
      }
    } catch {
      setSubmitError("通信エラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNext = () => {
    if (step === 1 && (isMorning ? !morning : !evening)) return;
    if (step === 2 && !energy) return;
    if (step === 2) {
      submitEntry();
    } else {
      setStep(step + 1);
    }
  };

  if (completed) {
    return (
      <div className="min-h-screen bg-[#F8F7FF] flex items-center justify-center p-6">
        <div className="max-w-md mx-auto text-center">
          <div className="w-16 h-16 bg-[#22C55E] rounded-full flex items-center justify-center mx-auto mb-6 animate-scale">
            <span className="text-4xl">✓</span>
          </div>
          <h2 className="text-2xl font-bold text-[#1E1B3A] mb-2">記入完了！</h2>
          <p className="text-[#8B85A8] mb-2">いい気づきですね</p>
          <button
            onClick={() => router.push(`/p/${token}`)}
            className="w-full bg-gradient-to-r from-[#5B4FD6] to-[#7C6FEA] text-white py-3 rounded-lg font-semibold hover:shadow-lg transition-shadow"
          >
            ホームに戻る
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F7FF] pb-32">
      {/* Header */}
      <div className="gradient-purple text-white p-6 rounded-b-3xl">
        <div className="max-w-md mx-auto">
          <h1 className="text-xl font-bold">
            {isMorning ? "朝の意図設定" : "夜の振り返り"}
          </h1>
          <p className="text-sm opacity-90 mt-2">
            {isMorning ? "今日、ひとつだけ意識するとしたら？" : "今日やってみてどうでしたか？"}
          </p>
          <div className="flex items-center gap-3 mt-3 text-sm opacity-80">
            <span>{displayDate}</span>
            <span>{displayTime}</span>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-6 pt-8">
        {/* Progress Dots */}
        <div className="flex gap-2 mb-8">
          <div
            className={`flex-1 h-1 rounded-full transition-colors ${
              step >= 1 ? "bg-[#5B4FD6]" : "bg-[#E8E5F0]"
            }`}
          ></div>
          <div
            className={`flex-1 h-1 rounded-full transition-colors ${
              step >= 2 ? "bg-[#5B4FD6]" : "bg-[#E8E5F0]"
            }`}
          ></div>
        </div>

        {/* Step 1: Text Input */}
        {step === 1 && (
          <div className="space-y-4">
            {!isMorning && todayLog && (
              <div className="bg-[#EDE9FF] p-4 rounded-lg mb-4">
                <p className="text-xs text-[#8B85A8] mb-1">今朝の意図</p>
                <p className="text-[#1E1B3A] font-medium">{todayLog.morningIntent}</p>
              </div>
            )}
            <textarea
              value={isMorning ? morning : evening}
              onChange={(e) => (isMorning ? setMorning(e.target.value) : setEvening(e.target.value))}
              placeholder={
                isMorning
                  ? "例：午後のプレゼンで「結論から先に言う」を意識する"
                  : "例：チームミーティングで意見が出やすい雰囲気を作った"
              }
              className="w-full p-4 bg-white border border-[#E8E5F0] rounded-lg focus:outline-none focus:border-[#5B4FD6] focus:ring-1 focus:ring-[#5B4FD6] min-h-[200px] resize-none text-[#1E1B3A]"
            />
          </div>
        )}

        {/* Step 2: Energy Selector */}
        {step === 2 && (
          <div className="space-y-4">
            <p className="text-[#1E1B3A] font-medium mb-4">今日のエネルギーレベルは？</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { id: "excellent", emoji: "🔥", label: "絶好調" },
                { id: "good", emoji: "😊", label: "良い" },
                { id: "okay", emoji: "😐", label: "まあまあ" },
                { id: "low", emoji: "😞", label: "低調" },
              ].map((option) => (
                <button
                  key={option.id}
                  onClick={() => setEnergy(option.id)}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    energy === option.id
                      ? "border-[#5B4FD6] bg-[#EDE9FF]"
                      : "border-[#E8E5F0] bg-white hover:border-[#5B4FD6]"
                  }`}
                >
                  <div className="text-3xl mb-2">{option.emoji}</div>
                  <div className="text-sm font-medium text-[#1E1B3A]">{option.label}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-8 space-y-3">
          {submitError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
              <p className="text-red-600 text-sm">{submitError}</p>
            </div>
          )}
          <button
            onClick={handleNext}
            disabled={
              isSubmitting ||
              (step === 1 && (isMorning ? !morning : !evening)) ||
              (step === 2 && !energy)
            }
            className={`w-full py-3 rounded-lg font-semibold transition-all ${
              isSubmitting ||
              (step === 1 && (isMorning ? !morning : !evening)) ||
              (step === 2 && !energy)
                ? "bg-[#E8E5F0] text-[#8B85A8] cursor-not-allowed"
                : "bg-gradient-to-r from-[#5B4FD6] to-[#7C6FEA] text-white hover:shadow-lg"
            }`}
          >
            {isSubmitting ? "保存中..." : step === 1 ? "次へ" : "記入を完了する"}
          </button>
          {step === 2 && (
            <button
              onClick={() => setStep(1)}
              className="w-full py-3 rounded-lg font-semibold text-[#5B4FD6] bg-white border border-[#E8E5F0] hover:bg-[#F8F7FF] transition-colors"
            >
              戻る
            </button>
          )}
        </div>
      </div>

      <style>{`
        @keyframes scale {
          0% {
            transform: scale(0.5);
            opacity: 0;
          }
          50% {
            transform: scale(1.1);
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
        .animate-scale {
          animation: scale 0.6s ease-out;
        }
      `}</style>
    </div>
  );
}
