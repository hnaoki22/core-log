"use client";

// 管理画面「AIコーチの確認」の一覧（feature.coachReply。表示と、ボタンを押したことの通知だけ）。
//
// - 1 人・1 日を 1 枚のカードにし、その日の記入（朝・夕方）、AIコーチの返信、状態を出す。
// - 並びと状態は、API（/api/admin/coach-replies）が決めた順のまま出す。
// - 届ける・取り下げるのボタンは、管理者（canAct）にだけ出す。押したことは onAction で親に知らせる
//   （通信はしない）。取り下げは、押したあとに確認の文を出し、もう一度押して確定する。
// - 文言は coach-reply.ts の COACH_BOARD_TERMS。

import { useState } from "react";
import {
  COACH_BOARD_TERMS as T,
  COACH_INPUT_LABELS,
  formatJstDateTime,
  type CoachBoardAction,
  type CoachBoardState,
  type CoachReplyStatus,
} from "@/lib/coach-reply";

export type CoachBoardRowView = {
  participantId: string;
  name: string;
  department: string;
  profileStatus: "none" | "draft" | "confirmed";
  coachEnabled: boolean;
  morning: string;
  evening: string;
  state: CoachBoardState;
  reply: {
    id: string;
    status: CoachReplyStatus;
    content: string;
    createdAt: string | null;
    model: string | null;
    inputsUsed: string[];
    reviewedAt: string | null;
  } | null;
};

const STATE_TONE: Record<CoachBoardState, string> = {
  needs_attention: "bg-red-50 text-red-700 border-red-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  not_generated: "bg-[#F2F2F7] text-[#5B5560] border-[#E5DCD0]",
  delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
  withdrawn: "bg-[#F2F2F7] text-[#8B8489] border-[#E5DCD0]",
  opted_out: "bg-[#F2F2F7] text-[#8B8489] border-[#E5DCD0]",
  no_profile: "bg-[#F2F2F7] text-[#8B8489] border-[#E5DCD0]",
  no_evening: "bg-[#F2F2F7] text-[#8B8489] border-[#E5DCD0]",
};

/** 上に出す件数の並び（先に見てほしいものが左）。 */
const SUMMARY_STATES: readonly CoachBoardState[] = [
  "needs_attention",
  "pending",
  "delivered",
  "not_generated",
  "no_evening",
];

function EntryText({ label, text }: { label: string; text: string }) {
  const empty = text.trim() === "";
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium text-[#8B8489] mb-0.5">{label}</p>
      <p
        className={`text-xs leading-relaxed whitespace-pre-wrap break-words ${
          empty ? "text-[#C9BDAE]" : "text-[#2C2C4A]"
        }`}
      >
        {empty ? T.noEntry : text}
      </p>
    </div>
  );
}

function RowActions({
  row,
  busy,
  onAction,
}: {
  row: CoachBoardRowView;
  busy: boolean;
  onAction: (replyId: string, action: CoachBoardAction) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const reply = row.reply;
  if (!reply || row.state === "withdrawn") return null;
  if (row.state !== "needs_attention" && row.state !== "pending" && row.state !== "delivered") return null;

  const buttonBase = "rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap disabled:opacity-50";

  // 返信を作らなかった記入：確認したことを残す（本人の画面の「確認待ち」の表示が消える）。
  if (row.state === "needs_attention") {
    return (
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onAction(reply.id, "withdraw")}
          className={`${buttonBase} bg-[#1A1A2E] text-white`}
        >
          {T.acknowledge}
        </button>
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="space-y-2">
        <p className="text-[11px] text-[#5B5560] leading-relaxed">{T.withdrawConfirm}</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setConfirming(false);
              onAction(reply.id, "withdraw");
            }}
            className={`${buttonBase} bg-red-700 text-white`}
          >
            {T.withdraw}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirming(false)}
            className={`${buttonBase} bg-[#EFE8DD] text-[#5B5560]`}
          >
            やめる
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {row.state === "pending" && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onAction(reply.id, "deliver")}
          className={`${buttonBase} bg-[#1A1A2E] text-white`}
        >
          {T.deliver}
        </button>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => setConfirming(true)}
        className={`${buttonBase} bg-[#EFE8DD] text-[#5B5560]`}
      >
        {T.withdraw}
      </button>
    </div>
  );
}

function BoardRow({
  row,
  canAct,
  busy,
  onAction,
}: {
  row: CoachBoardRowView;
  canAct: boolean;
  busy: boolean;
  onAction?: (replyId: string, action: CoachBoardAction) => void;
}) {
  const reply = row.reply;
  const hasReplyText = reply !== null && reply.content.trim() !== "";
  const createdAt = reply ? formatJstDateTime(reply.createdAt) : "";
  const reviewedAt = reply ? formatJstDateTime(reply.reviewedAt) : "";
  const inputs = reply ? reply.inputsUsed.map((key) => COACH_INPUT_LABELS[key] ?? key) : [];

  return (
    <div className="card p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#1A1A2E] break-words">{row.name}</p>
          {row.department && <p className="text-[11px] text-[#8B8489] break-words">{row.department}</p>}
        </div>
        <span
          className={`self-start inline-block rounded-md border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${STATE_TONE[row.state]}`}
        >
          {T.stateLabels[row.state]}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <EntryText label={T.morningLabel} text={row.morning} />
        <EntryText label={T.eveningLabel} text={row.evening} />
      </div>

      {hasReplyText && reply && (
        <div className="rounded-xl bg-[#EFF5F1] p-3 min-w-0">
          <p className="text-[11px] font-medium text-[#2D6A4F] mb-1">{T.replyLabel}</p>
          <p className="text-sm text-[#2C2C4A] leading-relaxed whitespace-pre-wrap break-words">{reply.content}</p>
        </div>
      )}

      {row.state === "needs_attention" && (
        <p className="text-[11px] text-red-700 leading-relaxed">{T.needsAttentionHelp}</p>
      )}
      {row.state === "not_generated" && (
        <p className="text-[11px] text-[#8B8489] leading-relaxed">{T.notGeneratedHelp}</p>
      )}

      {reply && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[#8B8489]">
          {createdAt && <span className="whitespace-nowrap">作成 {createdAt}</span>}
          {reviewedAt && <span className="whitespace-nowrap">運営の操作 {reviewedAt}</span>}
          {reply.model && <span className="break-all">{reply.model}</span>}
          {inputs.length > 0 && <span className="break-words">AIに送ったもの：{inputs.join("、")}</span>}
        </div>
      )}

      {canAct && onAction && <RowActions row={row} busy={busy} onAction={onAction} />}
    </div>
  );
}

export function CoachBoardView({
  rows,
  canAct,
  busyReplyId = null,
  onAction,
}: {
  rows: CoachBoardRowView[];
  canAct: boolean;
  busyReplyId?: string | null;
  onAction?: (replyId: string, action: CoachBoardAction) => void;
}) {
  const counts = new Map<CoachBoardState, number>();
  for (const row of rows) counts.set(row.state, (counts.get(row.state) ?? 0) + 1);
  const summary = SUMMARY_STATES.filter((state) => (counts.get(state) ?? 0) > 0);

  return (
    <div className="space-y-3">
      {summary.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {summary.map((state) => (
            <span
              key={state}
              className={`inline-block rounded-md border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${STATE_TONE[state]}`}
            >
              {T.stateLabels[state]} {counts.get(state)}
            </span>
          ))}
        </div>
      )}
      {!canAct && <p className="text-[11px] text-[#8B8489]">{T.viewerNote}</p>}
      {rows.map((row) => (
        <BoardRow
          key={row.participantId}
          row={row}
          canAct={canAct}
          // 1 つの操作が終わるまで、ほかの行のボタンも止める（続けて押して、順番が入れ替わらないように）。
          busy={busyReplyId !== null}
          onAction={onAction}
        />
      ))}
    </div>
  );
}
