// GET /api/admin/export?token=xxx&tenant=<slug>
// Exports all participants and their logs as CSV.
// - No ?tenant= and admin: exports across ALL tenants.
// - With ?tenant=<slug> and admin: exports that specific tenant.
// - Non-admin observer: locked to own tenant.

import { NextRequest, NextResponse } from "next/server";
import { getAllParticipants, getManagerByToken } from "@/lib/participant-db";
import { getAllLogsForTenant } from "@/lib/supabase";
import { getDayOfWeekJPShort } from "@/lib/date-utils";
import { resolveAdminTenantContext } from "@/lib/tenant-context";
import { standaloneGuard, isStandaloneTenant } from "@/lib/standalone";

/**
 * Make a single CSV cell safe for Excel/Sheets/Numbers.
 *  - Defends against formula injection (CWE-1236): any cell starting with
 *    `=`, `+`, `-`, `@`, `\t`, or `\r` is treated as a formula by Excel and
 *    can fire HYPERLINK/cmd|/etc. We prefix with `'` to neutralize.
 *  - Doubles embedded quotes per RFC 4180.
 *  - Wraps in quotes so commas/newlines are tolerated.
 */
function csvCell(value: unknown): string {
  let s = value == null ? "" : String(value);
  if (s.length > 0 && /^[=+\-@\t\r]/.test(s)) {
    s = "'" + s;
  }
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  const manager = await getManagerByToken(token);
  if (!manager || (!manager.isAdmin && manager.role !== "observer")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const ctx = await resolveAdminTenantContext(request, manager);

    // standalone §7-1: ログ本文を含む CSV export は standalone テナントでは拒否。
    // 単一テナント指定の場合は 403、全テナント export の場合は standalone
    // テナント所属の参加者行を除外する。
    if (ctx.tenantId) {
      const blocked = await standaloneGuard(ctx.tenantId, "csv-export");
      if (blocked) return blocked;
    }

    // Batch-fetch participants and all their logs in 2 queries (not N+1)
    // When ctx.tenantId is null, both fetch across every tenant.
    const [participantsAll, logsByName] = await Promise.all([
      getAllParticipants(ctx.tenantId),
      getAllLogsForTenant(ctx.tenantId ?? undefined),
    ]);

    // 全テナント export: standalone テナントの参加者を除外（本文を一切出さない）
    const standaloneCache = new Map<string, boolean>();
    const participants = [] as typeof participantsAll;
    for (const p of participantsAll) {
      const tid = p.rowTenantId;
      if (tid) {
        let v = standaloneCache.get(tid);
        if (v === undefined) {
          v = await isStandaloneTenant(tid);
          standaloneCache.set(tid, v);
        }
        if (v) continue;
      }
      participants.push(p);
    }

    const csvRows: string[] = [];

    // CSV Header — add テナント column only when cross-tenant, to keep single-tenant exports stable
    const headers = [
      "日付",
      "曜日",
      ...(ctx.isAllTenants ? ["テナント"] : []),
      "参加者名",
      "部署",
      "朝の意図",
      "本日の振り返り",
      "エネルギー",
      "ステータス",
      "HMフィードバック",
      "上司コメント",
    ];
    csvRows.push(headers.map(csvCell).join(","));

    for (const participant of participants) {
      const logs = logsByName.get(participant.name) || [];

      for (const log of logs) {
        let dayOfWeek = log.dayOfWeek || "";
        if (!dayOfWeek && log.date) {
          const d = new Date(log.date + "T00:00:00Z");
          dayOfWeek = getDayOfWeekJPShort(d);
        }

        const hmFeedback = (log as Record<string, unknown>).hmFeedback as string | undefined;
        const managerComment = (log as Record<string, unknown>).managerComment as string | undefined;

        const row = [
          csvCell(log.date),
          csvCell(dayOfWeek),
          ...(ctx.isAllTenants ? [csvCell(participant.tenantId || "")] : []),
          csvCell(participant.name),
          csvCell(participant.department),
          csvCell(log.morningIntent),
          csvCell(log.eveningInsight),
          csvCell(log.energy),
          csvCell(log.status),
          csvCell(hmFeedback),
          csvCell(managerComment),
        ];
        csvRows.push(row.join(","));
      }
    }

    // Add BOM for Excel compatibility (UTF-8 BOM)
    const bom = "\uFEFF";
    const csvContent = bom + csvRows.join("\n");

    const filenameSuffix = ctx.isAllTenants
      ? "all-tenants"
      : ctx.requestedSlug || "tenant";

    const response = new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=core-log-export-${filenameSuffix}.csv`,
      },
    });

    return response;
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
