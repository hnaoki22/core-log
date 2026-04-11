"use client";

import { useEffect, useState } from "react";

interface DoubleLoopPromptProps {
  token: string;
  onDismiss: () => void;
  isVisible: boolean;
}

export function DoubleLoopPrompt({ token, onDismiss, isVisible }: DoubleLoopPromptProps) {
  const [prompt, setPrompt] = useState<{ question: string; weekNumber: number } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isVisible) return;

    async function fetchPrompt() {
      setLoading(true);
      try {
        const res = await fetch(`/api/features/double-loop?token=${token}`);
        if (res.ok) {
          const data = await res.json();
          if (data.isMonday) {
            setPrompt({ question: data.question, weekNumber: data.weekNumber });
          } else {
            onDismiss();
          }
        }
      } catch {
        onDismiss();
      } finally {
        setLoading(false);
      }
    }

    fetchPrompt();
  }, [token, isVisible, onDismiss]);

  if (!isVisible || !prompt) {
    return null;
  }

  return (
    <div className="mb-4 card p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="text-lg">💭</div>
        <div className="flex-1">
          <p className="text-[11px] font-medium text-[#5B5560] uppercase tracking-wide mb-2">
            Week {prompt.weekNumber} のチャレンジ
          </p>
          <p className="text-sm text-[#1A1A2E] leading-relaxed">{prompt.question}</p>
        </div>
      </div>
      <button
        onClick={onDismiss}
        disabled={loading}
        className="w-full btn-primary py-3 text-sm"
      >
        {loading ? "読み込み中..." : "考えた"}
      </button>
    </div>
  );
}
