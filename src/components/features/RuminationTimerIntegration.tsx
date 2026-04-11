"use client";

import { useEffect, useState } from "react";
import { useRuminationTimerHook } from "@/lib/rumination-timer";

export function BreathingPrompt({ onDismiss }: { onDismiss: () => void }) {
  const [phase, setPhase] = useState<"breathe-in" | "hold" | "breathe-out">("breathe-in");

  useEffect(() => {
    const phases: ("breathe-in" | "hold" | "breathe-out")[] = ["breathe-in", "hold", "breathe-out"];
    let currentIndex = 0;

    const interval = setInterval(() => {
      currentIndex = (currentIndex + 1) % phases.length;
      setPhase(phases[currentIndex]);
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-6">
      <div className="bg-white rounded-2xl p-8 max-w-sm text-center card-elevated">
        <div className="mb-6">
          <div className="text-[60px] mb-4 inline-block">🫁</div>
          <h3 className="text-lg font-semibold text-[#1A1A2E] mb-2">深呼吸しましょう</h3>
          <p className="text-sm text-[#5B5560] mb-4">
            同じフィールドに長時間停滞しています。<br />一度立ち上がってリセットしましょう。
          </p>
        </div>

        {/* Breathing circle */}
        <div
          className={`w-24 h-24 mx-auto mb-8 rounded-full flex items-center justify-center transition-transform duration-2000 ${
            phase === "breathe-in"
              ? "scale-125"
              : phase === "hold"
                ? "scale-125"
                : "scale-100"
          } ${
            phase === "breathe-in"
              ? "bg-blue-200"
              : phase === "hold"
                ? "bg-blue-300"
                : "bg-blue-100"
          }`}
        >
          <span className="text-[11px] font-medium text-blue-900">
            {phase === "breathe-in" && "吸って..."}
            {phase === "hold" && "止めて..."}
            {phase === "breathe-out" && "吐いて..."}
          </span>
        </div>

        <button
          onClick={onDismiss}
          className="w-full btn-primary py-3 text-sm"
        >
          了解
        </button>
      </div>
    </div>
  );
}

export function useRuminationDetector(inputRef: React.RefObject<HTMLTextAreaElement>, enabled: boolean) {
  const [showBreathingPrompt, setShowBreathingPrompt] = useState(false);

  const { resetStall } = useRuminationTimerHook(
    inputRef,
    () => {
      if (enabled) {
        setShowBreathingPrompt(true);
      }
    },
    { stallDurationMs: 180000 }
  );

  return {
    showBreathingPrompt,
    handleDismiss: () => {
      setShowBreathingPrompt(false);
      resetStall();
    },
  };
}
