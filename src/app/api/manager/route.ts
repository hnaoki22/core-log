// GET /api/manager?token=xxx
// Returns manager info + enriched participant data from Notion

import { NextRequest, NextResponse } from "next/server";
import { getLogsByParticipant } from "@/lib/notion";
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

  const participantMocks = await getParticipantsForManager(manager.id);
  const todayJST = getTodayJST();
  const useMock = !process.env.NOTION_API_TOKEN;

  // Fetch Notion data for each participant in parallel
  const enrichedParticipants = await Promise.all(
    participantMocks.map(async (p) => {
      if (useMock) {
        // Mock mode: return mock data stats
        const logs = p.logs || [];
        const hasLogToday = logs.some((l) => l.date === todayJST && l.morningIntent);
        return {
          name: p.name,
          department: p.department,
          dojoPhase: p.dojoPhase,
          entryDays: (p.entryRate || 0) > 0 ? logs.filter((l) => l.morningIntent).length : 0,
          entryRate: p.entryRate || 0,
          streak: p.streak || 0,
          fbCount: p.fbCount || 0,
          todayHasLog: hasLogToday,
          latestLog: logs[0]
            ? {
                date: logs[0].date,
                morningIntent: logs[0].morningIntent,
                status: logs[0].status,
                energy: logs[0].energy,
              }
            : null,
          recentEnergy: logs.slice(0, 5).map((l) => l.energy),
        };
      }

      // Notion mode: fetch real data
      try {
        const logs = await getLogsByParticipant(p.name);
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
    },
    participants: enrichedParticipants,
  });
}
