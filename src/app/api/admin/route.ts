// GET /api/admin?token=xxx
// Returns all participants + managers with enriched Notion data

import { NextRequest, NextResponse } from "next/server";
import { getLogsByParticipant } from "@/lib/notion";
import {
  getAllParticipants,
  getAllManagers,
  isAdminToken,
} from "@/lib/participant-db";
import { computeParticipantStats } from "@/lib/stats";
import { getTodayJST } from "@/lib/date-utils";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Check admin authorization from Notion DB (管理者権限 checkbox)
  const authorized = await isAdminToken(token);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const participantMocks = await getAllParticipants();
  const managers = await getAllManagers();
  const todayJST = getTodayJST();
  const useMock = !process.env.NOTION_API_TOKEN;

  // Fetch Notion data for each participant in parallel
  const enrichedParticipants = await Promise.all(
    participantMocks.map(async (p) => {
      if (useMock) {
        const logs = p.logs || [];
        const hasLogToday = logs.some((l) => l.date === todayJST && l.morningIntent);
        return {
          id: p.id,
          name: p.name,
          department: p.department,
          dojoPhase: p.dojoPhase,
          entryDays: logs.filter((l) => l.morningIntent).length,
          entryRate: p.entryRate || 0,
          streak: p.streak || 0,
          fbCount: p.fbCount || 0,
          managerId: p.managerId,
          fbPolicy: p.fbPolicy || "",
          todayHasLog: hasLogToday,
          latestLog: logs[0]
            ? {
                date: logs[0].date,
                morningIntent: logs[0].morningIntent,
                status: logs[0].status,
                energy: logs[0].energy,
              }
            : null,
          recentEnergy: logs.slice(0, 7).map((l) => l.energy),
        };
      }

      // Notion mode
      try {
        const logs = await getLogsByParticipant(p.name);
        const stats = computeParticipantStats(logs, todayJST);
        const latestLog = logs[0] || null;

        const hasLogToday = logs.some((l) => l.date === todayJST && l.morningIntent);
        return {
          id: p.id,
          name: p.name,
          department: p.department,
          dojoPhase: p.dojoPhase,
          entryDays: stats.entryDays,
          entryRate: stats.entryRate,
          streak: stats.streak,
          fbCount: stats.fbCount,
          managerId: p.managerId,
          fbPolicy: p.fbPolicy || "",
          todayHasLog: hasLogToday,
          latestLog: latestLog
            ? {
                date: latestLog.date,
                morningIntent: latestLog.morningIntent,
                status: latestLog.status,
                energy: latestLog.energy,
              }
            : null,
          recentEnergy: logs.slice(0, 7).map((l) => l.energy),
        };
      } catch (error) {
        console.error(`Error fetching data for ${p.name}:`, error);
        return {
          id: p.id,
          name: p.name,
          department: p.department,
          dojoPhase: p.dojoPhase,
          entryDays: 0,
          entryRate: 0,
          streak: 0,
          fbCount: 0,
          managerId: p.managerId,
          fbPolicy: p.fbPolicy || "",
          todayHasLog: false,
          latestLog: null,
          recentEnergy: [],
        };
      }
    })
  );

  // Manager data (from registry - no Notion DB for managers)
  const managerData = managers.map((m) => ({
    id: m.id,
    name: m.name,
    department: m.department,
    participantIds: m.participantIds,
    participantNames: m.participantIds
      .map((pid) => {
        const p = enrichedParticipants.find((ep) => ep.id === pid);
        return p?.name || pid;
      })
      .filter(Boolean),
  }));

  return NextResponse.json({
    participants: enrichedParticipants,
    managers: managerData,
  });
}
