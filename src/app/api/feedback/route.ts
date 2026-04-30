import { NextRequest, NextResponse } from "next/server";
import { isAdminToken } from "@/lib/participant-db";
import {
  createFeedback,
  getFeedbackByParticipant,
  markFeedbackAsRead,
  getUnreadFeedbackCount,
  getLogsByParticipant,
} from "@/lib/supabase";
import { getParticipantByToken, getManagerByToken, getParticipantByName } from "@/lib/participant-db";
import { sendNotificationEmail } from "@/lib/email";
import { resolveAdminTenantContext } from "@/lib/tenant-context";

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
    if (!participant.tenantId) {
      return NextResponse.json({ error: "Participant tenant unresolved" }, { status: 500 });
    }
    const feedback = await getFeedbackByParticipant(participant.name, participant.tenantId);
    const unreadCount = await getUnreadFeedbackCount(participant.name, participant.tenantId);
    return NextResponse.json({ feedback, unreadCount, totalCount: feedback.length });
  }

  // Check if manager/admin token with participant name
  const manager = await getManagerByToken(token);
  const isAdmin = await isAdminToken(token);
  if ((manager || isAdmin) && participantName) {
    // Resolve tenant: respect ?tenant= param for cross-tenant admin access.
    // Legacy admin-only tokens (no manager row) are modelled as virtual super-admins so they
    // can still scope to a specific tenant via ?tenant=slug rather than silently defaulting.
    const virtualManager = manager || { isAdmin: true, tenantId: null };
    const ctx = await resolveAdminTenantContext(req, virtualManager);

    // When viewing all tenants, find the participant's actual tenant. Otherwise ctx.tenantId
    // is always set by resolveAdminTenantContext (non-admin → own tenant, admin+slug → that tenant).
    let tenantId: string | null = ctx.tenantId;
    if (ctx.isAllTenants) {
      const targetP = await getParticipantByName(participantName); // cross-tenant search
      tenantId = targetP?.tenantId || null;
    }
    if (!tenantId) {
      return NextResponse.json({ error: "対象参加者が見つかりませんでした" }, { status: 404 });
    }

    const includeLogs = req.nextUrl.searchParams.get("includeLogs") === "true";
    const feedback = await getFeedbackByParticipant(participantName, tenantId);
    if (includeLogs) {
      const allLogs = await getLogsByParticipant(participantName, tenantId);
      // Return only last 7 days of logs
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const recentLogs = allLogs
        .filter((log) => new Date(log.date) >= sevenDaysAgo)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      return NextResponse.json({ feedback, recentLogs });
    }
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

    // Resolve tenant: respect ?tenant= param for cross-tenant admin access.
    // Legacy admin-only tokens get modelled as virtual super-admins so they honour ?tenant=.
    const virtualManager = manager || { isAdmin: true, tenantId: null };
    const ctx = await resolveAdminTenantContext(req, virtualManager);

    // Look up participant — cross-tenant search when viewing all tenants
    const targetParticipant = ctx.isAllTenants || !ctx.tenantId
      ? await getParticipantByName(participantName) // cross-tenant search
      : await getParticipantByName(participantName, ctx.tenantId);
    if (!targetParticipant) {
      return NextResponse.json({ error: "対象参加者が見つかりませんでした" }, { status: 404 });
    }
    // Use the participant's actual tenant for creating feedback
    const tenantId = targetParticipant.tenantId || ctx.tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: "Tenant unresolved" }, { status: 500 });
    }
    // participant_id column is UUID type; participant.id may be a string ID (e.g. "p-shimoji")
    // Only pass it if it looks like a valid UUID, otherwise pass null to omit it
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const participantDbId = (targetParticipant?.id && UUID_RE.test(targetParticipant.id)) ? targetParticipant.id : null;

    let result;
    try {
      result = await createFeedback({
        participantName,
        authorName,
        type: feedbackType,
        content,
        period: period || "",
        weekNum: weekNum || 1,
      }, tenantId, participantDbId);
    } catch (fbError: unknown) {
      const msg = fbError instanceof Error ? fbError.message : String(fbError);
      return NextResponse.json({ error: "Failed to create feedback", detail: msg }, { status: 500 });
    }

    if (!result) {
      return NextResponse.json({ error: "Failed to create feedback", detail: "FEEDBACK_DB_ID may be empty" }, { status: 500 });
    }

    // Send email notification to participant (non-blocking)
    try {
      if (targetParticipant?.email && !targetParticipant.email.includes("example.com") && targetParticipant.emailEnabled) {
        await sendNotificationEmail({
          to: targetParticipant.email,
          recipientName: targetParticipant.name.split(" ")[0],
          senderName: authorName,
          token: targetParticipant.token,
          type: "hm_feedback",
          detail: content.length > 100 ? content.substring(0, 100) + "..." : content,
        });
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
