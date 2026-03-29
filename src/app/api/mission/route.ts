// POST /api/mission - Create a new mission (manager action)
// PATCH /api/mission - Update mission status (manager action)
// GET /api/mission?participantName=xxx - Get missions for participant

import { NextRequest, NextResponse } from "next/server";
import {
  createMission,
  updateMissionStatus,
  getMissionsByParticipant,
} from "@/lib/notion";
import { getManagerByToken } from "@/lib/mock-data";
import { getTodayJST } from "@/lib/date-utils";

export async function GET(request: NextRequest) {
  const participantName = request.nextUrl.searchParams.get("participantName");

  if (!participantName) {
    return NextResponse.json({ error: "participantName required" }, { status: 400 });
  }

  try {
    const missions = await getMissionsByParticipant(participantName);
    return NextResponse.json({ missions });
  } catch (error) {
    console.error("Mission GET error:", error);
    return NextResponse.json({ error: "Failed to fetch missions" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, participantName, title, purpose, deadline } = body;

    if (!token || !participantName || !title) {
      return NextResponse.json(
        { error: "token, participantName, title required" },
        { status: 400 }
      );
    }

    // Verify manager token
    const manager = getManagerByToken(token);
    if (!manager) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const setDate = getTodayJST();
    const missionId = await createMission(
      participantName,
      title,
      purpose || "",
      deadline || "",
      setDate
    );

    if (!missionId) {
      return NextResponse.json({ error: "Failed to create mission" }, { status: 500 });
    }

    return NextResponse.json({ success: true, missionId });
  } catch (error) {
    console.error("Mission POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, missionId, status, finalReview } = body;

    if (!token || !missionId || !status) {
      return NextResponse.json(
        { error: "token, missionId, status required" },
        { status: 400 }
      );
    }

    // Verify manager token
    const manager = getManagerByToken(token);
    if (!manager) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const success = await updateMissionStatus(missionId, status, finalReview);

    if (!success) {
      return NextResponse.json({ error: "Failed to update mission" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Mission PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
