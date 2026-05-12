// Server Component for /m/[token] (manager home).
//
// Fetches the manager's participants + their stats directly via Supabase
// (region-local) so the dashboard renders with data in the initial HTML.
// Previously /api/manager was called from useEffect, showing a "読み込み中..."
// spinner for the duration.

import { notFound } from "next/navigation";
import { getAllLogsForTenant, getFeedbackCountsByTenant } from "@/lib/supabase";
import {
  getManagerByToken,
  getParticipantsForManager,
} from "@/lib/participant-db";
import { computeParticipantStats } from "@/lib/stats";
import { getTodayJST } from "@/lib/date-utils";
import { resolveManagerTenantStrict } from "@/lib/tenant-context";
import ManagerHomeClient, { type ManagerHomeInitialData } from "./ManagerHomeClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ManagerHomePageServer({
  params,
}: {
  params: { token: string };
}) {
  const t0 = Date.now();
  const token = params.token;
  const manager = await getManagerByToken(token);
  if (!manager) {
    notFound();
  }

  const tenantResult = resolveManagerTenantStrict(manager);
  if (!tenantResult.ok) {
    notFound();
  }
  const tenantId = tenantResult.tenantId;
  const tManager = Date.now();

  // Fetch participants + all logs + feedback counts in parallel
  const [participantMocks, allLogsMap, feedbackCounts] = await Promise.all([
    getParticipantsForManager(manager.id, tenantId),
    getAllLogsForTenant(tenantId),
    getFeedbackCountsByTenant(tenantId),
  ]);
  const tFetch = Date.now();
  const todayJST = getTodayJST();

  // Enrich participants from pre-fetched data (no extra queries).
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

  const initialData: ManagerHomeInitialData = {
    manager: {
      name: manager.name,
      department: manager.department,
      isAdmin: manager.isAdmin || false,
      role: manager.role || (manager.isAdmin ? "admin" : "manager"),
    },
    participants: enrichedParticipants,
  };

  console.log(
    `[perf] /m/[token] total=${Date.now() - t0}ms ` +
      `(manager=${tManager - t0}ms, fetch=${tFetch - tManager}ms, build=${Date.now() - tFetch}ms, participants=${enrichedParticipants.length})`,
  );

  return <ManagerHomeClient token={token} initialData={initialData} />;
}
