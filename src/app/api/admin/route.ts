// GET /api/admin?token=xxx
// Returns all participants + managers with enriched Notion data

import { NextRequest, NextResponse } from "next/server";
import { getLogsByParticipant } from "@/lib/notion";
import {
  getAllParticipants,
  getAllManagers,
} from "@/lib/mock-data";
import { computeParticipantStats } from "@/lib/stats";
import { getTodayJST } from "@/lib/date-utils";

const ADMIN_TOKENS = ["munetomo-admin", "UE8m8SSJAgRBwsSZ"];

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token || !ADMIN_TOKENS.includes(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const participantMocks = getAllParticipants();
  const managers = getAllManagers();
  const todayJST = getTodayJST();
  const useMock = !process.env.NOTION_API_TOKEN;

  // Fetch Notion data for each participant in parallel
  const enrichedParticipants = await Promise.all(
    participantMocks.map(async (p) => {
      if (useMock) {
        return {
          id: p.id,
          name: p.name,
          department: p.department,
          dojoPhase: p.dojoPhase,
          entryDays: p.logs.filter((l) => l.morningIntent).length,
          entryRate: p.entryRate,
          streak: p.streak,
          fbCount: p.fbCount,
          managerId: p.managerId,
          latestLog: p.logs[0]
            ? {
                date: p.logs[0].date,
                morningIntent: p.logs[0].morningIntent,
                status: p.logs[0].status,
                energy: p.logs[0].energy,
              }
            : null,
          recentEnergy: p.logs.slice(0, 7).map((l) => l.energy),
        };
      }

      // Notion mode
      try {
        const logs = await getLogsByParticipant(p.name);
        const stats = computeParticipantStats(logs, todayJST);
        const latestLog = logs[0] || null;

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
