// POST /api/entry
// Create morning entry or update with evening data
// Prevents duplicate entries for the same day

import { NextRequest, NextResponse } from "next/server";
import { createMorningEntry, updateEveningEntry, hasLoggedToday } from "@/lib/notion";

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
      return NextResponse.json({ success: true, pageId });
    }

    if (type === "evening") {
      const { pageId, eveningInsight, energy } = body;
      if (!pageId) {
        return NextResponse.json({ error: "pageId is required for evening entry" }, { status: 400 });
      }
      const success = await updateEveningEntry(pageId, eveningInsight, energy);
      if (!success) {
        return NextResponse.json({ error: "Failed to update entry" }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (error) {
    console.error("Entry API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
