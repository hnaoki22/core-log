"use client";

import { useState, useCallback } from "react";

const STAMPS = [
  { emoji: "👍", label: "いいね" },
  { emoji: "👏", label: "拍手" },
  { emoji: "🔥", label: "すごい" },
  { emoji: "💪", label: "がんばれ" },
  { emoji: "❤️", label: "応援" },
  { emoji: "💡", label: "気づき" },
];

type Props = {
  token: string;
  entryId: string;
  existingReaction: string | null;  // comma-separated: "👍,🔥"
};

export default function ReactionStamps({ token, entryId, existingReaction }: Props) {
  const [reactions, setReactions] = useState<string[]>(
    existingReaction ? existingReaction.split(",").filter(Boolean) : []
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const handleToggle = useCallback(async (emoji: string) => {
    setSending(true);
    const prev = [...reactions];
    // Optimistic update
    const idx = reactions.indexOf(emoji);
    const next = idx >= 0 ? reactions.filter(e => e !== emoji) : [...reactions, emoji];
    setReactions(next);
    setPickerOpen(false);

    try {
      const res = await fetch("/api/reaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, logEntryId: entryId, reaction: emoji }),
      });
      if (!res.ok) {
        setReactions(prev); // revert
      }
    } catch {
      setReactions(prev); // revert
    } finally {
      setSending(false);
    }
  }, [reactions, token, entryId]);

  return (
    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
      {/* Existing reactions */}
      {reactions.map((emoji, i) => (
        <button
          key={`${emoji}-${i}`}
          onClick={() => handleToggle(emoji)}
          disabled={sending}
          className="inline-flex items-center px-1.5 py-0.5 bg-indigo-50 border border-indigo-200 rounded-full text-sm hover:bg-indigo-100 transition-colors disabled:opacity-50"
          title="クリックで解除"
        >
          {emoji}
        </button>
      ))}

      {/* Add reaction button */}
      <div className="relative">
        <button
          onClick={() => setPickerOpen(!pickerOpen)}
          className="inline-flex items-center gap-0.5 px-2 py-0.5 text-[10px] text-[#8B8489] bg-[#F5F0EB] rounded-full hover:bg-[#EFE8DD] transition-colors"
        >
          <span className="text-xs leading-none">+</span>
          <span>スタンプ</span>
        </button>

        {pickerOpen && (
          <div className="absolute bottom-full left-0 mb-1 bg-white rounded-xl shadow-lg border border-[#EFE8DD] p-1.5 flex gap-0.5 z-20 whitespace-nowrap">
            {STAMPS.map((s) => {
              const active = reactions.includes(s.emoji);
              return (
                <button
                  key={s.emoji}
                  onClick={() => handleToggle(s.emoji)}
                  disabled={sending}
                  className={`flex flex-col items-center p-1 rounded-lg transition-colors ${
                    active ? "bg-indigo-50 ring-1 ring-indigo-300" : "hover:bg-gray-50"
                  }`}
                  title={s.label}
                >
                  <span className="text-lg leading-none">{s.emoji}</span>
                  <span className="text-[9px] text-[#8B8489] mt-0.5">{s.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
