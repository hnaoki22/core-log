// GET /api/logs?participant=田中太郎
// Returns all CORE Log entries for a participant

import { NextRequest, NextResponse } from "next/server";
import { getLogsByParticipant, getMissionsByParticipant } from "@/lib/notion";
import { getParticipantByToken } from "@/lib/mock-data";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const token = searchParams.get("token");
  const useMock = !process.env.NOTION_API_TOKEN;

  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  // If Notion is not configured, return mock data
  if (useMock) {
    const participant = getParticipantByToken(token);
    if (!participant) {
      return NextResponse.json({ error: "Participant not found" }, { status: 404 });
    }
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
      logs: participant.logs,
      feedbacks: participant.feedbacks,
      managerComments: participant.managerComments,
      missions: participant.missions,
    });
  }

  // Use Notion API
  const participant = getParticipantByToken(token); // Still use token mapping
  if (!participant) {
    return NextResponse.json({ error: "Participant not found" }, { status: 404 });
  }

  const [logs, missions] = await Promise.all([
    getLogsByParticipant(participant.name),
    getMissionsByParticipant(participant.name),
  ]);
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
  });
}
