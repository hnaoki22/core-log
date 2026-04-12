// GET /api/admin/export?token=xxx
// Exports all participants and their logs as CSV

import { NextRequest, NextResponse } from "next/server";
import { getAllParticipants, getManagerByToken } from "@/lib/participant-db";
import { DEFAULT_TENANT_ID, getLogsByParticipant } from "@/lib/supabase";

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
    const tenantId = manager.tenantId || DEFAULT_TENANT_ID;
    // Get all participants
    const participants = await getAllParticipants(tenantId);

    // Collect all logs for all participants
    const csvRows: string[] = [];

    // CSV Header
    const headers = [
      "日付",
      "曜日",
      "参加者名",
      "部署",
      "朝の意図",
      "夕方の気づき",
      "エネルギー",
      "ステータス",
      "HMフィードバック",
      "上司コメント",
    ];
    csvRows.push(headers.join(","));

    // Fetch logs for each participant
    for (const participant of participants) {
      // Supabase mode: fetch from API
      const logs = await getLogsByParticipant(participant.name, tenantId);

      // Convert logs to CSV rows
      for (const log of logs) {
        // Calculate day of week if not provided
        let dayOfWeek = log.dayOfWeek || "";
        if (!dayOfWeek && log.date) {
          const d = new Date(log.date + "T00:00:00");
          const days = ["日", "月", "火", "水", "木", "金", "土"];
          dayOfWeek = days[d.getDay()] || "";
        }

        const energy = log.energy || "";
        const status = log.status || "";
        const hmFeedback = ((log as Record<string, unknown>).hmFeedback as string || "").replace(/"/g, '""');
        const managerComment = ((log as Record<string, unknown>).managerComment as string || "").replace(/"/g, '""');
        const morningIntent = (log.morningIntent || "").replace(/"/g, '""');
        const eveningInsight = (log.eveningInsight || "").replace(/"/g, '""');

        const row = [
          log.date,
          dayOfWeek,
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

    // Return as CSV file
    const response = new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=core-log-export.csv",
      },
    });

    return response;
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
