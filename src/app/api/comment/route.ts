// POST /api/comment
// Add manager comment to a participant's record

import { NextRequest, NextResponse } from "next/server";
import { addManagerComment, getLogEntryOwner } from "@/lib/supabase";
import { getManagerByToken, getParticipantByName } from "@/lib/participant-db";
import { sendNotificationEmail } from "@/lib/email";
import { sanitizeInput } from "@/lib/sanitize";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, participantId, comment } = body;

    if (!token || !comment) {
      return NextResponse.json({ error: "Token and comment required" }, { status: 400 });
    }

    // Sanitize user input
    const sanitizedComment = sanitizeInput(comment);

    // Authenticate manager up-front (was previously deferred to the
    // notification block, leaving the addManagerComment write effectively
    // unauthenticated for tenant scope).
    const manager = await getManagerByToken(token);
    if (!manager) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!manager.tenantId) {
      return NextResponse.json({ error: "Tenant unresolved" }, { status: 500 });
    }
    const managerTenantId = manager.tenantId;
    if (!participantId) {
      return NextResponse.json({ error: "participantId (log id) required" }, { status: 400 });
    }

    // Add comment to the specific log entry. addManagerComment enforces
    // tenant scope, so a comment on a log row from another tenant fails.
    const success = await addManagerComment(participantId, sanitizedComment, managerTenantId);
    if (!success) {
      return NextResponse.json({ error: "Failed to save comment" }, { status: 500 });
    }

    // Notify the specific participant whose log was commented on (non-blocking)
    try {
      if (manager && participantId) {
        // Look up which participant owns this log entry (tenant-scoped)
        const ownerName = await getLogEntryOwner(participantId, managerTenantId);
        if (ownerName) {
          const targetParticipant = await getParticipantByName(ownerName, manager.tenantId);
          if (targetParticipant?.email && !targetParticipant.email.includes("example.com")) {
            await sendNotificationEmail({
              to: targetParticipant.email,
              recipientName: targetParticipant.name.split(" ")[0],
              senderName: manager.name,
              token: targetParticipant.token,
              type: "manager_comment",
              detail: sanitizedComment.length > 100 ? sanitizedComment.substring(0, 100) + "..." : sanitizedComment,
            });
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
