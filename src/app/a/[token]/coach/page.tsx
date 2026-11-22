"use client";

// 管理画面「AIコーチの確認」（feature.coachReply）。
//
// 日付ごとに、その環境の参加者の記入と、AIコーチの返信を並べる。読めるのは管理者と閲覧者
// （記入を読める人と同じ範囲）。返信を届ける・取り下げるのは、管理者だけ。
// 読み取りと操作は /api/admin/coach-replies（だれが読めるか、どの環境か、商品モード・観の期の除外は、
// API が決める。この画面は、返ってきたものを出すだけ）。
//
// 環境（?tenant=）と日付（?date=）は URL から読む。管理者は、管理画面で環境を 1 つ選んでから開く。

import { useParams } from "next/navigation";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CoachBoardView, type CoachBoardRowView } from "@/components/admin/CoachBoard";
import {
  COACH_BOARD_TERMS as T,
  formatReplyDate,
  nextDate,
  previousDate,
  type CoachBoardAction,
  type CoachConfig,
} from "@/lib/coach-reply";

type BoardData = {
  enabled: boolean;
  /** 環境の設定（届け方と開始日）があるか。無い環境では、返信は作られない。 */
  configured: boolean;
  role: "admin" | "viewer";
  canAct: boolean;
  tenant: { name: string; slug: string };
  date: string;
  today: string;
  killSwitch: boolean;
  config: CoachConfig | null;
  rows: CoachBoardRowView[];
};

type LoadState =
  | { phase: "loading" }
  | { phase: "ready"; data: BoardData }
  | { phase: "error"; message: string };

export default function CoachBoardPage() {
  const params = useParams();
  const token = params.token as string;

  // URL の ?tenant= と ?date=。最初の描画では読まない（サーバーの描画と食い違わないように、マウント後に読む）。
  const [query, setQuery] = useState<{ tenant: string; date: string } | null>(null);
  const [state, setState] = useState<LoadState>({ phase: "loading" });
  const [busyReplyId, setBusyReplyId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const url = new URL(window.location.href);
    setQuery({ tenant: url.searchParams.get("tenant") ?? "", date: url.searchParams.get("date") ?? "" });
  }, []);

  const load = useCallback(
    async (q: { tenant: string; date: string }) => {
      let url = `/api/admin/coach-replies?token=${encodeURIComponent(token)}`;
      if (q.tenant) url += `&tenant=${encodeURIComponent(q.tenant)}`;
      if (q.date) url += `&date=${encodeURIComponent(q.date)}`;
      try {
        const res = await fetch(url);
        const json = (await res.json().catch(() => null)) as (Partial<BoardData> & {
          error?: string;
          needTenant?: boolean;
          standaloneBlocked?: boolean;
        }) | null;
        if (res.ok && json && Array.isArray(json.rows)) {
          setState({ phase: "ready", data: json as BoardData });
          return;
        }
        if (json?.needTenant) {
          setState({ phase: "error", message: T.needTenantNote });
        } else if (json?.standaloneBlocked && json.error) {
          setState({ phase: "error", message: json.error });
        } else if (res.status === 403) {
          setState({ phase: "error", message: "このページを開く権限がありません。" });
        } else {
          setState({ phase: "error", message: T.loadFailed });
        }
      } catch {
        setState({ phase: "error", message: T.loadFailed });
      }
    },
    [token]
  );

  useEffect(() => {
    if (query) load(query);
  }, [query, load]);

  const moveTo = (date: string) => {
    if (!query || date === "") return;
    const next = { tenant: query.tenant, date };
    const url = new URL(window.location.href);
    url.searchParams.set("date", date);
    window.history.replaceState(null, "", url.toString());
    setNotice("");
    // 読み込みが終わるまでは、前の日付の一覧を出したままにする（日付の欄が消えて、押す場所が動かないように）。
    setQuery(next);
  };

  const act = async (replyId: string, action: CoachBoardAction) => {
    if (!query || busyReplyId !== null) return;
    setBusyReplyId(replyId);
    setNotice("");
    try {
      const res = await fetch("/api/admin/coach-replies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, replyId, action }),
      });
      if (!res.ok) setNotice(res.status === 409 ? T.conflict : T.actionFailed);
    } catch {
      setNotice(T.actionFailed);
    }
    // うまくいったときも、いかなかったときも、いまの状態を読み直す。
    await load(query);
    setBusyReplyId(null);
  };

  const data = state.phase === "ready" ? state.data : null;

  return (
    <div className="min-h-screen bg-[#F5F0EB] pb-16">
      <div className="gradient-header-admin text-white px-6 pt-12 pb-6">
        <div className="max-w-3xl mx-auto relative z-10">
          <Link href={`/a/${token}`} className="text-gray-300 hover:text-white text-sm mb-3 inline-block">
            ← 管理画面に戻る
          </Link>
          <h1 className="text-lg font-semibold tracking-tight">{T.title}</h1>
          <p className="text-gray-300 text-sm mt-1 font-light">{T.lead}</p>
          {data && data.tenant.name && (
            <p className="text-gray-300 text-xs mt-2 break-words">表示中の環境：{data.tenant.name}</p>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-5 pt-5 space-y-4">
        {state.phase === "loading" && <p className="text-sm text-[#5B5560]">読み込み中…</p>}

        {state.phase === "error" && (
          <div className="card p-4">
            <p className="text-sm text-[#1A1A2E] leading-relaxed">{state.message}</p>
          </div>
        )}

        {data && (
          <>
            <div className="card p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => moveTo(previousDate(data.date))}
                  className="rounded-lg bg-[#EFE8DD] px-3 py-1.5 text-xs font-medium text-[#5B5560] whitespace-nowrap"
                >
                  ← 前の日
                </button>
                <span className="text-sm font-semibold text-[#1A1A2E] whitespace-nowrap">
                  {formatReplyDate(data.date)} の記入
                  {data.date === data.today ? "（今日）" : ""}
                </span>
                <button
                  type="button"
                  onClick={() => moveTo(nextDate(data.date))}
                  disabled={data.date >= data.today}
                  className="rounded-lg bg-[#EFE8DD] px-3 py-1.5 text-xs font-medium text-[#5B5560] whitespace-nowrap disabled:opacity-40"
                >
                  次の日 →
                </button>
                {data.date !== data.today && (
                  <button
                    type="button"
                    onClick={() => moveTo(data.today)}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-[#1A1A2E] underline underline-offset-2 whitespace-nowrap"
                  >
                    今日へ
                  </button>
                )}
              </div>
              {data.enabled && data.configured && data.config && (
                <p className="text-[11px] text-[#5B5560] leading-relaxed">
                  {data.config.deliveryMode === "auto" ? T.modeAuto : T.modeReview}
                  {data.config.startDate
                    ? `　${T.startDatePrefix}${formatReplyDate(data.config.startDate)}${T.startDateSuffix}`
                    : ""}
                </p>
              )}
              {data.killSwitch && <p className="text-[11px] text-red-700 leading-relaxed">{T.killSwitchNote}</p>}
            </div>

            {notice && (
              <p role="status" className="text-sm text-red-700 leading-relaxed">
                {notice}
              </p>
            )}

            {!data.enabled || !data.configured ? (
              <div className="card p-4">
                <p className="text-sm text-[#1A1A2E] leading-relaxed">
                  {!data.enabled ? T.disabledNote : T.notConfiguredNote}
                </p>
              </div>
            ) : (
              <CoachBoardView rows={data.rows} canAct={data.canAct} busyReplyId={busyReplyId} onAction={act} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
