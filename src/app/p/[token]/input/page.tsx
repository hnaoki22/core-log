"use client";

import { useParams, useRouter } from "next/navigation";
import { getTodayJST, getCurrentHourJST } from "@/lib/date-utils";
import { useState, useEffect, useRef } from "react";
import { useFeatures } from "@/lib/use-features";
import { StructuredInput } from "@/components/features/StructuredInput";
import { DoubleLoopPrompt } from "@/components/features/DoubleLoopPrompt";
import { useRuminationDetector, BreathingPrompt } from "@/components/features/RuminationTimerIntegration";
import { VoiceInputButton } from "@/components/features/VoiceInput";

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

type StructuredInputState = {
  fact: string;
  observation: string;
  lesson: string;
};

const energyOptions = [
  { id: "excellent", label: "絶好調", emoji: "🔥", color: "#C17817", bg: "bg-amber-50", border: "border-amber-300", ring: "ring-amber-200" },
  { id: "good", label: "良い", emoji: "😊", color: "#2D6A4F", bg: "bg-emerald-50", border: "border-emerald-300", ring: "ring-emerald-200" },
  { id: "okay", label: "まあまあ", emoji: "😐", color: "#5B5560", bg: "bg-gray-50", border: "border-gray-300", ring: "ring-gray-200" },
  { id: "low", label: "低調", emoji: "😞", color: "#8B1A2B", bg: "bg-red-50", border: "border-red-300", ring: "ring-red-200" },
];

export default function InputPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const { isOn } = useFeatures();

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
  const [morningClosed, setMorningClosed] = useState(false); // 12:00過ぎで朝未記入
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [alreadyCompleted, setAlreadyCompleted] = useState(false);
  const [showDoubleLoop, setShowDoubleLoop] = useState(true);
  const [structuredInput, setStructuredInput] = useState<StructuredInputState>({
    fact: "",
    observation: "",
    lesson: "",
  });
  const eveningTextareaRef = useRef<HTMLTextAreaElement>(null);
  const morningTextareaRef = useRef<HTMLTextAreaElement>(null);

  const useStructured = isOn("tier-s.structuredInput");
  const useDoubleLoop = isOn("tier-s.doubleLoopPrompt");
  const useRumination = isOn("tier-e.ruminationTimer");
  const useVoice = isOn("tier-e.voiceInput");

  const ruminationEveningState = useRuminationDetector(eveningTextareaRef, useRumination && !isMorning);
  const ruminationMorningState = useRuminationDetector(morningTextareaRef, useRumination && isMorning);

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
          const hour = getCurrentHourJST();
          if (todayEntry && todayEntry.morningIntent) {
            setTodayLog(todayEntry);
            if (todayEntry.status === "complete" || todayEntry.status === "fb_done") {
              setAlreadyCompleted(true);
            } else {
              setIsMorning(false);
            }
          } else if (hour >= 12) {
            // 12:00以降で朝未記入 → 朝はクローズ、夕方の振り返りを表示
            setIsMorning(false);
            setMorningClosed(true);
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

  if (loadingStatus || !participant) {
    return (
      <div className="min-h-screen bg-[#F5F0EB] flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-10 h-10 border-[3px] border-[#1A1A2E] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[#2C2C4A] text-sm font-medium">接続中です...</p>
          <p className="text-[#8B8489] text-xs mt-1.5">記入ページを準備しています</p>
        </div>
      </div>
    );
  }

  if (alreadyCompleted) {
    return (
      <div className="min-h-screen bg-[#F5F0EB] flex items-center justify-center p-6">
        <div className="max-w-md mx-auto text-center animate-fade-up">
          <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-[#1A1A2E] mb-2">今日の記入は完了済みです</h2>
          <p className="text-[#5B5560] text-sm mb-8">朝の意図と夕方の振り返りが記入されています</p>
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
      // Prepare evening insight text
      let eveningText = evening;
      if (useStructured && !isMorning) {
        // Concatenate structured fields
        eveningText = `【事実】\n${structuredInput.fact}\n\n【観察】\n${structuredInput.observation}\n\n【教訓】\n${structuredInput.lesson}`;
      }

      let body;
      if (isMorning) {
        body = {
          type: "morning",
          token,
          participantName: participant.name,
          date: today,
          morningIntent: useStructured ? structuredInput.fact : morning,
          energy,
          dojoPhase: participant.dojoPhase || "守",
          weekNum: participant.weekNum || 1,
        };
      } else if (morningClosed && !todayLog) {
        // 朝未記入・12:00過ぎ → 夕方のみの新規エントリー
        body = {
          type: "evening_only",
          token,
          participantName: participant.name,
          date: today,
          eveningInsight: eveningText,
          energy,
          dojoPhase: participant.dojoPhase || "守",
          weekNum: participant.weekNum || 1,
        };
      } else {
        body = {
          type: "evening",
          token,
          pageId: todayLog?.id || "",
          eveningInsight: eveningText,
          energy,
        };
      }

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
    if (step === 1) {
      if (isMorning) {
        if (useStructured && !structuredInput.fact) return;
        if (!useStructured && !morning) return;
      } else {
        if (useStructured && !structuredInput.lesson) return;
        if (!useStructured && !evening) return;
      }
    }
    if (step === 2 && !energy) return;
    if (step === 2) {
      submitEntry();
    } else {
      setStep(step + 1);
    }
  };

  const isStep1Complete = (): boolean => {
    if (isMorning) {
      return useStructured ? !!structuredInput.fact : !!morning;
    } else {
      return useStructured ? !!structuredInput.lesson : !!evening;
    }
  };

  if (completed) {
    return (
      <div className="min-h-screen bg-[#F5F0EB] flex items-center justify-center p-6">
        <div className="max-w-md mx-auto text-center animate-scale-in">
          <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-[#1A1A2E] mb-2">記入完了</h2>
          <p className="text-[#5B5560] text-sm mb-8">
            {isMorning ? "今日の意図が設定されました" : "今日の振り返りが記録されました"}
          </p>
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
    <div className="min-h-screen bg-[#F5F0EB] pb-32">
      {/* Header */}
      <div className="gradient-header text-white px-6 pt-12 pb-6">
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
        {/* Double-Loop Prompt (Monday morning only) */}
        {step === 1 && useDoubleLoop && isMorning && showDoubleLoop && (
          <DoubleLoopPrompt
            token={token}
            isVisible={showDoubleLoop}
            onDismiss={() => setShowDoubleLoop(false)}
          />
        )}

        {/* Progress Bar */}
        <div className="flex gap-2 mb-8">
          <div className={`flex-1 h-1 rounded-full transition-colors duration-300 ${
            step >= 1 ? "bg-[#1A1A2E]" : "bg-[#E5DCD0]"
          }`}></div>
          <div className={`flex-1 h-1 rounded-full transition-colors duration-300 ${
            step >= 2 ? "bg-[#1A1A2E]" : "bg-[#E5DCD0]"
          }`}></div>
        </div>

        {/* Step 1: Text Input */}
        {step === 1 && (
          <div className="space-y-4">
            {!isMorning && todayLog && (
              <div className="bg-[#F2F2F7] border border-indigo-100 p-4 rounded-2xl">
                <p className="text-[10px] text-[#4D4D6D] font-medium tracking-wide uppercase mb-1">今朝の意図</p>
                <p className="text-sm text-[#1A1A2E] leading-relaxed">{todayLog.morningIntent}</p>
              </div>
            )}

            {useStructured ? (
              <StructuredInput
                value={structuredInput}
                onChange={setStructuredInput}
                isMorning={isMorning}
              />
            ) : (
              <div className="space-y-4">
                <div className="relative">
                  <textarea
                    ref={isMorning ? morningTextareaRef : eveningTextareaRef}
                    value={isMorning ? morning : evening}
                    onChange={(e) => (isMorning ? setMorning(e.target.value) : setEvening(e.target.value))}
                    placeholder={
                      isMorning
                        ? "例：午後のプレゼンで「結論から先に言う」を意識する"
                        : "例：チームミーティングで意見が出やすい雰囲気を作った"
                    }
                    className="input-field min-h-[200px] resize-none leading-relaxed pr-12"
                  />
                  {useVoice && (
                    <div className="absolute bottom-3 right-3">
                      <VoiceInputButton
                        token={token}
                        onTextReceived={(text) => {
                          if (isMorning) {
                            setMorning((prev) => (prev ? prev + "\n" + text : text));
                          } else {
                            setEvening((prev) => (prev ? prev + "\n" + text : text));
                          }
                        }}
                      />
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-[#C9BDAE] text-right">
                  {(isMorning ? morning : evening).length} 文字
                </p>
              </div>
            )}

            {/* Rumination breathing prompt */}
            {useRumination && isMorning && ruminationMorningState.showBreathingPrompt && (
              <BreathingPrompt onDismiss={ruminationMorningState.handleDismiss} />
            )}
            {useRumination && !isMorning && ruminationEveningState.showBreathingPrompt && (
              <BreathingPrompt onDismiss={ruminationEveningState.handleDismiss} />
            )}
          </div>
        )}

        {/* Step 2: Energy Selector */}
        {step === 2 && (
          <div className="space-y-4">
            <p className="text-[#1A1A2E] font-medium text-sm mb-2">今日のエネルギーレベルは？</p>
            <div className="grid grid-cols-2 gap-3">
              {energyOptions.map((option) => (
                <button
                  key={option.id}
                  onClick={() => setEnergy(option.id)}
                  className={`p-4 rounded-2xl border-2 transition-all duration-200 ${
                    energy === option.id
                      ? `${option.border} ${option.bg} ring-2 ${option.ring}`
                      : "border-[#E5DCD0] bg-white hover:border-[#C9BDAE]"
                  }`}
                >
                  <div className="text-2xl mx-auto mb-2">{option.emoji}</div>
                  <div className="text-sm font-medium text-[#1A1A2E]">{option.label}</div>
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
              (step === 1 && !isStep1Complete()) ||
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
