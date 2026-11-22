"use client";

// 「AIコーチの返信」を、本人の画面に出す部品（feature.coachReply）。
//
// - CoachReplyCard   : 1 件の返信（表示だけ）。届いた返信は文を、確認待ちは案内だけを出す。
// - CoachReplyPanel  : 記入の完了の画面に置く。その日の記入への返信を出す。まだ無ければ、作ってもらう。
// - CoachReplyList   : 「FB」のタブに置く。これまでの返信の一覧。開いたときに、
//                      まだ返信の無い記入（今日か前日）があれば、作ってもらう。
//
// 出す・出さないは、置く側がスイッチで決める。そのうえで、サーバーの応答で決まる：
// - API が enabled:false を返したとき（スイッチ OFF・止める設定・商品モード・環境の設定が無い）は、何も出さない。
// - 「AIコーチが読んでいます」と出すのは、サーバーが「返してよい人で、返信がまだ無い」と答えたときだけ
//   （先に、作らずに確かめる呼び出しをする）。受け取らない設定の人や、設計図が確認前の人の画面に、
//   AI が記入を読んでいるかのような表示を出さない。
// 文言は coach-reply.ts の COACH_TERMS。

import { useCallback, useEffect, useState } from "react";
import { COACH_TERMS, formatReplyDate, type CoachReplyView } from "@/lib/coach-reply";

type Shown = Exclude<CoachReplyView, { state: "none" }>;

function CoachBadge() {
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-[#EFF5F1] text-[#2D6A4F]">
      {COACH_TERMS.name}
    </span>
  );
}

/** 1 件の返信。届いた返信は文を出す。確認待ちは、案内だけを出す（文は、サーバーからも届かない）。 */
export function CoachReplyCard({ view }: { view: Shown }) {
  return (
    <div className="bg-white border border-[#EFE8DD] p-4 rounded-2xl text-left">
      <div className="flex items-center justify-between gap-2 mb-2">
        <CoachBadge />
        <p className="text-[11px] text-[#8B8489]">
          {formatReplyDate(view.replyDate)}
          {COACH_TERMS.replyDateSuffix}
        </p>
      </div>
      {view.state === "delivered" ? (
        <p className="text-sm text-[#2C2C4A] leading-relaxed whitespace-pre-wrap break-words">{view.content}</p>
      ) : (
        <p className="text-xs text-[#5B5560] leading-relaxed">{COACH_TERMS.pending}</p>
      )}
    </div>
  );
}

/** 作ってもらっているあいだの表示。 */
export function CoachReplyReading() {
  return (
    <div className="bg-white border border-dashed border-[#E5DCD0] p-4 rounded-2xl text-left">
      <div className="mb-2">
        <CoachBadge />
      </div>
      <p className="text-xs text-[#5B5560] leading-relaxed animate-pulse">{COACH_TERMS.reading}</p>
    </div>
  );
}

/** 作れなかったときの表示。 */
export function CoachReplyFailed({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="bg-white border border-dashed border-[#E5DCD0] p-4 rounded-2xl text-left">
      <div className="mb-2">
        <CoachBadge />
      </div>
      <p className="text-xs text-[#5B5560] leading-relaxed">{COACH_TERMS.failed}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 text-xs font-medium text-[#1A1A2E] underline underline-offset-2"
        >
          {COACH_TERMS.retry}
        </button>
      )}
    </div>
  );
}

/** 一覧が空のときの案内を出し分けるための、本人の状態。 */
export type CoachEmptyReason = "no_profile" | "opted_out" | null;

type EnsureResult =
  | {
      ok: true;
      enabled: boolean;
      view: CoachReplyView;
      /** 確かめるだけの呼び出しで、このあと作ることになるか。 */
      willGenerate: boolean;
      reason: CoachEmptyReason;
    }
  | { ok: false };

/**
 * check: true = 確かめるだけ（サーバーは作らない。AI を呼ばない）。
 * check: false = 返信がまだ無ければ、作ってもらう。
 */
async function requestCoachReply(token: string, check: boolean): Promise<EnsureResult> {
  try {
    const res = await fetch("/api/coach-reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(check ? { token, check: true } : { token }),
    });
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as {
      enabled?: boolean;
      view?: CoachReplyView;
      willGenerate?: boolean;
      reason?: string | null;
    };
    if (!data.view) return { ok: false };
    return {
      ok: true,
      enabled: data.enabled === true,
      view: data.view,
      willGenerate: data.willGenerate === true,
      reason: data.reason === "no_profile" || data.reason === "opted_out" ? data.reason : null,
    };
  } catch {
    return { ok: false };
  }
}

type PanelState =
  /** 返してよい人かを、確かめているあいだ。何も出さない。 */
  | { phase: "checking" }
  /** 返してよい人で、返信を作ってもらっているあいだ。 */
  | { phase: "generating" }
  | { phase: "shown"; view: Shown }
  | { phase: "failed" }
  | { phase: "hidden" };

/**
 * 完了の画面に置く。その日の記入への返信を出す。まだ無ければ、作ってもらう。
 *
 * まず確かめるだけの呼び出しをし、返してよい人（設計図を確定していて、受け取らない設定にしていない人）で、
 * 返信がまだ無いときにだけ「AIコーチが読んでいます」と出して、作ってもらう。受け取らない設定の人や、
 * 設計図が確認前の人の画面には、確かめているあいだも、何も出さない。
 */
export function CoachReplyPanel({
  token,
  className,
}: {
  token: string;
  /** 出すものがあるときにだけ付ける、外側の余白など（何も出さないときに、空の余白を残さない）。 */
  className?: string;
}) {
  const [state, setState] = useState<PanelState>({ phase: "checking" });

  const generate = useCallback(
    async (isCancelled: () => boolean) => {
      setState({ phase: "generating" });
      const made = await requestCoachReply(token, false);
      if (isCancelled()) return;
      if (!made.ok) setState({ phase: "failed" });
      else if (made.enabled && made.view.state !== "none") setState({ phase: "shown", view: made.view });
      else setState({ phase: "hidden" });
    },
    [token]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const checked = await requestCoachReply(token, true);
      if (cancelled) return;
      // 確かめられなかったときは、何も出さない（返してよい人かどうかが分からないまま、表示を出さない）。
      if (!checked.ok || !checked.enabled) {
        setState({ phase: "hidden" });
        return;
      }
      if (checked.view.state !== "none") {
        setState({ phase: "shown", view: checked.view });
        return;
      }
      if (!checked.willGenerate) {
        setState({ phase: "hidden" });
        return;
      }
      await generate(() => cancelled);
    })();
    return () => {
      cancelled = true;
    };
  }, [token, generate]);

  let content: JSX.Element | null = null;
  if (state.phase === "generating") content = <CoachReplyReading />;
  else if (state.phase === "failed") content = <CoachReplyFailed onRetry={() => generate(() => false)} />;
  else if (state.phase === "shown") content = <CoachReplyCard view={state.view} />;
  if (content === null) return null;
  return className ? <div className={className}>{content}</div> : content;
}

type ListState =
  | { phase: "loading" }
  | { phase: "done"; enabled: boolean; items: Shown[] }
  | { phase: "failed" };

async function fetchCoachReplies(token: string): Promise<ListState> {
  try {
    const res = await fetch(`/api/coach-reply?token=${encodeURIComponent(token)}`);
    if (!res.ok) return { phase: "failed" };
    const data = (await res.json()) as { enabled?: boolean; items?: CoachReplyView[] };
    const items = (data.items ?? []).filter((v): v is Shown => v.state !== "none");
    return { phase: "done", enabled: data.enabled === true, items };
  } catch {
    return { phase: "failed" };
  }
}

/** 一覧が空のときの案内。本人の状態に合わせる（届かない人に「届きます」と出さない）。 */
function emptyText(reason: CoachEmptyReason): string {
  if (reason === "no_profile") return COACH_TERMS.listEmptyNoProfile;
  if (reason === "opted_out") return COACH_TERMS.listEmptyOptedOut;
  return COACH_TERMS.listEmpty;
}

/** 一覧の見出しと中身（表示だけ）。 */
export function CoachReplyListView({
  items,
  reading,
  emptyReason = null,
}: {
  items: Shown[];
  /** 返信を作ってもらっているあいだ。 */
  reading: boolean;
  emptyReason?: CoachEmptyReason;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold text-[#5B5560] tracking-wide">{COACH_TERMS.listHeading}</h2>
      {reading && <CoachReplyReading />}
      {items.length === 0 && !reading ? (
        <p className="text-xs text-[#8B8489] leading-relaxed">{emptyText(emptyReason)}</p>
      ) : (
        items.map((view) => <CoachReplyCard key={`${view.replyDate}-${view.state}`} view={view} />)
      )}
    </section>
  );
}

/**
 * 「FB」のタブに置く。これまでの返信の一覧を出す。
 * 開いたときに、まだ返信の無い記入（今日か前日）があれば作ってもらい、できたら一覧を読み直す。
 * 作ってもらうのは、返してよい人だけ（完了の画面の部品と同じく、先に確かめる）。
 */
export function CoachReplyList({
  token,
  className,
}: {
  token: string;
  /** 出すものがあるときにだけ付ける、外側の余白など（何も出さないときに、空の余白を残さない）。 */
  className?: string;
}) {
  const [list, setList] = useState<ListState>({ phase: "loading" });
  const [reading, setReading] = useState(false);
  const [emptyReason, setEmptyReason] = useState<CoachEmptyReason>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const first = await fetchCoachReplies(token);
      if (cancelled) return;
      setList(first);
      if (first.phase !== "done" || !first.enabled) return;

      const checked = await requestCoachReply(token, true);
      if (cancelled || !checked.ok) return;
      setEmptyReason(checked.reason);
      if (!checked.willGenerate) return;

      setReading(true);
      const made = await requestCoachReply(token, false);
      if (cancelled) return;
      if (made.ok && made.view.state !== "none") {
        const again = await fetchCoachReplies(token);
        if (cancelled) return;
        if (again.phase === "done") setList(again);
      }
      setReading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (list.phase !== "done" || !list.enabled) return null;
  const view = <CoachReplyListView items={list.items} reading={reading} emptyReason={emptyReason} />;
  return className ? <div className={className}>{view}</div> : view;
}
