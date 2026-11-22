// /api/coach-reply — 本人の「AIコーチの返信」（feature.coachReply）
//
// GET   ?token=            本人の返信の一覧（届いたものの文と、確認待ちの日付）と、受け取りの入・切
// POST  { token }          今日（無ければ前日）の記入への返信を、まだ無ければ作って返す
// POST  { token, check: true }  確かめるだけ（作らない）。すでにある返信と、このあと作ることになるかを返す
// PATCH { token, enabled } 本人が、受け取る・受け取らないを切り替える
//
// - 本人の行は、トークンから引いた参加者 ID とテナント ID だけで選ぶ（本文の ID・氏名では選ばない）。
// - 返すのは、届いた返信の文だけ。確認待ち・取り下げ済みの文は、本人に返さない（toParticipantView）。
// - 作る流れは src/lib/coach-reply-service.ts（テスト付き）。ここは、実際の読み書きをつなぐだけ。
// - 動くのは、feature.coachReply と feature.coachingProfile の両方が ON で、環境の設定
//   （届け方と開始日。ai_settings の coach_reply_config）がある環境だけ。

import { NextRequest, NextResponse } from "next/server";
import { getParticipantByToken } from "@/lib/participant-db";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { isStandaloneTenant } from "@/lib/standalone";
import { getMissionsByParticipantId } from "@/lib/supabase";
import { selectActiveMissions, parseIssuePurpose } from "@/lib/mission-context";
import { getCoachingProfile } from "@/lib/coaching-profile-store";
import { getTodayJST } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { toParticipantView, type CoachReplyView } from "@/lib/coach-reply";
import { lastParagraph } from "@/lib/coach-reply-prompt";
import { ensureCoachReply, type CoachDeps } from "@/lib/coach-reply-service";
import { callCoachModel, isCoachKillSwitchOn } from "@/lib/coach-reply-llm";
import {
  getCoachActivation,
  getCoachConfig,
  getCoachOptIn,
  getCoachReply,
  getCoachSystemPrompt,
  getDayLogsForCoach,
  getPreviousDeliveredReply,
  insertCoachReply,
  listCoachRepliesForParticipant,
  setCoachOptIn,
} from "@/lib/coach-reply-store";

export const dynamic = "force-dynamic";
// AI の応答を待つ（coach-reply-llm.ts の上限は 50 秒）。
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };

// 1 人が「作って」と頼める回数（10 分に 6 回まで）。返信が保存されたあとは AI を呼ばないので、
// これが効くのは、AI の応答が使えなかった・保存できなかったときの、くり返しの呼び出し。
// 数え方はサーバーの 1 台ごと（middleware の制限と同じ仕組み）なので、目安として置いている。
const COACH_POST_LIMIT = 6;
const COACH_POST_WINDOW_MS = 10 * 60_000;

async function resolveParticipant(token: unknown) {
  if (typeof token !== "string" || token === "") return null;
  const participant = await getParticipantByToken(token);
  if (!participant || !participant.id || !participant.tenantId) return null;
  return { id: participant.id, tenantId: participant.tenantId };
}

/** 設計図と AIコーチの返信の、両方のスイッチが ON か。 */
async function coachFlagsOn(tenantId: string): Promise<boolean> {
  const [reply, profile] = await Promise.all([
    isFeatureEnabled("feature.coachReply", tenantId),
    isFeatureEnabled("feature.coachingProfile", tenantId),
  ]);
  return reply && profile;
}

const deps: CoachDeps = {
  killSwitch: () => isCoachKillSwitchOn(),
  flagsOn: coachFlagsOn,
  isStandalone: isStandaloneTenant,
  getProfile: getCoachingProfile,
  getOptIn: getCoachOptIn,
  getDayLogs: getDayLogsForCoach,
  getReply: (participantId, tenantId, replyDate) => getCoachReply(participantId, tenantId, replyDate, "daily"),
  getConfig: getCoachConfig,
  getSystemPrompt: getCoachSystemPrompt,
  getIssue: async (participantId, tenantId) => {
    // 進行中のイシュー（ミッション）の 1 件目。読めなかったときは、無いものとして進める
    // （失敗は getMissionsByParticipantId が記録済み。イシューが無くても返信は作れる）。
    const missions = await getMissionsByParticipantId(participantId, tenantId);
    const first = selectActiveMissions(missions, 1)[0];
    if (!first) return null;
    const parts = parseIssuePurpose(first.purpose);
    return { title: first.title, hypothesis: parts.structured ? parts.hypothesis : null };
  },
  getPreviousQuestion: async (participantId, tenantId, beforeDate) => {
    const previous = await getPreviousDeliveredReply(participantId, tenantId, beforeDate);
    return previous ? lastParagraph(previous.content) : null;
  },
  callModel: callCoachModel,
  insertReply: insertCoachReply,
};

export async function GET(req: NextRequest) {
  try {
    const me = await resolveParticipant(req.nextUrl.searchParams.get("token"));
    if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });

    // 動いていない環境（スイッチ OFF・商品モード・環境の設定がまだ無い）と、アプリ全体で止めているあいだは、
    // 何も返さない（画面は何も出さない）。
    if (isCoachKillSwitchOn()) {
      return NextResponse.json({ enabled: false, optIn: null, items: [] }, { headers: NO_STORE });
    }
    const activation = await getCoachActivation(me.tenantId);
    if (!activation.ok) {
      return NextResponse.json({ error: "Failed to load" }, { status: 500, headers: NO_STORE });
    }
    if (!activation.active) {
      return NextResponse.json({ enabled: false, optIn: null, items: [] }, { headers: NO_STORE });
    }

    const [replies, optIn] = await Promise.all([
      listCoachRepliesForParticipant(me.id, me.tenantId),
      getCoachOptIn(me.id, me.tenantId),
    ]);
    if (replies === null || !optIn.ok) {
      return NextResponse.json({ error: "Failed to load" }, { status: 500, headers: NO_STORE });
    }
    const items: CoachReplyView[] = replies.map(toParticipantView).filter((v) => v.state !== "none");
    return NextResponse.json({ enabled: true, optIn: optIn.enabled, items }, { headers: NO_STORE });
  } catch (err) {
    logger.error("coach-reply GET error", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "Invalid request" }, { status: 400, headers: NO_STORE });

    const me = await resolveParticipant(body.token);
    if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });

    // check: true = 確かめるだけ（作らない。AI を呼ばない）。画面は、まずこれを呼び、willGenerate のときだけ
    // 「AIコーチが読んでいます」と出して、作る呼び出し（check なし）をする。
    const checkOnly = body.check === true;

    // 回数の制限は、作る呼び出しにだけ掛ける（確かめるだけの呼び出しは、AI を呼ばない）。
    if (!checkOnly && !rateLimit(`coach-reply:${me.id}`, COACH_POST_LIMIT, COACH_POST_WINDOW_MS).success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: NO_STORE });
    }

    const result = await ensureCoachReply(deps, {
      participantId: me.id,
      tenantId: me.tenantId,
      today: getTodayJST(),
      checkOnly,
    });

    if (result.kind === "error") {
      logger.error("coach-reply POST failed", {
        tenantId: me.tenantId,
        participantId: me.id,
        error: result.error,
        detail: result.detail,
      });
      return NextResponse.json(
        { error: "AIコーチの返信を作れませんでした" },
        { status: result.error === "ai_failed" ? 502 : 500, headers: NO_STORE }
      );
    }

    if (result.generated) {
      logger.info("coach-reply saved", { tenantId: me.tenantId, participantId: me.id, state: result.view.state });
    }
    // スイッチが OFF・止める設定・商品モード・環境の設定がまだ無いときは、enabled:false（画面は何も出さない）。
    const enabled = !(
      result.reason === "kill_switch" ||
      result.reason === "flag_off" ||
      result.reason === "standalone" ||
      result.reason === "not_configured"
    );
    return NextResponse.json(
      {
        enabled,
        view: result.view,
        // 確かめるだけの呼び出しで、このあと作ることになるか。
        willGenerate: result.willGenerate === true,
        // 一覧が空のときの案内を出し分けるための理由（本人の設定に関わるものだけを返す）。
        reason: result.reason === "no_profile" || result.reason === "opted_out" ? result.reason : null,
      },
      { headers: NO_STORE }
    );
  } catch (err) {
    logger.error("coach-reply POST error", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: NO_STORE });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "Invalid request" }, { status: 400, headers: NO_STORE });
    }

    const me = await resolveParticipant(body.token);
    if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });

    if (!(await coachFlagsOn(me.tenantId))) {
      return NextResponse.json({ error: "Feature not enabled" }, { status: 403, headers: NO_STORE });
    }

    // 設計図の行が無い人は、切り替えられない（0 行の更新を成功にしない）。
    const ok = await setCoachOptIn(me.id, me.tenantId, body.enabled);
    if (!ok) {
      return NextResponse.json({ error: "Failed to save" }, { status: 500, headers: NO_STORE });
    }
    logger.info("coach-reply opt-in changed", { tenantId: me.tenantId, participantId: me.id, enabled: body.enabled });
    return NextResponse.json({ ok: true, optIn: body.enabled }, { headers: NO_STORE });
  } catch (err) {
    logger.error("coach-reply PATCH error", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: NO_STORE });
  }
}
