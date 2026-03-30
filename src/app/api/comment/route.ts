// POST /api/comment
// Add manager comment to a participant's record

import { NextRequest, NextResponse } from "next/server";
import { addManagerComment } from "@/lib/notion";
import { getManagerByToken, getParticipantById } from "@/lib/participant-db";
import { sendNotificationEmail } from "@/lib/email";

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

    // Notify participant about manager's comment (non-blocking)
    try {
      const manager = await getManagerByToken(token);
      if (manager) {
        const allParticipants = manager.participantIds;
        for (const pid of allParticipants) {
          const p = await getParticipantById(pid);
          if (p?.email && !p.email.includes("example.com")) {
            // For now, notify all participants of this manager (usually just one)
            // In future, pass participant identifier from frontend
            sendNotificationEmail({
              to: p.email,
              recipientName: p.name.split(" ")[0],
              senderName: manager.name,
              token: p.token,
              type: "manager_comment",
              detail: comment.length > 100 ? comment.substring(0, 100) + "..." : comment,
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
