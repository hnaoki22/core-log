// GET /api/cron/diagnose
// Diagnostic endpoint for email reminder system
// Returns full system status without sending emails (unless ?send=true)
// Auth: Bearer CRON_SECRET or x-vercel-cron header

import { NextRequest, NextResponse } from "next/server";
import { isBusinessDay, getJSTDateString, getJSTHour } from "@/lib/calendar";
import { sendReminderEmail, type ReminderType } from "@/lib/email";
import { hasLoggedToday, getAllTenants } from "@/lib/supabase";
import { getAllParticipants } from "@/lib/participant-db";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
  // Same auth as /api/cron/remind
  const isVercelCron = request.headers.get("x-vercel-cron") === "1";
  const authHeader = request.headers.get("authorization");
  const hasValidSecret = CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`;

  if (!isVercelCron && !hasValidSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sendEmails = request.nextUrl.searchParams.get("send") === "true";
  const todayStr = getJSTDateString();
  const jstHour = getJSTHour();
  const type: ReminderType = jstHour < 12 ? "morning" : "evening";
  const businessDay = isBusinessDay(todayStr);

  // Environment check
  const envCheck = {
    RESEND_API_KEY: !!process.env.RESEND_API_KEY,
    REMIND_FROM_EMAIL: process.env.REMIND_FROM_EMAIL || "(default: noreply@resend.dev)",
    CRON_SECRET: !!process.env.CRON_SECRET,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || "(default)",
  };

  // Participant check
  let allParticipants: Awaited<ReturnType<typeof getAllParticipants>> = [];
  let participantError: string | null = null;
  const tenants = await getAllTenants();

  try {
    for (const tenant of tenants) {
      const tenantParticipants = await getAllParticipants(tenant.id);
      allParticipants = allParticipants.concat(tenantParticipants);
    }
  } catch (error) {
    participantError = String(error);
  }

  const activeParticipants = allParticipants.filter(
    (p) => p.email && p.email !== "" && !p.email.includes("example.com")
  );

  // Log check for each participant
  const participantDetails = [];

  for (const p of activeParticipants) {
    let logStatus = null;
    let wouldSkip = false;
    let skipReason = "";

    try {
      logStatus = await hasLoggedToday(p.name, todayStr, p.tenantId || tenants[0]?.id);
      if (type === "morning" && logStatus.hasMorning) {
        wouldSkip = true;
        skipReason = "already logged morning";
      }
      if (type === "evening" && logStatus.hasEvening) {
        wouldSkip = true;
        skipReason = "already logged evening";
      }
      if (type === "evening" && !logStatus.hasMorning) {
        wouldSkip = true;
        skipReason = "no morning entry → evening skipped";
      }
    } catch (error) {
      logStatus = { error: String(error) };
    }

    let sendResult = null;
    if (sendEmails && !wouldSkip && businessDay) {
      sendResult = await sendReminderEmail({
        to: p.email,
        participantName: p.name.split(" ")[0],
        token: p.token,
        type,
      });
    }

    participantDetails.push({
      name: p.name,
      email: p.email,
      emailEnabled: p.emailEnabled,
      logStatus,
      wouldSkip,
      skipReason,
      sendResult: sendEmails ? sendResult : "(dry run)",
    });
  }

  return NextResponse.json({
    diagnostic: true,
    timestamp: new Date().toISOString(),
    jst: {
      date: todayStr,
      hour: jstHour,
      reminderType: type,
      isBusinessDay: businessDay,
    },
    environment: envCheck,
    participants: {
      total: allParticipants.length,
      active: activeParticipants.length,
      fetchError: participantError,
    },
    details: participantDetails,
    mode: sendEmails ? "LIVE (emails sent)" : "DRY RUN (no emails sent)",
    help: "Add ?send=true to actually send emails",
  });
}
