// POST /api/mission - Create a new mission (manager action)
// PATCH /api/mission - Update mission status (manager action)
// GET /api/mission?participantName=xxx - Get missions for participant

import { NextRequest, NextResponse } from "next/server";
import {
  createMission,
  updateMissionStatus,
  getMissionsByParticipant,
} from "@/lib/supabase";
import { getManagerByToken, getParticipantByToken, getParticipantByName } from "@/lib/participant-db";
import { getTodayJST } from "@/lib/date-utils";
import { sendNotificationEmail } from "@/lib/email";
import { sanitizeInput } from "@/lib/sanitize";

export async function GET(request: NextRequest) {
  const participantName = request.nextUrl.searchParams.get("participantName");

  if (!participantName) {
    return NextResponse.json({ error: "participantName required" }, { status: 400 });
  }

  try {
    const tenantId = "81f91c26-214e-4da2-9893-6ac6c8984062";
    const missions = await getMissionsByParticipant(participantName, tenantId);
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

    // Sanitize user input
    const sanitizedTitle = sanitizeInput(title);
    const sanitizedPurpose = sanitizeInput(purpose || "");

    // Verify manager or participant token
    const manager = await getManagerByToken(token);
    const participant = !manager ? await getParticipantByToken(token) : null;
    if (!manager && !participant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // If participant creates their own mission, use their name
    const effectiveName = participant ? participant.name : participantName;
    if (!effectiveName) {
      return NextResponse.json({ error: "participantName required" }, { status: 400 });
    }

    const tenantId = participant?.tenantId || manager?.tenantId || "81f91c26-214e-4da2-9893-6ac6c8984062";
    const targetParticipantObj = participant || await getParticipantByName(effectiveName, tenantId);
    const participantId = targetParticipantObj?.id || "";

    const setDate = getTodayJST();
    const createdBy = manager ? "上司設定" : "自己設定";
    const missionId = await createMission(
      effectiveName,
      sanitizedTitle,
      sanitizedPurpose,
      deadline || "",
      setDate,
      createdBy as "上司設定" | "自己設定",
      tenantId,
      participantId
    );

    if (!missionId) {
      return NextResponse.json({ error: "Failed to create mission" }, { status: 500 });
    }

    // Notify about new mission (non-blocking)
    try {
      if (manager) {
        // Manager created → notify participant
        const targetParticipant = await getParticipantByName(effectiveName);
        if (targetParticipant?.email && !targetParticipant.email.includes("example.com")) {
          sendNotificationEmail({
            to: targetParticipant.email,
            recipientName: targetParticipant.name.split(" ")[0],
            senderName: manager.name,
            token: targetParticipant.token,
            type: "mission_created",
            detail: sanitizedTitle,
          }).catch(console.error);
        }
      }
      // Participant created → no notification needed for now
    } catch (notifyError) {
      console.error("Mission notification error (non-critical):", notifyError);
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

    // Verify manager or participant token
    const manager = await getManagerByToken(token);
    const participant = !manager ? await getParticipantByToken(token) : null;
    if (!manager && !participant) {
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
