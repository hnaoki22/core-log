// GET /api/manager?token=xxx
// Returns manager info + enriched participant data (Supabase / Notion / Mock)

import { NextRequest, NextResponse } from "next/server";
import { getLogsByParticipant } from "@/lib/supabase";
import {
  getManagerByToken,
  getParticipantsForManager,
} from "@/lib/participant-db";
import { computeParticipantStats } from "@/lib/stats";
import { getTodayJST } from "@/lib/date-utils";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  const manager = await getManagerByToken(token);
  if (!manager) {
    return NextResponse.json({ error: "Manager not found" }, { status: 404 });
  }

  const participantMocks = await getParticipantsForManager(manager.id, manager.tenantId);
  const todayJST = getTodayJST();

  // Fetch Supabase data for each participant in parallel
  const enrichedParticipants = await Promise.all(
    participantMocks.map(async (p) => {
      // Supabase mode: fetch from API
      try {
        const logs = await getLogsByParticipant(p.name, p.tenantId || "81f91c26-214e-4da2-9893-6ac6c8984062");
        const stats = computeParticipantStats(logs, todayJST);
        const latestLog = logs[0] || null;

        const hasLogToday = logs.some((l) => l.date === todayJST && l.morningIntent);
        return {
          name: p.name,
          department: p.department,
          dojoPhase: p.dojoPhase,
          entryDays: stats.entryDays,
          entryRate: stats.entryRate,
          streak: stats.streak,
          fbCount: stats.fbCount,
          todayHasLog: hasLogToday,
          latestLog: latestLog
            ? {
                date: latestLog.date,
                morningIntent: latestLog.morningIntent,
                status: latestLog.status,
                energy: latestLog.energy,
              }
            : null,
          recentEnergy: logs.slice(0, 5).map((l) => l.energy),
        };
      } catch (error) {
        console.error(`Error fetching data for ${p.name}:`, error);
        return {
          name: p.name,
          department: p.department,
          dojoPhase: p.dojoPhase,
          entryDays: 0,
          entryRate: 0,
          streak: 0,
          fbCount: 0,
          todayHasLog: false,
          latestLog: null,
          recentEnergy: [],
        };
      }
    })
  );

  return NextResponse.json({
    manager: {
      name: manager.name,
      department: manager.department,
      isAdmin: manager.isAdmin || false,
    },
    participants: enrichedParticipants,
  });
}
