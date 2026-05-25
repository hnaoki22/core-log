"use client";

// Error boundary for /p/[token]/* routes.
//
// Without this, an unhandled error in the input (or any participant) page
// Server Component or during client hydration produces a fully blank white
// screen — the user has no way to recover and no indication of what happened.
// This boundary catches that and shows a retry affordance.

import { useEffect } from "react";

export default function ParticipantError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to the browser console + Vercel client logs for diagnosis.
    console.error("Participant route error:", error, "digest:", error?.digest);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#F5F0EB] flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#EFE8DD] flex items-center justify-center mx-auto mb-4">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#8B8489" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <h2 className="text-base font-semibold text-[#1A1A2E] mb-2">読み込みに失敗しました</h2>
        <p className="text-sm text-[#5B5560] leading-relaxed mb-6">
          一時的な問題で画面を表示できませんでした。<br />
          下のボタンでもう一度お試しください。
        </p>
        <button
          onClick={() => reset()}
          className="btn-primary w-full py-3 text-sm"
        >
          再読み込み
        </button>
      </div>
    </div>
  );
}
