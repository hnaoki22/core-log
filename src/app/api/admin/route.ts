// GET /api/admin?token=xxx
// Returns all participants + managers with enriched Notion data

import { NextRequest, NextResponse } from "next/server";
import { getLogsByParticipant } from "@/lib/supabase";
import {
  getAllParticipants,
  getAllManagers,
  getManagerByToken,
} from "@/lib/participant-db";
import { computeParticipantStats } from "@/lib/stats";
import { getTodayJST, calculateWeekNum } from "@/lib/date-utils";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Check admin or observer authorization
  const manager = await getManagerByToken(token);
  const isAdminOrObserver = manager && (manager.role === "admin" || manager.role === "observer" || manager.isAdmin);
  if (!isAdminOrObserver) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const viewerRole = manager.role;

  const participantMocks = await getAllParticipants();
  const managers = await getAllManagers();
  const todayJST = getTodayJST();

  // Fetch Supabase data for each participant in parallel
  const enrichedParticipants = await Promise.all(
    participantMocks.map(async (p) => {
      // Supabase mode
      try {
        const logs = await getLogsByParticipant(p.name, "81f91c26-214e-4da2-9893-6ac6c8984062");
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
          weekNum: calculateWeekNum(p.startDate || ""),
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
          weekNum: calculateWeekNum(p.startDate || ""),
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
    viewerRole,
  });
}
