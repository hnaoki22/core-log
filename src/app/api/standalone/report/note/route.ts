// POST /api/standalone/report/note      — 本人の「自分の気づき」を保存
// GET  /api/standalone/report/note?token — 過去の気づき一覧
//
// 太田さん要望①(2026-06-18)。standalone テナント限定・本人(participant token)のみ。
// tier-e.selfInsightNote フラグで制御（既定OFF。Reflection Lab のみ ON）。

import { NextRequest, NextResponse } from "next/server";
import { getParticipantByToken } from "@/lib/participant-db";
import { isFeatureEnabledForToken } from "@/lib/feature-flags";
import { isStandaloneTenant } from "@/lib/standalone";
import { getStandaloneReportNotes, saveStandaloneReportNote } from "@/lib/standalone-notes";
import { sanitizeInput } from "@/lib/sanitize";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const FLAG = "tier-e.selfInsightNote";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const token = typeof body?.token === "string" ? body.token : "";
    const reportId = typeof body?.reportId === "string" && body.reportId ? body.reportId : null;
    const rawNote = typeof body?.note === "string" ? body.note : "";

    if (!token || !rawNote.trim()) {
      return NextResponse.json({ error: "token と note は必須です" }, { status: 400 });
    }

    if (!(await isFeatureEnabledForToken(FLAG, token))) {
      return NextResponse.json({ error: "この機能は有効化されていません" }, { status: 403 });
    }

    const participant = await getParticipantByToken(token);
    if (!participant || !participant.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await isStandaloneTenant(participant.tenantId))) {
      return NextResponse.json({ error: "Not available" }, { status: 403 });
    }

    const note = sanitizeInput(rawNote);
    const saved = await saveStandaloneReportNote(participant.id, participant.tenantId, reportId, note);
    if (!saved) {
      return NextResponse.json({ error: "保存に失敗しました。少し時間をおいてお試しください。" }, { status: 500 });
    }

    return NextResponse.json({ success: true, note: saved });
  } catch (error) {
    logger.error("standalone note POST error", { error: String(error) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token") || "";
    if (!token) {
      return NextResponse.json({ error: "token required" }, { status: 400 });
    }

    if (!(await isFeatureEnabledForToken(FLAG, token))) {
      return NextResponse.json({ error: "この機能は有効化されていません" }, { status: 403 });
    }

    const participant = await getParticipantByToken(token);
    if (!participant || !participant.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await isStandaloneTenant(participant.tenantId))) {
      return NextResponse.json({ error: "Not available" }, { status: 403 });
    }

    const notes = await getStandaloneReportNotes(participant.id, participant.tenantId);
    return NextResponse.json({ success: true, notes });
  } catch (error) {
    logger.error("standalone note GET error", { error: String(error) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
