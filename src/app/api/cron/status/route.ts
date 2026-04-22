// GET /api/cron/status
//
// Heartbeat / observability endpoint for external monitoring (UptimeRobot,
// Healthchecks.io, Grafana synthetic, etc.). Returns the last 30 cron_runs
// rows so a monitor can verify that recent runs completed successfully.
//
// Phase 0 #17 — pair this endpoint with an external monitor that checks
// "there is a successful run of remind-morning for today's JST date by 9:00
// JST" to catch Vercel cron silent outages (the 2026-04-10 incident).
//
// Auth model: same as other cron endpoints — Bearer CRON_SECRET only, since
// this exposes run history and shouldn't be public.

import { NextRequest, NextResponse } from "next/server";
import { getLatestRuns } from "@/lib/cron-lock";
import { getJSTDateString } from "@/lib/calendar";
import { logger } from "@/lib/logger";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const hasValidSecret = CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`;

  // Also allow x-vercel-cron for internal checks
  const isVercelCron = request.headers.get("x-vercel-cron") === "1";

  if (!hasValidSecret && !isVercelCron) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const runs = await getLatestRuns();
    const todayJST = getJSTDateString();

    // For convenience, surface today's runs at the top level so a monitor
    // can check `todays_morning.status === "success"` without scanning.
    const todaysMorning = runs.find(
      (r) => r.cron_type === "remind-morning" && r.run_date === todayJST
    );
    const todaysEvening = runs.find(
      (r) => r.cron_type === "remind-evening" && r.run_date === todayJST
    );

    return NextResponse.json({
      date: todayJST,
      todays_morning: todaysMorning ?? null,
      todays_evening: todaysEvening ?? null,
      recent_runs: runs,
    });
  } catch (e) {
    logger.error("Cron status endpoint failed", { error: String(e) });
    return NextResponse.json({ error: "Failed to fetch status" }, { status: 500 });
  }
}
