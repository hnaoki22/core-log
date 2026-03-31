"use client";

import { useParams, useRouter } from "next/navigation";
import { getTodayJST } from "@/lib/date-utils";
import { useState, useEffect } from "react";

type TodayLog = {
  id: string;
  morningIntent: string;
  status: string;
};

type ParticipantBasic = {
  name: string;
  dojoPhase: string;
  weekNum?: number;
};

const energyOptions = [
  { id: "excellent", label: "絶好調", color: "#F59E0B", bg: "bg-amber-50", border: "border-amber-300", ring: "ring-amber-200" },
  { id: "good", label: "良い", color: "#059669", bg: "bg-emerald-50", border: "border-emerald-300", ring: "ring-emerald-200" },
  { id: "okay", label: "まあまあ", color: "#6B7280", bg: "bg-gray-50", border: "border-gray-300", ring: "ring-gray-200" },
  { id: "low", label: "低調", color: "#DC2626", bg: "bg-red-50", border: "border-red-300", ring: "ring-red-200" },
];

export default function InputPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [participant, setParticipant] = useState<ParticipantBasic | null>(null);
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
  const [alreadyCompleted, setAlreadyCompleted] = useState(false);

  const today = getTodayJST();

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    async function checkTodayStatus() {
      try {
        const res = await fetch(`/api/logs?token=${token}`);
        if (res.ok) {
          const data = await res.json();
          if (data.participant) {
            setParticipant({
              name: data.participant.name,
              dojoPhase: data.participant.dojoPhase,
              weekNum: data.participant.weekNum,
            });
          }
          const logs = data.logs || [];
          const todayEntry = logs.find((log: TodayLog & { date: string }) => log.date === today);
          if (todayEntry && todayEntry.morningIntent) {
            setTodayLog(todayEntry);
            if (todayEntry.status === "complete" || todayEntry.status === "fb_done") {
              setAlreadyCompleted(true);
            } else {
              setIsMorning(false);
            }
          } else {
            setIsMorning(true);
          }
        }
      } catch {
        setIsMorning(true);
      } finally {
        setLoadingStatus(false);
      }
    }
    checkTodayStatus();
  }, [token, today]);

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
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-6">
        <p className="text-[#9CA3AF] text-sm">参加者が見つかりません</p>
      </div>
    );
  }

  if (loadingStatus) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#4338CA] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[#9CA3AF] text-sm">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (alreadyCompleted) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-6">
        <div className="max-w-md mx-auto text-center animate-fade-up">
          <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-[#111827] mb-2">今日の記入は完了済みです</h2>
          <p className="text-[#6B7280] text-sm mb-8">朝の意図と夕方の振り返りが記入されています</p>
          <button
            onClick={() => router.push(`/p/${token}`)}
            className="btn-primary w-full py-3.5 text-sm"
          >
            ホームに戻る
          </button>
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
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-6">
        <div className="max-w-md mx-auto text-center animate-scale-in">
          <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-[#111827] mb-2">記入完了</h2>
          <p className="text-[#6B7280] text-sm mb-8">いい気づきですね</p>
          <button
            onClick={() => router.push(`/p/${token}`)}
            className="btn-primary w-full py-3.5 text-sm"
          >
            ホームに戻る
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB] pb-32">
      {/* Header */}
      <div className="gradient-header text-white px-6 pt-12 pb-6 rounded-b-[2rem]">
        <div className="max-w-md mx-auto relative z-10">
          <button
            onClick={() => router.push(`/p/${token}`)}
            className="text-indigo-200 hover:text-white text-sm mb-4 flex items-center gap-1 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            戻る
          </button>
          <h1 className="text-xl font-semibold tracking-tight">
            {isMorning ? "朝の意図設定" : "夜の振り返り"}
          </h1>
          <p className="text-indigo-200 text-sm mt-1.5 font-light">
            {isMorning ? "今日、ひとつだけ意識するとしたら？" : "今日やってみてどうでしたか？"}
          </p>
          <div className="flex items-center gap-3 mt-3 text-xs text-indigo-300">
            <span>{displayDate}</span>
            <span className="text-indigo-400/50">|</span>
            <span>{displayTime}</span>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-5 pt-6 animate-fade-up">
        {/* Progress Bar */}
        <div className="flex gap-2 mb-8">
          <div className={`flex-1 h-1 rounded-full transition-colors duration-300 ${
            step >= 1 ? "bg-[#4338CA]" : "bg-[#E5E7EB]"
          }`}></div>
          <div className={`flex-1 h-1 rounded-full transition-colors duration-300 ${
            step >= 2 ? "bg-[#4338CA]" : "bg-[#E5E7EB]"
          }`}></div>
        </div>

        {/* Step 1: Text Input */}
        {step === 1 && (
          <div className="space-y-4">
            {!isMorning && todayLog && (
              <div className="bg-[#EEF2FF] border border-indigo-100 p-4 rounded-2xl">
                <p className="text-[10px] text-[#6366F1] font-medium tracking-wide uppercase mb-1">今朝の意図</p>
                <p className="text-sm text-[#111827] leading-relaxed">{todayLog.morningIntent}</p>
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
              className="input-field min-h-[200px] resize-none leading-relaxed"
            />
            <p className="text-[11px] text-[#D1D5DB] text-right">
              {(isMorning ? morning : evening).length} 文字
            </p>
          </div>
        )}

        {/* Step 2: Energy Selector */}
        {step === 2 && (
          <div className="space-y-4">
            <p className="text-[#111827] font-medium text-sm mb-2">今日のエネルギーレベルは？</p>
            <div className="grid grid-cols-2 gap-3">
              {energyOptions.map((option) => (
                <button
                  key={option.id}
                  onClick={() => setEnergy(option.id)}
                  className={`p-4 rounded-2xl border-2 transition-all duration-200 ${
                    energy === option.id
                      ? `${option.border} ${option.bg} ring-2 ${option.ring}`
                      : "border-[#E5E7EB] bg-white hover:border-[#D1D5DB]"
                  }`}
                >
                  <div
                    className="w-3 h-3 rounded-full mx-auto mb-3"
                    style={{ backgroundColor: option.color }}
                  ></div>
                  <div className="text-sm font-medium text-[#111827]">{option.label}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-8 space-y-3">
          {submitError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
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
            className="btn-primary w-full py-3.5 text-sm"
          >
            {isSubmitting ? "保存中..." : step === 1 ? "次へ" : "記入を完了する"}
          </button>
          {step === 2 && (
            <button
              onClick={() => setStep(1)}
              className="btn-secondary w-full py-3.5 text-sm"
            >
              戻る
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
