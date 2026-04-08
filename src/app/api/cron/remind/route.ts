// POST /api/cron/remind
// Called by Vercel Cron: morning (JST 8:00) and evening (JST 17:00)
// Sends reminder emails to participants who haven't logged yet
// Skips weekends and Japanese holidays

import { NextRequest, NextResponse } from "next/server";
import { isBusinessDay, getJSTDateString, getJSTHour } from "@/lib/calendar";
import { sendReminderEmail, type ReminderType } from "@/lib/email";
import { hasLoggedToday } from "@/lib/notion";
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

  // Get all active participants (those with email and startDate or in pilot)
  const participants = await getAllParticipants();
  const activeParticipants = participants.filter(
    (p) => p.email && p.email !== "" && !p.email.includes("example.com")
  );

  const results: { name: string; email: string; sent: boolean; skipped?: string }[] = [];
  const useNotion = !!process.env.NOTION_API_TOKEN;

  for (const p of activeParticipants) {
    // Check if already logged today (Notion mode only)
    if (useNotion) {
      const logged = await hasLoggedToday(p.name, todayStr);

      if (type === "morning" && logged.hasMorning) {
        results.push({ name: p.name, email: p.email, sent: false, skipped: "already logged morning" });
        continue;
      }
      if (type === "evening" && logged.hasEvening) {
        results.push({ name: p.name, email: p.email, sent: false, skipped: "already logged evening" });
        continue;
      }
      // Evening reminder only if morning was logged
      if (type === "evening" && !logged.hasMorning) {
        results.push({ name: p.name, email: p.email, sent: false, skipped: "no morning entry" });
        continue;
      }
    }

    const sent = await sendReminderEmail({
      to: p.email,
      participantName: p.name.split(" ")[0], // Use family name only
      token: p.token,
      type,
    });

    results.push({ name: p.name, email: p.email, sent });
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
