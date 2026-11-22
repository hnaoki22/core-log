"use client";

// 設計図のページに置く、AIコーチの説明と「受け取る・受け取らない」（feature.coachReply）。
//
// - CoachOptInView : 表示だけ（説明文、いまの設定、選ぶボタン）。
// - CoachOptInCard : 押したら、すぐに保存する（PATCH /api/coach-reply）。設計図の「確定」「保存」とは別。
//
// 「受け取らない」にした人の記入は、AIコーチのために AI に送らない（サーバーの decideCoachEligibility）。
// 設計図の行がまだ無い人は、切り替える先の行が無いので、ボタンを出さずにその旨を出す
// （設計図を確定するまで、AIコーチはその人の記入を読まない）。
// 文言は coach-reply.ts の COACH_TERMS。

import { useState } from "react";
import { COACH_TERMS } from "@/lib/coach-reply";

export type CoachOptInMessage = { kind: "ok" | "error"; text: string } | null;

export function CoachOptInView({
  hasProfile,
  loadFailed = false,
  optIn,
  saving = false,
  message = null,
  onChoose,
}: {
  /** 設計図の行があるか（確認前でもよい）。無いときは、ボタンを出さない。 */
  hasProfile: boolean;
  /** いまの設定を読めなかった。ボタンを出さない（違う設定を出して、押し間違えないように）。 */
  loadFailed?: boolean;
  optIn: boolean;
  saving?: boolean;
  message?: CoachOptInMessage;
  onChoose?: (next: boolean) => void;
}) {
  return (
    <div className="bg-white border border-[#EFE8DD] p-4 rounded-2xl space-y-3">
      <div>
        <p className="text-xs font-medium text-[#1A1A2E] mb-1.5">{COACH_TERMS.aboutHeading}</p>
        <ul className="space-y-1.5">
          {COACH_TERMS.aboutLines.map((line) => (
            <li key={line} className="text-[11px] text-[#5B5560] leading-relaxed">
              {line}
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-[#EFE8DD] pt-3">
        <p className="text-xs font-medium text-[#1A1A2E] mb-1">{COACH_TERMS.optInLabel}</p>
        {loadFailed ? (
          <p className="text-[11px] text-red-700 leading-relaxed">{COACH_TERMS.optInLoadFailed}</p>
        ) : !hasProfile ? (
          <p className="text-[11px] text-[#5B5560] leading-relaxed">{COACH_TERMS.optInNeedsProfile}</p>
        ) : (
          <>
            <p className="text-[11px] text-[#8B8489] mb-2 leading-relaxed">{COACH_TERMS.optInHelp}</p>
            <div className="flex flex-wrap gap-2">
              {([true, false] as const).map((choice) => {
                const selected = optIn === choice;
                return (
                  <button
                    key={String(choice)}
                    type="button"
                    aria-pressed={selected}
                    disabled={saving}
                    onClick={() => onChoose?.(choice)}
                    className={`rounded-full border px-3 py-1 text-xs whitespace-nowrap disabled:opacity-50 ${
                      selected
                        ? "border-[#1A1A2E] bg-[#1A1A2E] text-white"
                        : "border-[#E5DCD0] bg-white text-[#5B5560]"
                    }`}
                  >
                    {choice ? COACH_TERMS.optInOn : COACH_TERMS.optInOff}
                  </button>
                );
              })}
            </div>
            {message && (
              <p
                role="status"
                className={`mt-2 text-[11px] leading-relaxed ${
                  message.kind === "ok" ? "text-[#1A1A2E]" : "text-red-700"
                }`}
              >
                {message.text}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function CoachOptInCard({
  token,
  hasProfile,
  initialOptIn,
  loadFailed = false,
}: {
  token: string;
  hasProfile: boolean;
  /** いまの設定。設計図の行がまだ無いときは null（行ができたときの初期値は「受け取る」）。 */
  initialOptIn: boolean | null;
  loadFailed?: boolean;
}) {
  const [optIn, setOptIn] = useState<boolean>(initialOptIn ?? true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<CoachOptInMessage>(null);

  const choose = async (next: boolean) => {
    if (saving || next === optIn) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/coach-reply", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, enabled: next }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; optIn?: boolean } | null;
      if (!res.ok || !data?.ok || typeof data.optIn !== "boolean") {
        setMessage({ kind: "error", text: COACH_TERMS.optInFailed });
        return;
      }
      // 画面には、サーバーが保存した値を出す。
      setOptIn(data.optIn);
      setMessage({ kind: "ok", text: COACH_TERMS.optInSaved });
    } catch {
      setMessage({ kind: "error", text: COACH_TERMS.optInFailed });
    } finally {
      setSaving(false);
    }
  };

  return (
    <CoachOptInView
      hasProfile={hasProfile}
      loadFailed={loadFailed}
      optIn={optIn}
      saving={saving}
      message={message}
      onChoose={choose}
    />
  );
}
