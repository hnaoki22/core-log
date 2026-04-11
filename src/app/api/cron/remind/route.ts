// POST /api/cron/remind
// Called by Vercel Cron: morning (JST 8:00) and evening (JST 17:00)
// Sends reminder emails to participants who haven't logged yet
// Skips weekends and Japanese holidays

import { NextRequest, NextResponse } from "next/server";
import { isBusinessDay, getJSTDateString, getJSTHour } from "@/lib/calendar";
import { sendReminderEmail, type ReminderType } from "@/lib/email";
import { hasLoggedToday } from "@/lib/supabase";
import { getAllParticipants } from "@/lib/participant-db";
import { logger } from "@/lib/logger";

// Vercel Cron secret for authentication
const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
  // Authenticate cron request:
  // 1. Vercel Cron automatically includes `x-vercel-cron: 1` header for scheduled runs
  // 2. Manual invocations must include Bearer CRON_SECRET (if configured)
  const isVercelCron = request.headers.get("x-vercel-cron") === "1";
  const authHeader = request.headers.get("authorization");
  const hasValidSecret = CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`;

  if (!isVercelCron && !hasValidSecret) {
    logger.warn("Cron unauthorized", {
      hasCronHeader: !!request.headers.get("x-vercel-cron"),
      hasAuth: !!authHeader,
      secretConfigured: !!CRON_SECRET,
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const todayStr = getJSTDateString();
  const jstHour = getJSTHour();

  // Skip weekends and holidays
  if (!isBusinessDay(todayStr)) {
    logger.info("Reminder skipped: not a business day", { date: todayStr });
    return NextResponse.json({
      message: "Skipped: not a business day",
      date: todayStr,
      sent: 0,
    });
  }

  // Determine reminder type based on JST hour
  // Morning cron runs at JST ~8:00, Evening at ~17:00
  const type: ReminderType = jstHour < 12 ? "morning" : "evening";

  // Get all active participants (those with email and within active period)
  const participants = await getAllParticipants();
  const activeParticipants = participants.filter(
    (p) => p.email && p.email !== "" && !p.email.includes("example.com")
  );

  const results: { name: string; email: string; sent: boolean; skipped?: string }[] = [];

  for (const p of activeParticipants) {
    try {
      // Check startDate: skip if today is before participant's start date
      if (p.startDate && todayStr < p.startDate) {
        results.push({ name: p.name, email: p.email, sent: false, skipped: `before start date (${p.startDate})` });
        continue;
      }

      // Check endDate: skip if today is after participant's end date
      if (p.endDate && todayStr > p.endDate) {
        results.push({ name: p.name, email: p.email, sent: false, skipped: `after end date (${p.endDate})` });
        continue;
      }

      // Check if already logged today
      let reminderType: ReminderType = type;
      const logged = await hasLoggedToday(p.name, todayStr, "81f91c26-214e-4da2-9893-6ac6c8984062");

      if (type === "morning" && logged.hasMorning) {
        results.push({ name: p.name, email: p.email, sent: false, skipped: "already logged morning" });
        continue;
      }
      if (type === "evening" && logged.hasEvening) {
        results.push({ name: p.name, email: p.email, sent: false, skipped: "already logged evening" });
        continue;
      }
      // 夕方リマインド: 朝未記入でも送信する（朝未記入の場合は別テンプレート）
      if (type === "evening" && !logged.hasMorning) {
        reminderType = "evening_no_morning";
      }

      const sent = await sendReminderEmail({
        to: p.email,
        participantName: p.name.split(" ")[0], // Use family name only
        token: p.token,
        type: reminderType,
      });

      results.push({ name: p.name, email: p.email, sent });
    } catch (error) {
      logger.error("Participant processing error", { name: p.name, email: p.email, error: String(error) });
      results.push({ name: p.name, email: p.email, sent: false, skipped: `error: ${String(error).slice(0, 100)}` });
    }
  }

  const sentCount = results.filter((r) => r.sent).length;

  logger.info("Reminder emails sent", { type, date: todayStr, totalParticipants: activeParticipants.length, sentCount });

  return NextResponse.json({
    message: `${type} reminders processed`,
    date: todayStr,
    jstHour,
    type,
    total: activeParticipants.length,
    sent: sentCount,
    results,
  });
}
