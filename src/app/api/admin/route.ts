// GET /api/admin?token=xxx
// Returns all participants + managers with enriched Supabase data

import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_TENANT_ID, getAllLogsForTenant, getTenantBySlug, getAllTenants } from "@/lib/supabase";
import {
  getAllParticipants,
  getAllManagers,
  getManagerByToken,
} from "@/lib/participant-db";
import { computeParticipantStats } from "@/lib/stats";
import { getTodayJST, calculateWeekNum } from "@/lib/date-utils";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const tenantSlug = request.nextUrl.searchParams.get("tenant");

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

  // Determine which tenant to view
  console.log("[ADMIN DEBUG] manager.tenantId:", manager.tenantId, "manager.name:", manager.name, "manager.isAdmin:", manager.isAdmin);
  let tenantId = manager.tenantId || DEFAULT_TENANT_ID;
  if (tenantSlug && manager.isAdmin) {
    const requestedTenant = await getTenantBySlug(tenantSlug);
    if (requestedTenant) {
      tenantId = requestedTenant.id;
    }
  }

  // Fetch ALL data in parallel — 4 queries total instead of N+1
  const [participantMocks, managers, allLogsMap, tenants] = await Promise.all([
    getAllParticipants(tenantId),
    getAllManagers(tenantId),
    getAllLogsForTenant(tenantId),
    manager.isAdmin ? getAllTenants() : Promise.resolve([]),
  ]);
  const todayJST = getTodayJST();

  // Enrich participants using pre-fetched log map (no additional queries)
  const enrichedParticipants = participantMocks.map((p) => {
    try {
      const logs = allLogsMap.get(p.name) || [];
      const stats = computeParticipantStats(logs, todayJST);
      const latestLog = logs[0] || null;
      const hasLogToday = logs.some((l) => l.date === todayJST && l.morningIntent);

      return {
        id: p.id,
        token: p.token,
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
      console.error(`Error processing data for ${p.name}:`, error);
      return {
        id: p.id,
        token: p.token,
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
  });

  // Build participant lookup map for manager name resolution
  const participantMap = new Map(enrichedParticipants.map((p) => [p.id, p]));

  // Manager data
  const managerData = managers.map((m) => ({
    id: m.id,
    token: m.token,
    name: m.name,
    email: m.email || "",
    department: m.department,
    isAdmin: m.isAdmin || false,
    role: (m as unknown as { role?: string }).role || (m.isAdmin ? "admin" : "manager"),
    participantIds: m.participantIds,
    participantNames: m.participantIds
      .map((pid) => participantMap.get(pid)?.name || pid)
      .filter(Boolean),
  }));

  return NextResponse.json({
    participants: enrichedParticipants,
    managers: managerData,
    viewerRole,
    tenantId,
    tenants: tenants.map((t) => ({ id: t.id, name: t.name, slug: t.slug, companyName: t.companyName })),
  });
}
