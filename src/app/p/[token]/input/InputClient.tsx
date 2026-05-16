"use client";

import { useRouter } from "next/navigation";
import { getTodayJST, getCurrentHourJST, isGracePeriod } from "@/lib/date-utils";
import { getPlaceholderExample, type CustomExampleSet } from "@/lib/placeholder-examples";
import { useState, useEffect, useRef } from "react";
import { useFeatures } from "@/lib/use-features";
import { StructuredInput } from "@/components/features/StructuredInput";
import { DoubleLoopPrompt } from "@/components/features/DoubleLoopPrompt";
import { useRuminationDetector, BreathingPrompt } from "@/components/features/RuminationTimerIntegration";
import { VoiceInputButton } from "@/components/features/VoiceInput";
import { DailyQuestionsBlock } from "@/components/features/DailyQuestionsBlock";

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

export type InputPageInitialData = {
  participant: ParticipantBasic;
  todayLog: TodayLog | null;
  initialIsMorning: boolean;
  initialMorningClosed: boolean;
  initialAlreadyCompleted: boolean;
};

interface Props {
  token: string;
  initialData: InputPageInitialData;
}

export default function InputPage({ token, initialData }: Props) {
  const router = useRouter();
  const { isOn } = useFeatures();

  const [participant, setParticipant] = useState<ParticipantBasic>(initialData.participant);
  const [step, setStep] = useState(1);
  const [morning, setMorning] = useState("");
  const [evening, setEvening] = useState("");
  const [energy, setEnergy] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [now, setNow] = useState(new Date());
  const [todayLog, setTodayLog] = useState<TodayLog | null>(initialData.todayLog);
  const [isMorning, setIsMorning] = useState(initialData.initialIsMorning);
  const [morningClosed, setMorningClosed] = useState(initialData.initialMorningClosed);
  const [alreadyCompleted, setAlreadyCompleted] = useState(initialData.initialAlreadyCompleted);
  const [customExamples, setCustomExamples] = useState<CustomExampleSet[] | null>(null);
  const [showDoubleLoop, setShowDoubleLoop] = useState(true);
  const [structuredInput, setStructuredInput] = useState<StructuredInputState>({
    fact: "",
    observation: "",
    lesson: "",
  });
  const [dailyQuestions, setDailyQuestions] = useState<{ morning: string[]; evening: string[]; axis: string; day: string }>({
    morning: [],
    evening: [],
    axis: "",
    day: "",
  });
  const [dailyQuestionsEnabled, setDailyQuestionsEnabled] = useState(false);
  const eveningTextareaRef = useRef<HTMLTextAreaElement>(null);
  const morningTextareaRef = useRef<HTMLTextAreaElement>(null);

  const focusedAtRef = useRef<number | null>(null);
  const [completedDurationSec, setCompletedDurationSec] = useState<number | null>(null);
  const handleFocus = () => {
    if (focusedAtRef.current === null) {
      focusedAtRef.current = Date.now();
    }
  };

  const useStructured = isOn("tier-s.structuredInput");
  const useDoubleLoop = isOn("tier-s.doubleLoopPrompt");
  const useRumination = isOn("tier-e.ruminationTimer");
  const useDailyQuestions = isOn("feature.dailyQuestions");

  useEffect(() => {
    if (!useDailyQuestions) return;
    let cancelled = false;
    fetch(`/api/features/daily-questions?token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.enabled) return;
        const morning: string[] = Array.isArray(data.morning) ? data.morning.filter((s: unknown) => typeof s === "string") : [];
        const evening: string[] = Array.isArray(data.evening) ? data.evening.filter((s: unknown) => typeof s === "string") : [];
        const axis: string = typeof data.axis === "string" ? data.axis : "";
        const day: string = typeof data.day === "string" ? data.day : "";
        if (morning.length > 0 || evening.length > 0) {
          setDailyQuestions({ morning, evening, axis, day });
          setDailyQuestionsEnabled(true);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [useDailyQuestions, token]);
  const useVoice = isOn("tier-e.voiceInput");

  const ruminationEveningState = useRuminationDetector(eveningTextareaRef, useRumination && !isMorning);
  const ruminationMorningState = useRuminationDetector(morningTextareaRef, useRumination && isMorning);

  const today = getTodayJST();

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/logs?token=${token}`);
        if (cancelled || !res.ok) return;
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
        const inGracePeriod = isGracePeriod();
        if (todayEntry && todayEntry.morningIntent) {
          setTodayLog(todayEntry);
          if (todayEntry.status === "complete" || todayEntry.status === "fb_done") {
            setAlreadyCompleted(true);
          } else {
            setIsMorning(false);
          }
        } else if (hour >= 12 || inGracePeriod) {
          setIsMorning(false);
          setMorningClosed(true);
        }
      } catch {}
    })();
    (async () => {
      try {
        const res = await fetch(`/api/placeholder-examples?token=${token}`);
        if (cancelled || !res.ok) return;
        const data = await res.json();
        if (data.examples && Array.isArray(data.examples) && data.examples.length > 0) {
          setCustomExamples(data.examples);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
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
          <p className="text-[#5B5560] text-sm mb-8">朝の意図と本日の振り返りが記入されています</p>
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

    let durationSec: number | null = null;
    if (focusedAtRef.current !== null) {
      const elapsed = Math.round((Date.now() - focusedAtRef.current) / 1000);
      if (elapsed >= 0 && elapsed <= 1800) {
        durationSec = elapsed;
      } else if (elapsed > 1800) {
        durationSec = 1800;
      }
    }

    try {
      let eveningText = evening;
      if (useStructured && !isMorning) {
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
          morningDurationSec: durationSec,
        };
      } else if (morningClosed && !todayLog) {
        body = {
          type: "evening_only",
          token,
          participantName: participant.name,
          date: today,
          eveningInsight: eveningText,
          energy,
          dojoPhase: participant.dojoPhase || "守",
          weekNum: participant.weekNum || 1,
          eveningDurationSec: durationSec,
        };
      } else {
        body = {
          type: "evening",
          token,
          pageId: todayLog?.id || "",
          eveningInsight: eveningText,
          energy,
          eveningDurationSec: durationSec,
        };
      }

      const res = await fetch("/api/entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setCompletedDurationSec(durationSec);
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

  const formatDurationJP = (sec: number | null): string | null => {
    if (sec === null || sec < 5) return null;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m === 0) return `${s} 秒`;
    if (s === 0) return `${m} 分`;
    return `${m} 分 ${s} 秒`;
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
    const durationLabel = formatDurationJP(completedDurationSec);
    return (
      <div className="min-h-screen bg-[#F5F0EB] flex items-center justify-center p-6">
        <div className="max-w-md mx-auto text-center animate-scale-in">
          <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-[#1A1A2E] mb-2">記入完了</h2>
          <p className="text-[#5B5560] text-sm mb-4">
            {isMorning ? "今日の意図が設定されました" : "今日の振り返りが記録されました"}
          </p>
          {durationLabel && (
            <p className="text-[#8B8489] text-xs mb-8 font-light">
              {isMorning ? "朝の意図" : "本日の振り返り"}を <span className="text-[#1A1A2E] font-medium">{durationLabel}</span> で書きました
            </p>
          )}
          {!durationLabel && <div className="mb-8" />}
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
            {isMorning ? "朝の意図設定" : "本日の振り返り"}
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
        {step === 1 && useDoubleLoop && isMorning && showDoubleLoop && (
          <DoubleLoopPrompt
            token={token}
            isVisible={showDoubleLoop}
            onDismiss={() => setShowDoubleLoop(false)}
          />
        )}

        <div className="flex gap-2 mb-8">
          <div className={`flex-1 h-1 rounded-full transition-colors duration-300 ${
            step >= 1 ? "bg-[#1A1A2E]" : "bg-[#E5DCD0]"
          }`}></div>
          <div className={`flex-1 h-1 rounded-full transition-colors duration-300 ${
            step >= 2 ? "bg-[#1A1A2E]" : "bg-[#E5DCD0]"
          }`}></div>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            {!isMorning && todayLog && (
              <div className="bg-[#F2F2F7] border border-indigo-100 p-4 rounded-2xl">
                <p className="text-[10px] text-[#4D4D6D] font-medium tracking-wide uppercase mb-1">今朝の意図</p>
                <p className="text-sm text-[#1A1A2E] leading-relaxed">{todayLog.morningIntent}</p>
              </div>
            )}

            {dailyQuestionsEnabled && (isMorning ? dailyQuestions.morning.length : dailyQuestions.evening.length) > 0 ? (
              <>
                {dailyQuestions.axis && (
                  <p className="text-xs text-[#8B8489] mb-3 tracking-wide">
                    今日の軸 ── <span className="text-[#1A1A2E] font-medium">{dailyQuestions.axis}</span>
                  </p>
                )}
                <DailyQuestionsBlock
                  questions={isMorning ? dailyQuestions.morning : dailyQuestions.evening}
                  onCombinedChange={(combined) => {
                    if (isMorning) setMorning(combined);
                    else setEvening(combined);
                  }}
                  onFirstFocus={handleFocus}
                />
              </>
            ) : useStructured ? (
              <StructuredInput
                value={structuredInput}
                onChange={setStructuredInput}
                isMorning={isMorning}
                onFirstFocus={handleFocus}
              />
            ) : (
              <div className="space-y-4">
                <div className="relative">
                  <textarea
                    ref={isMorning ? morningTextareaRef : eveningTextareaRef}
                    value={isMorning ? morning : evening}
                    onChange={(e) => (isMorning ? setMorning(e.target.value) : setEvening(e.target.value))}
                    onFocus={handleFocus}
                    placeholder={getPlaceholderExample({
                      token,
                      dojoPhase: participant.dojoPhase,
                      date: today,
                      type: isMorning ? "morning" : "evening",
                      customExamples,
                    })}
                    className="input-field min-h-[200px] resize-none leading-relaxed pr-12"
                  />
                  {useVoice && (
                    <div className="absolute bottom-3 right-3">
                      <VoiceInputButton
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

            {useRumination && isMorning && ruminationMorningState.showBreathingPrompt && (
              <BreathingPrompt onDismiss={ruminationMorningState.handleDismiss} />
            )}
            {useRumination && !isMorning && ruminationEveningState.showBreathingPrompt && (
              <BreathingPrompt onDismiss={ruminationEveningState.handleDismiss} />
            )}
          </div>
        )}

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
