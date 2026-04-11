// GET /api/mission/comments?missionId=xxx - Get comments for a mission
// POST /api/mission/comments - Add a comment to a mission

import { NextRequest, NextResponse } from "next/server";
import { addMissionComment, getMissionComments, getMissionById } from "@/lib/supabase";
import { getManagerByToken, getParticipantByToken, getParticipantByName, getManagerById } from "@/lib/participant-db";
import { sendNotificationEmail } from "@/lib/email";

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
    const manager = await getManagerByToken(token);
    const participant = await getParticipantByToken(token);

    if (!manager && !participant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const authorName = manager?.name || participant?.name || "";
    const authorRole: "manager" | "participant" = manager ? "manager" : "participant";

    const success = await addMissionComment(missionId, authorName, authorRole, comment);

    if (!success) {
      return NextResponse.json({ error: "Failed to add comment" }, { status: 500 });
    }

    // Send notification email to the other party (non-blocking)
    try {
      if (manager) {
        // Manager commented → notify participant
        const mission = await getMissionById(missionId);
        if (mission) {
          const targetParticipant = await getParticipantByName(mission.participantName);
          if (targetParticipant?.email && !targetParticipant.email.includes("example.com")) {
            sendNotificationEmail({
              to: targetParticipant.email,
              recipientName: targetParticipant.name.split(" ")[0],
              senderName: manager.name,
              token: targetParticipant.token,
              type: "mission_comment",
              detail: comment.length > 100 ? comment.substring(0, 100) + "..." : comment,
            }).catch(console.error); // fire-and-forget
          }
        }
      } else if (participant) {
        // Participant commented → notify their manager
        const mgr = participant.managerId ? await getManagerById(participant.managerId) : null;
        if (mgr?.email && !mgr.email.includes("example.com")) {
          sendNotificationEmail({
            to: mgr.email,
            recipientName: mgr.name.split(" ")[0],
            senderName: participant.name,
            token: mgr.token,
            type: "mission_comment",
            detail: comment.length > 100 ? comment.substring(0, 100) + "..." : comment,
          }).catch(console.error);
        }
      }
    } catch (notifyError) {
      console.error("Notification error (non-critical):", notifyError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Mission comment POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
