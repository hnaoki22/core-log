// POST /api/comment
// Add manager comment to a participant's record

import { NextRequest, NextResponse } from "next/server";
import { addManagerComment, getLogEntryOwner } from "@/lib/notion";
import { getManagerByToken, getParticipantByName } from "@/lib/participant-db";
import { sendNotificationEmail } from "@/lib/email";
import { sanitizeInput } from "@/lib/sanitize";

export async function POST(request: NextRequest) {
  const useMock = !process.env.NOTION_API_TOKEN;

  try {
    const body = await request.json();
    const { token, participantId, comment } = body;

    if (!token || !comment) {
      return NextResponse.json({ error: "Token and comment required" }, { status: 400 });
    }

    // Sanitize user input
    const sanitizedComment = sanitizeInput(comment);

    // Mock mode
    if (useMock) {
      return NextResponse.json({
        success: true,
        message: "コメントを保存しました",
        mock: true,
      });
    }

    // Real Notion API - add comment to the specific log entry
    if (participantId) {
      const success = await addManagerComment(participantId, sanitizedComment);
      if (!success) {
        return NextResponse.json({ error: "Failed to save comment" }, { status: 500 });
      }
    }

    // Notify the specific participant whose log was commented on (non-blocking)
    try {
      const manager = await getManagerByToken(token);
      if (manager && participantId) {
        // Look up which participant owns this log entry
        const ownerName = await getLogEntryOwner(participantId);
        if (ownerName) {
          const targetParticipant = await getParticipantByName(ownerName);
          if (targetParticipant?.email && !targetParticipant.email.includes("example.com")) {
            sendNotificationEmail({
              to: targetParticipant.email,
              recipientName: targetParticipant.name.split(" ")[0],
              senderName: manager.name,
              token: targetParticipant.token,
              type: "manager_comment",
              detail: sanitizedComment.length > 100 ? sanitizedComment.substring(0, 100) + "..." : sanitizedComment,
            }).catch(console.error);
          }
        }
      }
    } catch (notifyError) {
      console.error("Comment notification error (non-critical):", notifyError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Comment API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
