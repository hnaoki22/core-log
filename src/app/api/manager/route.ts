// GET /api/manager?token=xxx
// Returns manager info + enriched participant data

import { NextRequest, NextResponse } from "next/server";
import { getAllLogsForTenant, DEFAULT_TENANT_ID, getFeedbackCountsByTenant } from "@/lib/supabase";
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

  const tenantId = manager.tenantId || DEFAULT_TENANT_ID;

  // Fetch participants and ALL logs in parallel (2 queries instead of N+1)
  const [participantMocks, allLogsMap, feedbackCounts] = await Promise.all([
    getParticipantsForManager(manager.id, tenantId),
    getAllLogsForTenant(tenantId),
    getFeedbackCountsByTenant(tenantId),
  ]);
  const todayJST = getTodayJST();

  // Enrich participants using pre-fetched log map (no additional queries)
  const enrichedParticipants = participantMocks.map((p) => {
    try {
      const logs = allLogsMap.get(p.name) || [];
      const stats = computeParticipantStats(logs, todayJST);
      const latestLog = logs[0] || null;

      return {
        name: p.name,
        department: p.department,
        dojoPhase: p.dojoPhase,
        completeDays: stats.completeDays,
        morningCount: stats.morningCount,
        eveningCount: stats.eveningCount,
        completionRate: stats.completionRate,
        todayStatus: stats.todayStatus,
        businessDaysElapsed: stats.businessDaysElapsed,
        entryDays: stats.entryDays,
        entryRate: stats.completionRate,
        streak: stats.streak,
        fbCount: feedbackCounts.get(p.name) || 0,
        todayHasLog: stats.todayStatus !== "none",
        latestLog: latestLog
          ? {
              date: latestLog.date,
              morningIntent: latestLog.morningIntent,
            eveningInsight: latestLog.eveningInsight,
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
        completeDays: 0,
        morningCount: 0,
        eveningCount: 0,
        completionRate: 0,
        todayStatus: "none" as const,
        businessDaysElapsed: 0,
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
