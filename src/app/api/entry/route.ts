// POST /api/entry
// Create morning entry or update with evening data
// Prevents duplicate entries for the same day

import { NextRequest, NextResponse } from "next/server";
import { createMorningEntry, updateEveningEntry, hasLoggedToday } from "@/lib/notion";
import { getParticipantByToken, getManagerById } from "@/lib/participant-db";
import { sendNotificationEmail } from "@/lib/email";
import { isProgramEnded, isProgramNotStarted } from "@/lib/date-utils";

export async function POST(request: NextRequest) {
  const useMock = !process.env.NOTION_API_TOKEN;

  try {
    const body = await request.json();
    const { type, token } = body;

    if (!token || !type) {
      return NextResponse.json({ error: "Token and type required" }, { status: 400 });
    }

    // Mock mode: just return success
    if (useMock) {
      return NextResponse.json({
        success: true,
        message: type === "morning" ? "朝の記入を保存しました" : "夕方の記入を保存しました",
        mock: true,
      });
    }

    // Check if participant's program is still active
    const participant = await getParticipantByToken(token);
    if (participant) {
      if (participant.endDate && isProgramEnded(participant.endDate)) {
        return NextResponse.json({
          error: "プログラムは終了しています。日報の入力はできません。",
          programEnded: true,
        }, { status: 403 });
      }
      if (participant.startDate && isProgramNotStarted(participant.startDate)) {
        return NextResponse.json({
          error: "プログラムはまだ開始されていません。",
          notStarted: true,
        }, { status: 403 });
      }
    }

    // Real Notion API
    if (type === "morning") {
      const { participantName, date, morningIntent, energy, dojoPhase, weekNum } = body;

      // Check if entry already exists for today
      const todayStatus = await hasLoggedToday(participantName, date);
      if (todayStatus.hasMorning) {
        return NextResponse.json(
          { error: "今日の朝の記入は既に完了しています" },
          { status: 409 }
        );
      }

      const pageId = await createMorningEntry(participantName, date, morningIntent, energy, dojoPhase, weekNum);
      if (!pageId) {
        return NextResponse.json({ error: "Failed to create entry" }, { status: 500 });
      }

      // Notify manager that subordinate submitted morning log
      try {
        const participant = await getParticipantByToken(token);
        if (participant?.managerId) {
          const mgr = await getManagerById(participant.managerId);
          if (mgr?.email && !mgr.email.includes("example.com")) {
            sendNotificationEmail({
              to: mgr.email,
              recipientName: mgr.name.split(" ")[0],
              senderName: participantName,
              token: mgr.token,
              type: "daily_log_submitted",
              detail: `朝の意図：${morningIntent.substring(0, 60)}${morningIntent.length > 60 ? "…" : ""}`,
            });
          }
        }
      } catch (e) {
        console.error("Failed to send manager notification:", e);
      }

      return NextResponse.json({ success: true, pageId });
    }

    if (type === "evening") {
      const { pageId, eveningInsight, energy, participantName } = body;
      if (!pageId) {
        return NextResponse.json({ error: "pageId is required for evening entry" }, { status: 400 });
      }
      const success = await updateEveningEntry(pageId, eveningInsight, energy);
      if (!success) {
        return NextResponse.json({ error: "Failed to update entry" }, { status: 500 });
      }

      // Notify manager that subordinate submitted evening log
      try {
        const participant = await getParticipantByToken(token);
        if (participant?.managerId) {
          const mgr = await getManagerById(participant.managerId);
          if (mgr?.email && !mgr.email.includes("example.com")) {
            sendNotificationEmail({
              to: mgr.email,
              recipientName: mgr.name.split(" ")[0],
              senderName: participantName || participant.name,
              token: mgr.token,
              type: "daily_log_submitted",
              detail: `夕の気づき：${eveningInsight.substring(0, 60)}${eveningInsight.length > 60 ? "…" : ""}`,
            });
          }
        }
      } catch (e) {
        console.error("Failed to send manager notification:", e);
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (error) {
    console.error("Entry API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
