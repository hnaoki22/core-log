// GET /api/manager?token=xxx
// Returns manager info + enriched participant data

import { NextRequest, NextResponse } from "next/server";
import { getAllLogsForTenant, DEFAULT_TENANT_ID } from "@/lib/supabase";
import {
  getManagerByToken,
  getParticipantsForManager,
} from "@/lib/participant-db";
import { computeParticipantStats, isLogSubmitted } from "@/lib/stats";
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

  const tenantId = manager.tenantId || DEFAULT_TENANT_ID;

  // Fetch participants and ALL logs in parallel (2 queries instead of N+1)
  const [participantMocks, allLogsMap] = await Promise.all([
    getParticipantsForManager(manager.id, tenantId),
    getAllLogsForTenant(tenantId),
  ]);
  const todayJST = getTodayJST();

  // Enrich participants using pre-fetched log map (no additional queries)
  const enrichedParticipants = participantMocks.map((p) => {
    try {
      const logs = allLogsMap.get(p.name) || [];
      const stats = computeParticipantStats(logs, todayJST);
      const latestLog = logs[0] || null;
      const hasLogToday = logs.some((l) => l.date === todayJST && isLogSubmitted(l));

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
      console.error(`Error processing data for ${p.name}:`, error);
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
  });

  return NextResponse.json({
    manager: {
      name: manager.name,
      department: manager.department,
      isAdmin: manager.isAdmin || false,
      role: manager.role || (manager.isAdmin ? "admin" : "manager"),
    },
    participants: enrichedParticipants,
  });
}
