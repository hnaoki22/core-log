// GET /api/logs?participant=田中太郎
// Returns all CORE Log entries for a participant

import { NextRequest, NextResponse } from "next/server";
import { getLogsByParticipant, getMissionsByParticipant, getMissionComments, getFeedbackByParticipant } from "@/lib/supabase";
import { getParticipantByToken } from "@/lib/participant-db";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  // Use Supabase API
  const participant = await getParticipantByToken(token);
  if (!participant) {
    return NextResponse.json({ error: "Participant not found" }, { status: 404 });
  }

  const tenantId = participant.tenantId || "81f91c26-214e-4da2-9893-6ac6c8984062";

  const [logs, missions, feedbacks] = await Promise.all([
    getLogsByParticipant(participant.name, tenantId),
    getMissionsByParticipant(participant.name, tenantId),
    getFeedbackByParticipant(participant.name, tenantId),
  ]);

  // Notion版: ログのhmFeedback/managerCommentの有無でバッジカウント
  const logsWithNewFeedback = logs.filter(
    (log: { hmFeedback?: string | null; managerComment?: string | null; hasFeedback?: boolean }) =>
      log.hasFeedback && (log.hmFeedback || log.managerComment)
  );

  // Count missions with manager comments in the last 7 days
  let missionBadgeCount = 0;
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  for (const mission of missions) {
    const comments = await getMissionComments(mission.id);
    const hasManagerComment = comments.some(
      (comment: { authorRole?: string; createdAt?: string }) => {
        if (comment.authorRole !== "manager") return false;
        if (!comment.createdAt) return false;
        const commentDate = new Date(comment.createdAt);
        return commentDate >= sevenDaysAgo;
      }
    );
    if (hasManagerComment) {
      missionBadgeCount++;
    }
  }

  return NextResponse.json({
    participant: {
      id: participant.id,
      name: participant.name,
      department: participant.department,
      dojoPhase: participant.dojoPhase,
      weekNum: participant.weekNum,
    },
    logs,
    missions,
    badges: {
      feedback: logsWithNewFeedback.length,
      feedbackTotal: feedbacks.length,
      mission: missionBadgeCount,
    },
  });
}
