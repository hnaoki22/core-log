import { NextRequest, NextResponse } from "next/server";
import { isAdminToken } from "@/lib/participant-db";
import {
  createFeedback,
  getFeedbackByParticipant,
  markFeedbackAsRead,
  getUnreadFeedbackCount,
} from "@/lib/notion";
import { getParticipantByToken, getManagerByToken } from "@/lib/participant-db";
import { sendNotificationEmail } from "@/lib/email";

/**
 * GET /api/feedback?token=xxx
 * Get feedback for a participant (by participant token) or all feedback (by admin token)
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  const participantName = req.nextUrl.searchParams.get("participant") || "";

  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  // Check if participant token
  const participant = await getParticipantByToken(token);
  if (participant) {
    const feedback = await getFeedbackByParticipant(participant.name);
    const unreadCount = await getUnreadFeedbackCount(participant.name);
    return NextResponse.json({ feedback, unreadCount });
  }

  // Check if manager/admin token with participant name
  const manager = await getManagerByToken(token);
  if (manager && participantName) {
    const feedback = await getFeedbackByParticipant(participantName);
    return NextResponse.json({ feedback });
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * POST /api/feedback
 * Create a new feedback entry (admin only)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, participantName, content, period, weekNum, type } = body;

    if (!token || !participantName || !content) {
      return NextResponse.json(
        { error: "Token, participantName, and content are required" },
        { status: 400 }
      );
    }

    // Verify admin or manager
    const isAdmin = await isAdminToken(token);
    const manager = await getManagerByToken(token);

    if (!isAdmin && !manager) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const authorName = manager?.name || "Human Mature";
    const feedbackType = type || (isAdmin ? "HMフィードバック" : "上司コメント");

    const result = await createFeedback({
      participantName,
      authorName,
      type: feedbackType,
      content,
      period: period || "",
      weekNum: weekNum || 1,
    });

    if (!result) {
      return NextResponse.json({ error: "Failed to create feedback" }, { status: 500 });
    }

    // Send email notification to participant (non-blocking)
    try {
      // Search all participants to find the one with matching name
      const { getAllParticipantsFromNotion } = await import("@/lib/notion");
      const allParticipants = await getAllParticipantsFromNotion();
      const targetParticipant = allParticipants.find(p => p.name === participantName);

      if (targetParticipant?.email && !targetParticipant.email.includes("example.com") && targetParticipant.emailEnabled) {
        sendNotificationEmail({
          to: targetParticipant.email,
          recipientName: targetParticipant.name.split(" ")[0],
          senderName: authorName,
          token: targetParticipant.token,
          type: "hm_feedback",
          detail: content.length > 100 ? content.substring(0, 100) + "..." : content,
        }).catch(console.error);
      }
    } catch (notifyError) {
      console.error("Feedback notification error (non-critical):", notifyError);
    }

    return NextResponse.json({ success: true, id: result.id });
  } catch (error) {
    console.error("Feedback API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/feedback
 * Mark feedback as read
 */
export async function PATCH(req: NextRequest) {
  try {
    const { token, feedbackId } = await req.json();

    if (!token || !feedbackId) {
      return NextResponse.json({ error: "Token and feedbackId required" }, { status: 400 });
    }

    // Verify participant
    const participant = await getParticipantByToken(token);
    if (!participant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const success = await markFeedbackAsRead(feedbackId);
    return NextResponse.json({ success });
  } catch (error) {
    console.error("Feedback PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
