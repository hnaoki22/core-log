// GET /api/mission/comments?missionId=xxx - Get comments for a mission
// POST /api/mission/comments - Add a comment to a mission

import { NextRequest, NextResponse } from "next/server";
import { addMissionComment, getMissionComments, getMissionById, updateMissionComment, deleteMissionComment } from "@/lib/supabase";
import { getManagerByToken, getParticipantByToken, getParticipantByName, getManagerById } from "@/lib/participant-db";
import { sendNotificationEmail } from "@/lib/email";

export async function GET(request: NextRequest) {
  const missionId = request.nextUrl.searchParams.get("missionId");
  const token = request.nextUrl.searchParams.get("token");

  if (!missionId) {
    return NextResponse.json({ error: "missionId required" }, { status: 400 });
  }
  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 401 });
  }

  try {
    const manager = await getManagerByToken(token);
    const participant = !manager ? await getParticipantByToken(token) : null;
    const tenantId = manager?.tenantId || participant?.tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Verify mission belongs to caller's tenant (and to the participant if
    // the caller is one) before exposing its comments.
    const mission = await getMissionById(missionId);
    if (!mission || mission.tenantId !== tenantId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (participant && mission.participantName !== participant.name) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
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
    const tenantId = manager?.tenantId || participant?.tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: "Tenant unresolved" }, { status: 500 });
    }

    // Verify the mission belongs to caller's tenant; for participant authors
    // also enforce that they own the mission they are commenting on.
    const targetMission = await getMissionById(missionId);
    if (!targetMission || targetMission.tenantId !== tenantId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (participant && targetMission.participantName !== participant.name) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const authorName = manager?.name || participant?.name || "";
    const authorRole: "manager" | "participant" = manager ? "manager" : "participant";

    const success = await addMissionComment(missionId, authorName, authorRole, comment, tenantId);

    if (!success) {
      return NextResponse.json({ error: "Failed to add comment" }, { status: 500 });
    }

    // Send notification email to the other party (non-blocking)
    try {
      if (manager) {
        // Manager commented — notify participant
        if (targetMission) {
          const targetParticipant = await getParticipantByName(targetMission.participantName, tenantId);
          if (targetParticipant?.email && !targetParticipant.email.includes("example.com")) {
            await sendNotificationEmail({
              to: targetParticipant.email,
              recipientName: targetParticipant.name.split(" ")[0],
              senderName: manager.name,
              token: targetParticipant.token,
              type: "mission_comment",
              detail: comment.length > 100 ? comment.substring(0, 100) + "..." : comment,
            });
          }
        }
      } else if (participant) {
        // Participant commented â notify their manager
        const mgr = participant.managerId ? await getManagerById(participant.managerId) : null;
        if (mgr?.email && !mgr.email.includes("example.com")) {
          await sendNotificationEmail({
            to: mgr.email,
            recipientName: mgr.name.split(" ")[0],
            senderName: participant.name,
            token: mgr.token,
            type: "mission_comment",
            detail: comment.length > 100 ? comment.substring(0, 100) + "..." : comment,
          });
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

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, commentId, body: newBody } = body;

    if (!token || !commentId || !newBody) {
      return NextResponse.json(
        { error: "token, commentId, body required" },
        { status: 400 }
      );
    }

    // Verify manager or participant token
    const manager = await getManagerByToken(token);
    const participant = !manager ? await getParticipantByToken(token) : null;
    if (!manager && !participant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    const tenantId = manager?.tenantId || participant?.tenantId;
    const authorName = manager?.name || participant?.name;
    if (!tenantId || !authorName) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // updateMissionComment enforces tenant scope and that the caller is the
    // original author. Returns false on any mismatch (treated as 403).
    const success = await updateMissionComment(commentId, newBody.trim(), tenantId, authorName);
    if (!success) {
      return NextResponse.json({ error: "Forbidden or not found" }, { status: 403 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Mission comment PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, commentId } = body;

    if (!token || !commentId) {
      return NextResponse.json(
        { error: "token, commentId required" },
        { status: 400 }
      );
    }

    // Verify manager or participant token
    const manager = await getManagerByToken(token);
    const participant = !manager ? await getParticipantByToken(token) : null;
    if (!manager && !participant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    const tenantId = manager?.tenantId || participant?.tenantId;
    const authorName = manager?.name || participant?.name;
    if (!tenantId || !authorName) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const success = await deleteMissionComment(commentId, tenantId, authorName);
    if (!success) {
      return NextResponse.json({ error: "Forbidden or not found" }, { status: 403 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Mission comment DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
