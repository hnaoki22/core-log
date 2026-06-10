// POST /api/standalone/skip-reason
// standalone §5 未記入フォローアップの回答を記録する。
// ギャップの「事実」は /api/entry がエントリ作成時に skip_reasons へ記録済み。
// ここでは本人の任意回答テキストを該当行（return_log_id 一致・未回答）に追記する。

import { NextRequest, NextResponse } from "next/server";
import { updateSkipReasonAnswer } from "@/lib/supabase";
import { getParticipantByToken } from "@/lib/participant-db";
import { isStandaloneTenant } from "@/lib/standalone";
import { sanitizeInput } from "@/lib/sanitize";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, reason, returnLogId } = body;

    if (!token || typeof returnLogId !== "string" || returnLogId.length === 0) {
      return NextResponse.json({ error: "token and returnLogId required" }, { status: 400 });
    }

    const participant = await getParticipantByToken(token);
    if (!participant || !participant.tenantId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const standalone = await isStandaloneTenant(participant.tenantId);
    if (!standalone) {
      return NextResponse.json({ error: "Not available" }, { status: 403 });
    }

    const sanitized = typeof reason === "string" ? sanitizeInput(reason).slice(0, 1000) : "";
    if (sanitized.length === 0) {
      // 空回答＝事実のみ記録（entry 時に保存済み）。何も更新しない。
      return NextResponse.json({ success: true, recorded: false });
    }

    const ok = await updateSkipReasonAnswer(
      returnLogId,
      participant.id,
      participant.tenantId,
      sanitized
    );
    if (!ok) {
      // 該当行なし（再送・期限切れ等）。本人体験を止めるほどのことではない。
      return NextResponse.json({ success: true, recorded: false });
    }

    return NextResponse.json({ success: true, recorded: true });
  } catch (error) {
    logger.error("skip-reason API error", { error: String(error) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
