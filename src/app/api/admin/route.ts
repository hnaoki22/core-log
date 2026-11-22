// GET /api/admin?token=xxx
// Returns all participants + managers with enriched Supabase data

import { NextRequest, NextResponse } from "next/server";
import { getAllLogsForTenant, getTenantBySlug, getAllTenants, getFeedbackCountsByTenant } from "@/lib/supabase";
import {
  getAllParticipants,
  getAllManagers,
  getManagerByToken,
} from "@/lib/participant-db";
import { computeParticipantStats } from "@/lib/stats";
import { getTodayJST, calculateWeekNum } from "@/lib/date-utils";
import { resolveManagerTenantStrict } from "@/lib/tenant-context";
import { isStandaloneTenant } from "@/lib/standalone";
import { tokenForViewer } from "@/lib/admin-directory";
import { getCoachActivation } from "@/lib/coach-reply-store";
import { logger } from "@/lib/logger";

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
  // 参加者・マネージャーのトークン（ほかの人の画面を開ける値）は、管理者にだけ返す。
  // 閲覧者には返さない。閲覧者本人の行だけは返す（tokenForViewer の説明を参照）。
  const viewerIsAdmin = manager.isAdmin === true;

  // Determine which tenant to view
  // tenantSlug === null means "全テナント" (all tenants) was selected (admin only)
  // tenantSlug === "some-slug" means a specific tenant was selected (admin only)
  // Observer (non-admin): strict resolver — must have tenantId
  let tenantId: string | null;

  if (manager.isAdmin) {
    // Admin can view any tenant or all tenants
    if (tenantSlug) {
      const requestedTenant = await getTenantBySlug(tenantSlug);
      tenantId = requestedTenant ? requestedTenant.id : null;
    } else {
      // Admin selected "全テナント" — fetch across all tenants
      tenantId = null;
    }
  } else {
    // Observer — strict: must have tenantId, otherwise 403
    const tenantResult = resolveManagerTenantStrict(manager);
    if (!tenantResult.ok) {
      return NextResponse.json(tenantResult.errorBody, { status: tenantResult.status });
    }
    tenantId = tenantResult.tenantId;
  }

  // Fetch ALL data in parallel — 4 queries total instead of N+1
  // When tenantId is null, queries fetch from all tenants
  const [participantMocks, managers, allLogsMap, tenants, feedbackCounts] = await Promise.all([
    getAllParticipants(tenantId),
    getAllManagers(tenantId),
    getAllLogsForTenant(tenantId ?? undefined),
    manager.isAdmin ? getAllTenants() : Promise.resolve([]),
    getFeedbackCountsByTenant(tenantId ?? undefined),
  ]);
  const todayJST = getTodayJST();

  // standalone §7-1: 参加者ごとの所属テナント（rowTenantId）で standalone か
  // 判定し、該当者のログ本文・日次気分値を管理者ビューから取り除く。
  // テナント単位の判定はキャッシュして N 回の重複評価を避ける。
  const standaloneByTenant = new Map<string, boolean>();
  async function isRowStandalone(rowTenantId: string | undefined): Promise<boolean> {
    const tid = rowTenantId || (tenantId ?? "");
    if (!tid) return false;
    const hit = standaloneByTenant.get(tid);
    if (hit !== undefined) return hit;
    const v = await isStandaloneTenant(tid);
    standaloneByTenant.set(tid, v);
    return v;
  }

  // Enrich participants using pre-fetched log map (no additional queries)
  const enrichedParticipants = await Promise.all(participantMocks.map(async (p) => {
    try {
      const logs = allLogsMap.get(p.name) || [];
      const stats = computeParticipantStats(logs, todayJST);
      const latestLog = logs[0] || null;
      const rowStandalone = await isRowStandalone(p.rowTenantId);

      return {
        id: p.id,
        token: tokenForViewer(p.token, { isAdmin: viewerIsAdmin }),
        name: p.name,
        department: p.department,
        dojoPhase: p.dojoPhase,
        // New morning/evening separated stats
        completeDays: stats.completeDays,
        morningCount: stats.morningCount,
        eveningCount: stats.eveningCount,
        completionRate: stats.completionRate,
        todayStatus: stats.todayStatus,
        businessDaysElapsed: stats.businessDaysElapsed,
        // Legacy fields (kept for backward compat)
        entryDays: stats.entryDays,
        entryRate: stats.completionRate, // now uses completion rate
        streak: stats.streak,
        fbCount: feedbackCounts.get(p.name) || 0,
        managerId: p.managerId,
        fbPolicy: p.fbPolicy || "",
        weekNum: calculateWeekNum(p.startDate || ""),
        todayHasLog: stats.todayStatus !== "none",
        // standalone §7-1: ログ本文・日次気分値は管理者へ返さない（統計のみ可）
        latestLog: rowStandalone
          ? null
          : latestLog
            ? {
                date: latestLog.date,
                morningIntent: latestLog.morningIntent,
                eveningInsight: latestLog.eveningInsight,
                status: latestLog.status,
                energy: latestLog.energy,
              }
            : null,
        recentEnergy: rowStandalone ? [] : logs.slice(0, 7).map((l) => l.energy),
      };
    } catch (error) {
      console.error(`Error processing data for ${p.name}:`, error);
      return {
        id: p.id,
        token: tokenForViewer(p.token, { isAdmin: viewerIsAdmin }),
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
        managerId: p.managerId,
        fbPolicy: p.fbPolicy || "",
        weekNum: calculateWeekNum(p.startDate || ""),
        todayHasLog: false,
        latestLog: null,
        recentEnergy: [],
      };
    }
  }));

  // Build participant lookup map for manager name resolution
  const participantMap = new Map(enrichedParticipants.map((p) => [p.id, p]));

  // Manager data
  const managerData = managers.map((m) => ({
    id: m.id,
    token: tokenForViewer(m.token, { isAdmin: viewerIsAdmin, isSelf: m.id === manager.id }),
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

  // 「AIコーチの確認」のページ（/a/[token]/coach）への入口を出すか。
  // 環境が 1 つに決まっていて、その環境で AIコーチの返信が動いているとき（スイッチが ON、商品モードでない、
  // 環境の設定がある。getCoachActivation）だけ true。動いていない環境の管理画面は、これまでと変わらない。
  // 画面の入口の出し分けにだけ使う（読めるかどうかは /api/admin/coach-replies が決める）。
  // 読めなかったときは false（入口を出さない）。失敗は記録する。
  let coachReplyEnabled = false;
  if (tenantId) {
    try {
      const activation = await getCoachActivation(tenantId);
      coachReplyEnabled = activation.ok && activation.active;
    } catch (error) {
      logger.error("admin: coach reply activation read failed", { tenantId, error: String(error) });
    }
  }

  return NextResponse.json({
    participants: enrichedParticipants,
    managers: managerData,
    // AIコーチの確認のページへの入口を出すか（上の説明を参照）。
    coachReplyEnabled,
    viewerRole,
    // 管理者（is_admin）か。画面は、管理者にだけ出す欄（環境とユーザー）の出し分けにこれを使う。
    // role の文字列ではなく、サーバーの権限の判定（is_admin）と同じ値で決めるため。
    viewerIsAdmin,
    tenantId: tenantId || "all",
    tenants: tenants.map((t) => ({ id: t.id, name: t.name, slug: t.slug, companyName: t.companyName })),
  });
}
