// POST /api/entry
// Create morning entry or update with evening data
// Prevents duplicate entries for the same day

import { NextRequest, NextResponse } from "next/server";
import { createMorningEntry, createEveningOnlyEntry, updateEveningEntry, hasLoggedToday } from "@/lib/supabase";
import { getParticipantByToken, getManagerById } from "@/lib/participant-db";
import { sendNotificationEmail } from "@/lib/email";
import { isProgramEnded, isProgramNotStarted, getCurrentHourJST, isGracePeriod } from "@/lib/date-utils";
import { sanitizeInput } from "@/lib/sanitize";
import { logger } from "@/lib/logger";
import { resolvePhaseMode, triggerBodyPromptIfNeeded } from "@/lib/kan-no-ki";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, token } = body;

    if (!token || !type) {
      return NextResponse.json({ error: "Token and type required" }, { status: 400 });
    }

    // Check if participant's program is still active
    const participant = await getParticipantByToken(token);
    if (!participant) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
    if (!participant.tenantId) {
      logger.error("Entry API: participant missing tenantId (DB invariant broken)", { participantId: participant.id });
      return NextResponse.json({ error: "Participant tenant unresolved" }, { status: 500 });
    }
    const tenantId = participant.tenantId;
    const participantId = participant.id;
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

    // Real Notion API
    if (type === "morning") {
      const { participantName, date, morningIntent, energy, dojoPhase, weekNum, morningDurationSec } = body;

      // 朝の記入は12:00（正午）まで
      // 深夜0:00〜3:59はグレースピリオド（前日扱い）なので朝の記入は不可
      const hour = getCurrentHourJST();
      if (hour >= 12 || isGracePeriod()) {
        return NextResponse.json(
          { error: "朝の意図設定は12:00までです。本日の振り返りをご記入ください。", morningClosed: true },
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

      const phaseMode = await resolvePhaseMode(participantId, tenantId);
      const sanitizedBodyIntent = body.bodyIntent ? sanitizeInput(String(body.bodyIntent)) : null;
      const pageId = await createMorningEntry(
        participantName, date, sanitizedMorningIntent, energy,
        dojoPhase, weekNum, tenantId, participantId,
        typeof morningDurationSec === "number" ? morningDurationSec : null,
        phaseMode,
        sanitizedBodyIntent && sanitizedBodyIntent.length > 0 ? sanitizedBodyIntent : null,
      );
      if (!pageId) {
        return NextResponse.json({ error: "Failed to create entry" }, { status: 500 });
      }
      // 観の期参加者で強い感情語が含まれていたら身体への問いかけを添える
      if (phaseMode === "kan-no-ki") {
        await triggerBodyPromptIfNeeded(participantId, tenantId, sanitizedMorningIntent, pageId);
      }
      // duration を含めて応答（フロントの「N 分 N 秒で書きました」表示用）
      const respDuration = typeof morningDurationSec === "number" && morningDurationSec >= 0 && morningDurationSec <= 1800
        ? Math.round(morningDurationSec) : null;

      // Notify manager that subordinate submitted morning log
      try {
        const participant = await getParticipantByToken(token);
        if (participant?.managerId) {
          const mgr = await getManagerById(participant.managerId);
          if (mgr?.email && !mgr.email.includes("example.com")) {
            await sendNotificationEmail({
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

      logger.info("Morning entry created", { participantName, date, pageId, durationSec: respDuration });
      return NextResponse.json({ success: true, pageId, durationSec: respDuration });
    }

    if (type === "evening") {
      const { pageId, eveningInsight, energy, participantName, eveningDurationSec } = body;
      if (!pageId) {
        return NextResponse.json({ error: "pageId is required for evening entry" }, { status: 400 });
      }

      // Sanitize user input
      const sanitizedEveningInsight = sanitizeInput(eveningInsight || "");

      // 観の期の身体欄（任意）。InputClient は kan-no-ki 時のみ bodyCheck を送る。
      // 従来この値を読まずに捨てていた（朝→夕フローで夕の身体欄が喪失するバグ）。
      const sanitizedBodyCheckE = body.bodyCheck ? sanitizeInput(String(body.bodyCheck)) : null;
      const success = await updateEveningEntry(
        pageId, sanitizedEveningInsight, energy,
        typeof eveningDurationSec === "number" ? eveningDurationSec : null,
        sanitizedBodyCheckE && sanitizedBodyCheckE.length > 0 ? sanitizedBodyCheckE : null
      );
      if (!success) {
        return NextResponse.json({ error: "Failed to update entry" }, { status: 500 });
      }
      // 観の期参加者で強い感情語が含まれていたら身体への問いかけを添える
      try {
        const phaseModeE = await resolvePhaseMode(participantId, tenantId);
        if (phaseModeE === "kan-no-ki") {
          await triggerBodyPromptIfNeeded(participantId, tenantId, sanitizedEveningInsight, pageId);
        }
      } catch (e) {
        logger.warn("Body prompt trigger skipped (evening)", { error: String(e) });
      }
      const respDurationE = typeof eveningDurationSec === "number" && eveningDurationSec >= 0 && eveningDurationSec <= 1800
        ? Math.round(eveningDurationSec) : null;

      // Notify manager that subordinate submitted evening log
      try {
        const participant = await getParticipantByToken(token);
        if (participant?.managerId) {
          const mgr = await getManagerById(participant.managerId);
          if (mgr?.email && !mgr.email.includes("example.com")) {
            await sendNotificationEmail({
              to: mgr.email,
              recipientName: mgr.name.split(" ")[0],
              senderName: participantName || participant.name,
              token: mgr.token,
              type: "daily_log_submitted",
              detail: `本日の振り返り：${sanitizedEveningInsight.substring(0, 60)}${sanitizedEveningInsight.length > 60 ? "…" : ""}`,
            });
          }
        }
      } catch (e) {
        logger.error("Failed to send manager notification", { error: String(e), participantName });
      }

      logger.info("Evening entry updated", { participantName, pageId, durationSec: respDurationE });
      return NextResponse.json({ success: true, durationSec: respDurationE });
    }

    // 朝未記入で12:00を過ぎた場合の夕方のみエントリー
    if (type === "evening_only") {
      const { participantName, date, eveningInsight, energy, dojoPhase, weekNum, eveningDurationSec } = body;

      const sanitizedEveningInsight = sanitizeInput(eveningInsight || "");

      // Check if entry already exists for today
      const todayStatus = await hasLoggedToday(participantName, date, tenantId);
      if (todayStatus.hasEvening) {
        return NextResponse.json(
          { error: "今日の夕方の記入は既に完了しています" },
          { status: 409 }
        );
      }

      const phaseModeEO = await resolvePhaseMode(participantId, tenantId);
      const sanitizedBodyCheckEO = body.bodyCheck ? sanitizeInput(String(body.bodyCheck)) : null;
      const pageId = await createEveningOnlyEntry(
        participantName, date, sanitizedEveningInsight, energy,
        dojoPhase, weekNum, tenantId, participantId,
        typeof eveningDurationSec === "number" ? eveningDurationSec : null,
        phaseModeEO,
        sanitizedBodyCheckEO && sanitizedBodyCheckEO.length > 0 ? sanitizedBodyCheckEO : null,
      );
      if (!pageId) {
        return NextResponse.json({ error: "Failed to create entry" }, { status: 500 });
      }
      // 観の期参加者で強い感情語が含まれていたら身体への問いかけを添える
      if (phaseModeEO === "kan-no-ki") {
        await triggerBodyPromptIfNeeded(participantId, tenantId, sanitizedEveningInsight, pageId);
      }
      const respDurationEO = typeof eveningDurationSec === "number" && eveningDurationSec >= 0 && eveningDurationSec <= 1800
        ? Math.round(eveningDurationSec) : null;

      // Notify manager
      try {
        const participant = await getParticipantByToken(token);
        if (participant?.managerId) {
          const mgr = await getManagerById(participant.managerId);
          if (mgr?.email && !mgr.email.includes("example.com")) {
            await sendNotificationEmail({
              to: mgr.email,
              recipientName: mgr.name.split(" ")[0],
              senderName: participantName,
              token: mgr.token,
              type: "daily_log_submitted",
              detail: `本日の振り返り：${sanitizedEveningInsight.substring(0, 60)}${sanitizedEveningInsight.length > 60 ? "…" : ""}`,
            });
          }
        }
      } catch (e) {
        logger.error("Failed to send manager notification", { error: String(e), participantName });
      }

      logger.info("Evening-only entry created", { participantName, date, pageId, durationSec: respDurationEO });
      return NextResponse.json({ success: true, pageId, durationSec: respDurationEO });
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (error) {
    logger.error("Entry API error", { error: String(error) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
