// GET /api/mission/comments?missionId=xxx - Get comments for a mission
// POST /api/mission/comments - Add a comment to a mission

import { NextRequest, NextResponse } from "next/server";
import { addMissionComment, getMissionComments } from "@/lib/notion";
import { getManagerByToken, getParticipantByToken } from "@/lib/mock-data";

export async function GET(request: NextRequest) {
  const missionId = request.nextUrl.searchParams.get("missionId");

  if (!missionId) {
    return NextResponse.json({ error: "missionId required" }, { status: 400 });
  }

  try {
    const comments = await getMissionComments(missionId);
    return NextResponse.json({ comments });
  } catch (error) {
    console.error("Mission comments GET error:", error);
    return NextResponse.json({ error: "Failed to fetch comments" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, missionId, comment } = body;

    if (!token || !missionId || !comment) {
      return NextResponse.json(
        { error: "token, missionId, comment required" },
        { status: 400 }
      );
    }

    // Determine who is commenting: manager or participant
    const manager = getManagerByToken(token);
    const participant = getParticipantByToken(token);

    if (!manager && !participant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const authorName = manager?.name || participant?.name || "";
    const authorRole: "manager" | "participant" = manager ? "manager" : "participant";

    const success = await addMissionComment(missionId, authorName, authorRole, comment);

    if (!success) {
      return NextResponse.json({ error: "Failed to add comment" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Mission comment POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
