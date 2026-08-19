// POST   /api/standalone/quick-note          — 途中メモを1件保存（属する日付はサーバーが決める）
// GET    /api/standalone/quick-note?token&date — その日の途中メモ一覧（date 省略時は今日）
// DELETE /api/standalone/quick-note          — 本人のメモを1件削除
//
// ホーム右上「＋」の中身（2026-08-18 定例・太田さん FB「途中で何か入れられるボタン」）。
// standalone テナント限定・本人（participant token）のみ。マネージャー/管理者は不可。
// 見えるのは本人と装置だけ（AI分析の素材にも含める）。既存の logs 表には触れない。

import { NextRequest, NextResponse } from "next/server";
import { getParticipantByToken } from "@/lib/participant-db";
import { isStandaloneTenant } from "@/lib/standalone";
import {
  saveQuickNote,
  getQuickNotesForDate,
  deleteQuickNote,
  normalizeQuickNoteText,
  MAX_QUICK_NOTES_PER_DAY,
} from "@/lib/quick-notes";
import { sanitizeInput } from "@/lib/sanitize";
import { getTodayJST } from "@/lib/date-utils";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// token → 本人 + standalone テナントの共通ゲート
async function authorize(token: string) {
  const participant = await getParticipantByToken(token);
  if (!participant || !participant.tenantId) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!(await isStandaloneTenant(participant.tenantId))) {
    return { error: NextResponse.json({ error: "Not available" }, { status: 403 }) };
  }
  return { participant: { id: participant.id, tenantId: participant.tenantId } };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const token = typeof body?.token === "string" ? body.token : "";
    const rawText = typeof body?.text === "string" ? body.text : "";
    if (!token || !rawText.trim()) {
      return NextResponse.json({ error: "token と text は必須です" }, { status: 400 });
    }

    const auth = await authorize(token);
    if ("error" in auth) return auth.error;
    const { participant } = auth;

    const text = normalizeQuickNoteText(sanitizeInput(rawText));
    if (!text) {
      return NextResponse.json({ error: "メモが空です" }, { status: 400 });
    }

    // 属する日付はサーバーの業務日（深夜2時境界）。クライアントの日付は信用しない。
    const noteDate = getTodayJST();

    const existing = await getQuickNotesForDate(participant.id, participant.tenantId, noteDate);
    if (existing === null) {
      return NextResponse.json({ error: "保存に失敗しました。少し時間をおいてお試しください。" }, { status: 500 });
    }
    if (existing.length >= MAX_QUICK_NOTES_PER_DAY) {
      return NextResponse.json(
        { error: `今日のメモは${MAX_QUICK_NOTES_PER_DAY}件までです` },
        { status: 400 }
      );
    }

    const saved = await saveQuickNote(participant.id, participant.tenantId, noteDate, text);
    if (!saved) {
      return NextResponse.json({ error: "保存に失敗しました。少し時間をおいてお試しください。" }, { status: 500 });
    }
    return NextResponse.json({ success: true, note: saved });
  } catch (error) {
    logger.error("quick-note POST error", { error: String(error) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token") || "";
    if (!token) {
      return NextResponse.json({ error: "token required" }, { status: 400 });
    }
    const dateParam = req.nextUrl.searchParams.get("date");
    if (dateParam && !DATE_RE.test(dateParam)) {
      return NextResponse.json({ error: "date は YYYY-MM-DD 形式です" }, { status: 400 });
    }

    const auth = await authorize(token);
    if ("error" in auth) return auth.error;
    const { participant } = auth;

    const noteDate = dateParam || getTodayJST();
    const notes = await getQuickNotesForDate(participant.id, participant.tenantId, noteDate);
    if (notes === null) {
      return NextResponse.json({ error: "メモを取得できませんでした" }, { status: 500 });
    }
    return NextResponse.json({ success: true, date: noteDate, notes });
  } catch (error) {
    logger.error("quick-note GET error", { error: String(error) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const token = typeof body?.token === "string" ? body.token : "";
    const id = typeof body?.id === "string" ? body.id : "";
    if (!token || !id) {
      return NextResponse.json({ error: "token と id は必須です" }, { status: 400 });
    }

    const auth = await authorize(token);
    if ("error" in auth) return auth.error;
    const { participant } = auth;

    // 本人・同テナントの行だけを削除。0行なら「見つからない」（他人のメモには届かない）
    const ok = await deleteQuickNote(participant.id, participant.tenantId, id);
    if (!ok) {
      return NextResponse.json({ error: "メモが見つからないか、削除できませんでした" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("quick-note DELETE error", { error: String(error) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
