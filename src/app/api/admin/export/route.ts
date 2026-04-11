// GET /api/admin/export?token=xxx
// Exports all participants and their logs as CSV

import { NextRequest, NextResponse } from "next/server";
import { isAdminOrObserverToken, getAllParticipants } from "@/lib/participant-db";
import { getLogsByParticipant } from "@/lib/notion";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  const authorized = await isAdminOrObserverToken(token);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    // Get all participants
    const participants = await getAllParticipants();

    // Collect all logs for all participants
    const csvRows: string[] = [];
    const useMock = !process.env.NOTION_API_TOKEN;

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
      let logs;

      if (useMock) {
        // Mock mode: use participant.logs
        logs = participant.logs || [];
      } else {
        // Notion mode: fetch from API
        logs = await getLogsByParticipant(participant.name);
      }

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
