// GET /api/logs?participant=田中太郎
// Returns all CORE Log entries for a participant

import { NextRequest, NextResponse } from "next/server";
import { getLogsByParticipant, getMissionsByParticipant } from "@/lib/notion";
import { getParticipantByToken } from "@/lib/participant-db";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const token = searchParams.get("token");
  const useMock = !process.env.NOTION_API_TOKEN;

  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  // If Notion is not configured, return mock data
  if (useMock) {
    const participant = await getParticipantByToken(token);
    if (!participant) {
      return NextResponse.json({ error: "Participant not found" }, { status: 404 });
    }
    // バッジカウント計算
    const feedbacks = participant.feedbacks || [];
    const managerComments = participant.managerComments || [];
    const newFeedbackCount = feedbacks.filter((f) => f.isNew).length;
    const newManagerCommentCount = managerComments.length > 0 ?
      managerComments.filter((mc) => {
        const commentDate = new Date(mc.date);
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        return commentDate >= sevenDaysAgo;
      }).length : 0;

    return NextResponse.json({
      participant: {
        id: participant.id,
        name: participant.name,
        department: participant.department,
        dojoPhase: participant.dojoPhase,
        weekNum: participant.weekNum,
        totalDays: participant.totalDays,
        entryRate: participant.entryRate,
        streak: participant.streak,
        fbCount: participant.fbCount,
        averageEnergy: participant.averageEnergy,
      },
      logs: participant.logs || [],
      feedbacks: participant.feedbacks || [],
      managerComments: participant.managerComments || [],
      missions: participant.missions || [],
      badges: {
        feedback: newFeedbackCount + newManagerCommentCount,
        mission: 0,  // ミッションコメントの未読はNotion移行後に対応
      },
    });
  }

  // Use Notion API
  const participant = await getParticipantByToken(token);
  if (!participant) {
    return NextResponse.json({ error: "Participant not found" }, { status: 404 });
  }

  const [logs, missions] = await Promise.all([
    getLogsByParticipant(participant.name),
    getMissionsByParticipant(participant.name),
  ]);

  // Notion版: ログのhmFeedback/managerCommentの有無でバッジカウント
  const logsWithNewFeedback = logs.filter(
    (log: { hmFeedback?: string | null; managerComment?: string | null; hasFeedback?: boolean }) =>
      log.hasFeedback && (log.hmFeedback || log.managerComment)
  );

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
      mission: 0,
    },
  });
}
