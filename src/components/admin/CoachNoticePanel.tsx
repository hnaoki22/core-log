"use client";

// 管理画面「AIコーチの確認」の、お知らせメールの欄（管理者にだけ出す。表示と、ボタンを押したことの通知だけ）。
//
// お知らせメール = AIコーチの返信が、運営の確認を待つ状態（確認待ち・確認が必要）になったときに、
// 運営の担当者へ送るメール（src/lib/coach-notice.ts）。宛先は、環境ごとの設定に置く。
//
// - 宛先の設定の状態を 1 行で出す。設定が無い・形が正しくない・送れる人がいないときは、
//   「メールは送られません」と分かる文を、赤で出す（設定が無いことに、気づかないままにしない）。
// - 出すのは、状態と人数だけ。宛先の氏名・メールアドレスは出さない（API も返さない）。
// - 「試しに送る」は、宛先があるときだけ出す。押したことは onTest で親に知らせる（通信はしない）。
// - 文言は coach-reply.ts の COACH_BOARD_TERMS。

import { COACH_BOARD_TERMS as T, type CoachNoticeState } from "@/lib/coach-reply";

export type CoachNoticeStatusView = {
  state: CoachNoticeState;
  /** 送れる宛先の人数（state が ready のとき）。 */
  recipients?: number;
  /** 設定されているが、送れない人の数（state が ready のとき）。 */
  skipped?: number;
};

export type CoachNoticeMessage = { tone: "ok" | "error"; text: string };

type Props = {
  status: CoachNoticeStatusView;
  /** 試し送りの通信中。 */
  busy: boolean;
  /** 試し送りの結果。 */
  message: CoachNoticeMessage | null;
  onTest: () => void;
};

const STATE_TONE: Record<CoachNoticeState, string> = {
  ready: "text-[#5B5560]",
  not_configured: "text-red-700",
  invalid_config: "text-red-700",
  no_recipient: "text-red-700",
  unknown: "text-amber-700",
};

export function CoachNoticePanel({ status, busy, message, onTest }: Props) {
  const ready = status.state === "ready";
  const skipped = ready ? status.skipped ?? 0 : 0;
  return (
    <div data-testid="coach-notice-panel" data-state={status.state} className="border-t border-[#EFE8DD] pt-3 space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-[11px] font-semibold text-[#1A1A2E] whitespace-nowrap">{T.noticeHeading}</span>
        {ready && typeof status.recipients === "number" && (
          <span className="text-[11px] text-[#5B5560] whitespace-nowrap">{T.noticeRecipients(status.recipients)}</span>
        )}
        {ready && (
          <button
            type="button"
            onClick={onTest}
            disabled={busy}
            className="rounded-lg bg-[#EFE8DD] px-3 py-1 text-[11px] font-medium text-[#5B5560] whitespace-nowrap disabled:opacity-40"
          >
            {busy ? T.noticeTestSending : T.noticeTest}
          </button>
        )}
      </div>
      <p className={`text-[11px] leading-relaxed ${STATE_TONE[status.state]}`}>{T.noticeStates[status.state]}</p>
      {skipped > 0 && <p className="text-[11px] leading-relaxed text-amber-700">{T.noticeSkipped(skipped)}</p>}
      {message && (
        <p
          role="status"
          className={`text-[11px] leading-relaxed ${message.tone === "ok" ? "text-emerald-700" : "text-red-700"}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
