"use client";

// DailyQuestionsBlock — renders the day's questions, each with its own textarea.
// The Whisper mic is rendered only when the caller passes voiceEnabled=true
// (= the tenant has `tier-e.voiceInput` ON). Tenants without voice input would
// otherwise get a mic button whose request the voice-input API rejects (403).
//
// Why a separate component:
//   InputClient.tsx already juggles 5 modes (free/structured/double-loop/...).
//   Adding a 4th branch in-line would make it unreadable. This component renders
//   one textarea per question and emits a single combined string to the parent so
//   the existing log-submission pipeline (which expects a single morningIntent
//   / eveningInsight string) does not need to change.
//
// Who owns the answers:
//   The parent does (controlled component). InputClient renders this block only
//   on step 1, so it unmounts when the participant moves on to the energy step.
//   If the answers lived here, pressing 「戻る」 on step 2 would remount the block
//   with empty textareas while the parent still held the previously combined
//   text — the input looked lost, and retyping one answer dropped the others.
//
// Combined format: see src/lib/daily-question-answers.ts (tested there).

import { useRef, useState } from "react";
import { VoiceInputButton } from "./VoiceInput";
import { combineQuestionAnswers, normalizeAnswers } from "@/lib/daily-question-answers";

interface Props {
  questions: string[];
  /** Per-question answers, owned by the parent (see "Who owns the answers"). */
  answers: string[];
  /**
   * Called whenever any answer changes, with the per-question answers and the
   * combined Q&A text to store. `combined` is "" while every answer is blank.
   */
  onAnswersChange: (answers: string[], combined: string) => void;
  /** Called on first focus into any answer field (parity with existing handleFocus). */
  onFirstFocus?: () => void;
  /**
   * Whether to show the Whisper mic. Required (no default) so every caller
   * decides explicitly — pass `isOn("tier-e.voiceInput")`, the same gate the
   * free-text textarea in InputClient uses.
   */
  voiceEnabled: boolean;
}

export function DailyQuestionsBlock({
  questions,
  answers,
  onAnswersChange,
  onFirstFocus,
  voiceEnabled,
}: Props) {
  const [focused, setFocused] = useState(false);

  // One slot per question, whatever length the parent's array has.
  const slots = normalizeAnswers(questions, answers);

  // Latest slots, readable from callbacks that may fire after this render:
  // the voice transcript arrives asynchronously, and the participant may have
  // typed in the meantime. `emit` also updates it eagerly so two changes in
  // the same tick build on each other instead of on a stale render.
  const slotsRef = useRef(slots);
  slotsRef.current = slots;

  const emit = (next: string[]) => {
    slotsRef.current = next;
    onAnswersChange(next, combineQuestionAnswers(questions, next));
  };

  const handleAnswerChange = (index: number, value: string) => {
    const next = [...slotsRef.current];
    next[index] = value;
    emit(next);
  };

  const handleFocus = () => {
    if (!focused) {
      setFocused(true);
      onFirstFocus?.();
    }
  };

  const handleVoice = (index: number, text: string) => {
    const next = [...slotsRef.current];
    next[index] = next[index] ? next[index] + "\n" + text : text;
    emit(next);
  };

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
              value={slots[i]}
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
              {slots[i].length} 文字
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
