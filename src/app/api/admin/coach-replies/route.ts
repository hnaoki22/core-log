// /api/admin/coach-replies — 運営の「AIコーチの確認」（feature.coachReply）
//
// GET  ?token=&tenant=<slug>&date=YYYY-MM-DD        その環境・その日の、記入と AIコーチの返信
// POST { token, replyId, action: "deliver"|"withdraw" }  管理者が、返信を届ける・取り下げる
//
// 読める人は、記入を読める人と同じ範囲（GET /api/admin と同じ）：
// - 管理者（is_admin）：環境を 1 つ指定して読む（?tenant= が必須。指定が無いときに、所属の環境や
//   全環境へ黙って読み替えない）。届ける・取り下げるができる。
// - 閲覧者（observer）：自分の環境だけを読む。操作はできない。
// - 上司の画面のトークン、知らないトークン：403。
//
// 記入の文を返すので、次の 3 つをここで確かめる（CLAUDE.md §8 項目 10・11）。
// - 商品モードの環境は 403（standaloneGuard）。
// - 観の期の記入は読まない（loadCoachBoard が除く）。
// - スイッチが OFF の環境と、環境の設定（届け方と開始日）がまだ無い環境では、記入も返信も返さない
//   （このページを、記入を読む別の入口にしない）。
//
// 操作は、対象の行の環境（tenant_id）を先に引き、その環境で絞って更新する（操作する人の所属では絞らない）。

import { NextRequest, NextResponse } from "next/server";
import { getManagerByToken } from "@/lib/participant-db";
import { getTenantById, getTenantBySlug } from "@/lib/supabase";
import { resolveManagerTenantStrict } from "@/lib/tenant-context";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { standaloneGuard } from "@/lib/standalone";
import { getTodayJST } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import {
  coachBoardRole,
  coachBoardState,
  decideCoachAction,
  normalizeBoardDate,
  sortCoachBoard,
  type CoachBoardAction,
} from "@/lib/coach-reply";
import { isCoachKillSwitchOn } from "@/lib/coach-reply-llm";
import { getCoachConfig, getCoachReplyTenant, loadCoachBoard, setCoachReplyStatus } from "@/lib/coach-reply-store";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/** 設計図と AIコーチの返信の、両方のスイッチが ON か。 */
async function coachFlagsOn(tenantId: string): Promise<boolean> {
  const [reply, profile] = await Promise.all([
    isFeatureEnabled("feature.coachReply", tenantId),
    isFeatureEnabled("feature.coachingProfile", tenantId),
  ]);
  return reply && profile;
}

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token");
    if (!token) return json({ error: "Unauthorized" }, 403);

    const manager = await getManagerByToken(token);
    const role = coachBoardRole(manager);
    if (!manager || !role) return json({ error: "Unauthorized" }, 403);

    // 読む環境を決める。
    let tenant: { id: string; name: string; slug: string } | null = null;
    if (role === "admin") {
      const slug = request.nextUrl.searchParams.get("tenant");
      if (!slug) {
        return json({ error: "環境を 1 つ指定してください（?tenant=）", needTenant: true }, 400);
      }
      const found = await getTenantBySlug(slug);
      if (!found) return json({ error: "Unknown tenant" }, 404);
      tenant = { id: found.id, name: found.name, slug: found.slug };
    } else {
      const own = resolveManagerTenantStrict(manager);
      if (!own.ok) return json(own.errorBody, own.status);
      const found = await getTenantById(own.tenantId);
      tenant = found
        ? { id: found.id, name: found.name, slug: found.slug }
        : { id: own.tenantId, name: "", slug: "" };
    }

    const blocked = await standaloneGuard(tenant.id, "coach-board");
    if (blocked) return blocked;

    const today = getTodayJST();
    const date = normalizeBoardDate(request.nextUrl.searchParams.get("date"), today);
    const base = {
      role,
      canAct: role === "admin",
      tenant: { name: tenant.name, slug: tenant.slug },
      date,
      today,
      killSwitch: isCoachKillSwitchOn(),
    };

    // スイッチが OFF の環境と、環境の設定（届け方と開始日）がまだ無い環境では、記入も返信も返さない。
    if (!(await coachFlagsOn(tenant.id))) {
      return json({ ...base, enabled: false, configured: false, config: null, rows: [] });
    }
    const configRead = await getCoachConfig(tenant.id);
    if (!configRead.ok) return json({ error: "Failed to load" }, 500);
    if (configRead.config === null) {
      return json({ ...base, enabled: true, configured: false, config: null, rows: [] });
    }

    const rows = await loadCoachBoard(tenant.id, date);
    if (rows === null) return json({ error: "Failed to load" }, 500);

    const withState = rows.map((row) => ({ ...row, state: coachBoardState(row) }));
    return json({
      ...base,
      enabled: true,
      configured: true,
      config: configRead.config,
      rows: sortCoachBoard(withState, (row) => row.state),
    });
  } catch (err) {
    logger.error("admin coach-replies GET error", { error: err instanceof Error ? err.message : String(err) });
    return json({ error: "Internal server error" }, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return json({ error: "Invalid request" }, 400);

    const token = typeof body.token === "string" ? body.token : "";
    if (!token) return json({ error: "Unauthorized" }, 403);
    const manager = await getManagerByToken(token);
    // 届ける・取り下げるは、管理者（is_admin）だけ。
    if (!manager || coachBoardRole(manager) !== "admin") return json({ error: "Unauthorized" }, 403);

    const replyId = typeof body.replyId === "string" ? body.replyId : "";
    const action = body.action;
    if (!UUID_RE.test(replyId) || (action !== "deliver" && action !== "withdraw")) {
      return json({ error: "Invalid request" }, 400);
    }

    // 対象の行の環境を先に引く（操作する人の所属の環境では絞らない）。
    const target = await getCoachReplyTenant(replyId);
    if (!target.ok) return json({ error: "Failed to load" }, 500);
    if (!target.tenantId || !target.status) return json({ error: "Not found" }, 404);

    const blocked = await standaloneGuard(target.tenantId, "coach-board-action");
    if (blocked) return blocked;

    // 届けるのは、スイッチが ON の環境だけ。取り下げは、スイッチの状態に関係なくできる（止めるための操作なので）。
    if (action === "deliver" && !(await coachFlagsOn(target.tenantId))) {
      return json({ error: "Feature not enabled" }, 403);
    }

    const decision = decideCoachAction(action as CoachBoardAction, {
      status: target.status,
      hasContent: target.hasContent,
    });
    if (!decision.ok) return json({ error: "この操作は、いまの状態ではできません", reason: decision.reason }, 409);

    const result = await setCoachReplyStatus({
      replyId,
      tenantId: target.tenantId,
      expectedStatus: target.status,
      status: decision.next,
      // 氏名ではなく ID を残す（氏名を写して持つと、改名のあとで食い違う）。
      reviewedBy: manager.id,
      now: new Date().toISOString(),
    });
    if (result === "conflict") return json({ error: "状態が変わっています", reason: "conflict" }, 409);
    if (result !== "ok") return json({ error: "Failed to save" }, 500);

    logger.info("coach reply status changed", {
      replyId,
      tenantId: target.tenantId,
      from: target.status,
      to: decision.next,
      managerId: manager.id,
    });
    return json({ ok: true, status: decision.next });
  } catch (err) {
    logger.error("admin coach-replies POST error", { error: err instanceof Error ? err.message : String(err) });
    return json({ error: "Internal server error" }, 500);
  }
}
