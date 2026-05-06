"use client";

import { useParams, useRouter } from "next/navigation";
import { getTodayJST, getCurrentHourJST, isGracePeriod } from "@/lib/date-utils";
import { getPlaceholderExample } from "@/lib/placeholder-examples";
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

  // 記入所要時間の計測:
  //   textarea に最初にフォーカスした時刻を保存し、submit 時に経過秒数を計算する。
  //   - 最初のフォーカス時刻のみ記録（再フォーカスは無視 → 「考え始めから出すまで」を測る）
  //   - 提出後の振り返りで「N 分 N 秒で書きました」と表示するために durationSec を保持
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
          const inGracePeriod = isGracePeriod();
          if (todayEntry && todayEntry.morningIntent) {
            setTodayLog(todayEntry);
            if (todayEntry.status === "complete" || todayEntry.status === "fb_done") {
              setAlreadyCompleted(true);
            } else {
              setIsMorning(false);
            }
          } else if (hour >= 12 || inGracePeriod) {
            // 12:00以降、または深夜0:00〜3:59（グレースピリオド＝前日扱い）
            // → 朝はクローズ、本日の振り返りを表示
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

    // 記入所要時間を計算（focus → 提出ボタン押下までの経過秒数）
    // 最大 1800 秒（30 分）でクリップ。focus が取れていない場合は null。
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
          morningDurationSec: durationSec,
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
        // 完了画面で「N 分 N 秒で書きました」表示用に保持
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

  /**
   * 経過秒数を「3 分 12 秒」「45 秒」のような日本語表記に変換。
   * 5 秒未満は表示しない（誤フォーカスの可能性）。
   */
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
