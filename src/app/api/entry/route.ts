// POST /api/entry
// Create morning entry or update with evening data
// Prevents duplicate entries for the same day

import { NextRequest, NextResponse } from "next/server";
import { createMorningEntry, createEveningOnlyEntry, updateEveningEntry, hasLoggedToday } from "@/lib/supabase";
import { getParticipantByToken, getManagerById } from "@/lib/participant-db";
import { sendNotificationEmail } from "@/lib/email";
import { isProgramEnded, isProgramNotStarted, getCurrentHourJST } from "@/lib/date-utils";
import { sanitizeInput } from "@/lib/sanitize";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, token } = body;

    if (!token || !type) {
      return NextResponse.json({ error: "Token and type required" }, { status: 400 });
    }

    // Check if participant's program is still active
    const participant = await getParticipantByToken(token);
    const tenantId = participant?.tenantId || "81f91c26-214e-4da2-9893-6ac6c8984062";
    const participantId = participant?.id || "";
    if (participant) {
      if (participant.endDate && isProgramEnded(participant.endDate)) {
        return NextResponse.json({
          error: "プログラムは終了しています。日報の入力はできません。",
          programEnded: true,
        }, { status: 403 });
      }
      if (participant.startDate && isProgramNotStarted(participant.startDate)) {
        return NextResponse.json({
          error: "プログラムはまだ開始されていません。",
          notStarted: true,
        }, { status: 403 });
      }
    }

    // Real Notion API
    if (type === "morning") {
      const { participantName, date, morningIntent, energy, dojoPhase, weekNum } = body;

      // 朝の記入は12:00（正午）まで
      const hour = getCurrentHourJST();
      if (hour >= 12) {
        return NextResponse.json(
          { error: "朝の意図設定は12:00までです。夕方の振り返りをご記入ください。", morningClosed: true },
          { status: 403 }
        );
      }

      // Sanitize user input
      const sanitizedMorningIntent = sanitizeInput(morningIntent || "");

      // Check if entry already exists for today
      const todayStatus = await hasLoggedToday(participantName, date, tenantId);
      if (todayStatus.hasMorning) {
        return NextResponse.json(
          { error: "今日の朝の記入は既に完了しています" },
          { status: 409 }
        );
      }

      const pageId = await createMorningEntry(participantName, date, sanitizedMorningIntent, energy, dojoPhase, weekNum, tenantId, participantId);
      if (!pageId) {
        return NextResponse.json({ error: "Failed to create entry" }, { status: 500 });
      }

      // Notify manager that subordinate submitted morning log
      try {
        const participant = await getParticipantByToken(token);
        if (participant?.managerId) {
          const mgr = await getManagerById(participant.managerId);
          if (mgr?.email && !mgr.email.includes("example.com")) {
            sendNotificationEmail({
              to: mgr.email,
              recipientName: mgr.name.split(" ")[0],
              senderName: participantName,
              token: mgr.token,
              type: "daily_log_submitted",
              detail: `朝の意図：${sanitizedMorningIntent.substring(0, 60)}${sanitizedMorningIntent.length > 60 ? "…" : ""}`,
            });
          }
        }
      } catch (e) {
        logger.error("Failed to send manager notification", { error: String(e), participantName });
      }

      logger.info("Morning entry created", { participantName, date, pageId });
      return NextResponse.json({ success: true, pageId });
    }

    if (type === "evening") {
      const { pageId, eveningInsight, energy, participantName } = body;
      if (!pageId) {
        return NextResponse.json({ error: "pageId is required for evening entry" }, { status: 400 });
      }

      // Sanitize user input
      const sanitizedEveningInsight = sanitizeInput(eveningInsight || "");

      const success = await updateEveningEntry(pageId, sanitizedEveningInsight, energy);
      if (!success) {
        return NextResponse.json({ error: "Failed to update entry" }, { status: 500 });
      }

      // Notify manager that subordinate submitted evening log
      try {
        const participant = await getParticipantByToken(token);
        if (participant?.managerId) {
          const mgr = await getManagerById(participant.managerId);
          if (mgr?.email && !mgr.email.includes("example.com")) {
            sendNotificationEmail({
              to: mgr.email,
              recipientName: mgr.name.split(" ")[0],
              senderName: participantName || participant.name,
              token: mgr.token,
              type: "daily_log_submitted",
              detail: `夕の気づき：${sanitizedEveningInsight.substring(0, 60)}${sanitizedEveningInsight.length > 60 ? "…" : ""}`,
            });
          }
        }
      } catch (e) {
        logger.error("Failed to send manager notification", { error: String(e), participantName });
      }

      logger.info("Evening entry updated", { participantName, pageId });
      return NextResponse.json({ success: true });
    }

    // 朝未記入で12:00を過ぎた場合の夕方のみエントリー
    if (type === "evening_only") {
      const { participantName, date, eveningInsight, energy, dojoPhase, weekNum } = body;

      const sanitizedEveningInsight = sanitizeInput(eveningInsight || "");

      // Check if entry already exists for today
      const todayStatus = await hasLoggedToday(participantName, date, tenantId);
      if (todayStatus.hasEvening) {
        return NextResponse.json(
          { error: "今日の夕方の記入は既に完了しています" },
          { status: 409 }
        );
      }

      const pageId = await createEveningOnlyEntry(participantName, date, sanitizedEveningInsight, energy, dojoPhase, weekNum, tenantId, participantId);
      if (!pageId) {
        return NextResponse.json({ error: "Failed to create entry" }, { status: 500 });
      }

      // Notify manager
      try {
        const participant = await getParticipantByToken(token);
        if (participant?.managerId) {
          const mgr = await getManagerById(participant.managerId);
          if (mgr?.email && !mgr.email.includes("example.com")) {
            sendNotificationEmail({
              to: mgr.email,
              recipientName: mgr.name.split(" ")[0],
              senderName: participantName,
              token: mgr.token,
              type: "daily_log_submitted",
              detail: `夕の振り返り：${sanitizedEveningInsight.substring(0, 60)}${sanitizedEveningInsight.length > 60 ? "…" : ""}`,
            });
          }
        }
      } catch (e) {
        logger.error("Failed to send manager notification", { error: String(e), participantName });
      }

      logger.info("Evening-only entry created", { participantName, date, pageId });
      return NextResponse.json({ success: true, pageId });
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (error) {
    logger.error("Entry API error", { error: String(error) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
