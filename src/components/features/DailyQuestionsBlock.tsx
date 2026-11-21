"use client";

// DailyQuestionsBlock — renders the day's questions, each with its own textarea.
// The Whisper mic is rendered only when the caller passes voiceEnabled=true
// (= the tenant has `tier-e.voiceInput` ON). Tenants without voice input would
// otherwise get a mic button whose request the voice-input API rejects (403).
//
// Why a separate component:
//   InputClient.tsx already juggles 5 modes (free/structured/double-loop/...).
//   Adding a 4th branch in-line would make it unreadable. We compose the
//   3-answer state here and emit a single combined string to the parent so
//   the existing log-submission pipeline (which expects a single morningIntent
//   / eveningInsight string) does not need to change.
//
// Combined format (kept human- and AI-parseable):
//   Q1: 今日…？
//   A1: <answer1>
//
//   Q2: …
//   A2: <answer2>

import { useCallback, useEffect, useState } from "react";
import { VoiceInputButton } from "./VoiceInput";

interface Props {
  questions: string[];
  /** Called with the combined Q&A text whenever any answer changes. */
  onCombinedChange: (combined: string) => void;
  /** Called on first focus into any answer field (parity with existing handleFocus). */
  onFirstFocus?: () => void;
  /**
   * Whether to show the Whisper mic. Required (no default) so every caller
   * decides explicitly — pass `isOn("tier-e.voiceInput")`, the same gate the
   * free-text textarea in InputClient uses.
   */
  voiceEnabled: boolean;
}

function buildCombined(questions: string[], answers: string[]): string {
  return questions
    .map((q, i) => `Q${i + 1}: ${q}\nA${i + 1}: ${(answers[i] || "").trim()}`)
    .join("\n\n");
}

export function DailyQuestionsBlock({
  questions,
  onCombinedChange,
  onFirstFocus,
  voiceEnabled,
}: Props) {
  const [answers, setAnswers] = useState<string[]>(() =>
    questions.map(() => "")
  );
  const [focused, setFocused] = useState(false);

  // Re-sync answer slots if the question count changes (defensive).
  useEffect(() => {
    setAnswers((prev) => {
      if (prev.length === questions.length) return prev;
      const next = questions.map((_, i) => prev[i] || "");
      return next;
    });
  }, [questions.length, questions]);

  const handleAnswerChange = useCallback(
    (index: number, value: string) => {
      setAnswers((prev) => {
        const next = [...prev];
        next[index] = value;
        onCombinedChange(buildCombined(questions, next));
        return next;
      });
    },
    [questions, onCombinedChange]
  );

  const handleFocus = useCallback(() => {
    if (!focused) {
      setFocused(true);
      onFirstFocus?.();
    }
  }, [focused, onFirstFocus]);

  const handleVoice = useCallback(
    (index: number, text: string) => {
      setAnswers((prev) => {
        const next = [...prev];
        next[index] = next[index] ? next[index] + "\n" + text : text;
        onCombinedChange(buildCombined(questions, next));
        return next;
      });
    },
    [questions, onCombinedChange]
  );

  return (
    <div className="space-y-6">
      {questions.map((q, i) => (
        <div key={i} className="space-y-2">
          <label
            htmlFor={`daily-q-${i}`}
            className="block text-sm font-medium text-[#1A1A2E] leading-relaxed"
          >
            <span className="text-[#8B8489] text-xs mr-2">Q{i + 1}</span>
            {q}
          </label>
          <div className="relative">
            <textarea
              id={`daily-q-${i}`}
              value={answers[i] || ""}
              onChange={(e) => handleAnswerChange(i, e.target.value)}
              onFocus={handleFocus}
              placeholder={voiceEnabled ? "ここに書く（音声入力も可）" : "ここに書く"}
              className="input-field min-h-[120px] resize-none leading-relaxed pr-12"
            />
            {voiceEnabled && (
              <div className="absolute bottom-3 right-3">
                <VoiceInputButton
                  onTextReceived={(text) => handleVoice(i, text)}
                />
              </div>
            )}
            <p className="text-[11px] text-[#C9BDAE] text-right mt-1">
              {(answers[i] || "").length} 文字
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
