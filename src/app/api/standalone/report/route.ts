// GET /api/standalone/report?token=xxx
// standalone §8: 21日AIレポート v0（相関レンズ＋テーマ反復レンズ）
//
// - 本人（participant token）のみアクセス可。マネージャー/管理者は不可。
// - standalone テナント限定 + §6 のアンロック条件（21日経過+記入10日）を
//   サーバー側でも検証する（UI ゲートだけに頼らない）。
// - 24時間以内の生成済みレポートがあればそれを返す（LLMコスト抑制）。

import { NextRequest, NextResponse } from "next/server";
import { getLogsByParticipant } from "@/lib/supabase";
import { getParticipantByToken } from "@/lib/participant-db";
import { isStandaloneTenant, computeUnlockState } from "@/lib/standalone";
import { getLatestStandaloneReport, generateStandaloneReport, latestSubmittedLogDate } from "@/lib/standalone-report";
import { getTodayJST } from "@/lib/date-utils";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
// LLM 生成があるため関数の実行時間上限を引き上げる（Vercel）
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token");
    if (!token) {
      return NextResponse.json({ error: "Token required" }, { status: 400 });
    }

    const participant = await getParticipantByToken(token);
    if (!participant || !participant.tenantId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
    const tenantId = participant.tenantId;

    const standalone = await isStandaloneTenant(tenantId);
    if (!standalone) {
      return NextResponse.json({ error: "Not available" }, { status: 403 });
    }

    // 本人の全ログ（観の期含む自分用ビュー）
    const logs = await getLogsByParticipant(participant.name, tenantId, { includeKanNoKi: true });
    const todayJST = getTodayJST();

    // §6 アンロック条件をサーバー側でも検証
    const unlock = computeUnlockState(logs, todayJST);
    if (!unlock.unlocked) {
      return NextResponse.json(
        {
          error: "まだ解禁されていません",
          locked: true,
          daysElapsed: unlock.daysElapsed,
          entryDays: unlock.entryDays,
        },
        { status: 403 }
      );
    }

    // logform v2 Item 1（レポート固定化）: 新しい提出ログが無ければ、24hを超えても
    // 生成済みレポートをそのまま返す。同じ入力を毎日再生成して文面がドリフトするのを
    // 止め、新ログが入ったときだけ再生成する（商談デモの再生成リスクも同時に解消）。
    const latest = await getLatestStandaloneReport(participant.id, tenantId, Infinity);
    const latestLogDate = latestSubmittedLogDate(logs);
    if (latest && latestLogDate && latest.periodEnd >= latestLogDate) {
      return NextResponse.json({ success: true, cached: true, ...latest });
    }

    const generated = await generateStandaloneReport(
      { id: participant.id, name: participant.name },
      tenantId,
      logs,
      todayJST
    );
    if (!generated) {
      return NextResponse.json(
        { error: "レポートの生成に失敗しました。少し時間をおいてからお試しください。" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, cached: false, ...generated });
  } catch (error) {
    logger.error("standalone report API error", { error: String(error) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
