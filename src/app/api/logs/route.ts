// GET /api/logs?participant=田中太郎
// Returns all CORE Log entries for a participant

import { NextRequest, NextResponse } from "next/server";
import { getLogsByParticipant, getMissionsByParticipant, getMissionComments, getFeedbackByParticipant } from "@/lib/supabase";
import { getParticipantByToken } from "@/lib/participant-db";
import { computeParticipantStats } from "@/lib/stats";
import { getTodayJST } from "@/lib/date-utils";

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
  if (!participant.tenantId) {
    return NextResponse.json({ error: "Participant tenant unresolved" }, { status: 500 });
  }

  const tenantId = participant.tenantId;

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

  // Compute accurate stats using the same logic as admin/manager dashboards
  const todayJST = getTodayJST();
  const stats = computeParticipantStats(logs, todayJST);

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
    stats: {
      entryDays: stats.entryDays,
      completeDays: stats.completeDays,
      completionRate: stats.completionRate,
      streak: stats.streak,
      todayStatus: stats.todayStatus,
      morningCount: stats.morningCount,
      eveningCount: stats.eveningCount,
      businessDaysElapsed: stats.businessDaysElapsed,
    },
    badges: {
      feedback: logsWithNewFeedback.length,
      feedbackTotal: feedbacks.length,
      mission: missionBadgeCount,
    },
  });
}
