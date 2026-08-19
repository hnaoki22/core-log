// GET /api/standalone/report?token=xxx
// standalone §8: 21日AIレポート v0（相関レンズ＋テーマ反復レンズ）
//
// - 本人（participant token）のみアクセス可。マネージャー/管理者は不可。
// - standalone テナント限定 + §6 のアンロック条件（21日経過+記入10日）を
//   サーバー側でも検証する（UI ゲートだけに頼らない）。
// - 24時間以内の生成済みレポートがあればそれを返す（LLMコスト抑制）。
// - 応答には history（表示中を除く過去レポート・新しい順・上限 REPORT_HISTORY_LIMIT）を
//   同梱する（2026-07-23 太田さん FB「3週間分の塊の推移」→ 過去レポートを並べて見る）。
//   同じ本人・standalone・解禁済みのゲートを通った後にのみ返るので、別エンドポイントにしない。
// - ?view=1（閲覧モード）: 生成を一切走らせず、保存済みの最新＋過去分だけを返す
//   （2026-08-18 太田さん FB「毎回20〜30秒の生成をしないと過去の分析が見られない仕様は変えた方がいい」
//   → ログ画面の「AI分析（これまで）」から使う。生成は従来どおり AI分析ボタン＝このAPIの通常呼び出し）。
//   保存済みが1件も無ければ empty:true。

import { NextRequest, NextResponse } from "next/server";
import { getLogsByParticipant } from "@/lib/supabase";
import { getParticipantByToken } from "@/lib/participant-db";
import { isStandaloneTenant, computeUnlockState } from "@/lib/standalone";
import {
  getLatestStandaloneReport,
  generateStandaloneReport,
  latestSubmittedLogDate,
  listStandaloneReports,
} from "@/lib/standalone-report";
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
    const viewOnly = request.nextUrl.searchParams.get("view") === "1";

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

    // 閲覧モード: 生成せず、保存済みの最新＋過去分だけを返す
    if (viewOnly) {
      if (!latest) {
        return NextResponse.json({ success: true, view: true, empty: true, history: [] });
      }
      const history = await listStandaloneReports(participant.id, tenantId, { excludeId: latest.id });
      return NextResponse.json({
        success: true,
        view: true,
        cached: true,
        ...latest,
        history: history ?? [],
        historyUnavailable: history === null,
      });
    }

    const latestLogDate = latestSubmittedLogDate(logs);
    if (latest && latestLogDate && latest.periodEnd >= latestLogDate) {
      const history = await listStandaloneReports(participant.id, tenantId, { excludeId: latest.id });
      // history 取得失敗はレポート本体を止めない（logger 済み）。UI で「取得できなかった」と出せるよう明示する。
      return NextResponse.json({
        success: true,
        cached: true,
        ...latest,
        history: history ?? [],
        historyUnavailable: history === null,
      });
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

    // 生成直後は今作った1件を除いた過去分（永続化に失敗した場合 id="" なので除外指定なし）
    const history = await listStandaloneReports(participant.id, tenantId, {
      excludeId: generated.id || null,
    });
    return NextResponse.json({
      success: true,
      cached: false,
      ...generated,
      history: history ?? [],
      historyUnavailable: history === null,
    });
  } catch (error) {
    logger.error("standalone report API error", { error: String(error) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
