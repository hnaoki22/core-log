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

    // Batch-fetch participants and all their logs in 2 queries (not N+1)
    // When ctx.tenantId is null, both fetch across every tenant.
    const [participants, logsByName] = await Promise.all([
      getAllParticipants(ctx.tenantId),
      getAllLogsForTenant(ctx.tenantId ?? undefined),
    ]);

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
    csvRows.push(headers.join(","));

    for (const participant of participants) {
      const logs = logsByName.get(participant.name) || [];

      for (const log of logs) {
        let dayOfWeek = log.dayOfWeek || "";
        if (!dayOfWeek && log.date) {
          const d = new Date(log.date + "T00:00:00Z");
          dayOfWeek = getDayOfWeekJPShort(d);
        }

        const energy = log.energy || "";
        const status = log.status || "";
        const hmFeedback = ((log as Record<string, unknown>).hmFeedback as string || "").replace(/"/g, '""');
        const managerComment = ((log as Record<string, unknown>).managerComment as string || "").replace(/"/g, '""');
        const morningIntent = (log.morningIntent || "").replace(/"/g, '""');
        const eveningInsight = (log.eveningInsight || "").replace(/"/g, '""');
        const tenantLabel = (participant.tenantId || "").replace(/"/g, '""');

        const row = [
          log.date,
          dayOfWeek,
          ...(ctx.isAllTenants ? [`"${tenantLabel}"`] : []),
          participant.name,
          participant.department,
          `"${morningIntent}"`,
          `"${eveningInsight}"`,
          energy,
          status,
          `"${hmFeedback}"`,
          `"${managerComment}"`,
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
