// POST /api/comment
// Add manager comment to a participant's record

import { NextRequest, NextResponse } from "next/server";
import { addManagerComment } from "A/lib/notion";

export async function POST(request: NextRequest) {
  const useMock = !process.env.NOTION_API_TOKEN;

  try {
    const body = await request.json();
    const { token, participantId, comment } = body;

    if (!token || !comment) {
      return NextResponse.json({ error: "Token and comment required" }, { status: 400 });
    }

    // Mock mode
    if (useMock) {
      return NextResponse.json({
        success: true,
        message: "コメントを保存しました",
        mock: true,
      });
    }

    // Real Notion API - in production, we'd find the latest log entry
    // for this participant and add the comment there
    if (participantId) {
      const success = await addManagerComment(participantId, comment);
      if (!success) {
        return NextResponse.json({ error: "Failed to save comment" }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Comment API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
