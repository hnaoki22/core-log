// Server Component for /p/[token]/logs.
//
// Fetches participant + their full log list via Supabase nested-select so
// the page is rendered with data already in the initial HTML. The previous
// Client Component version showed an in-page spinner for the duration of
// /api/logs (~200-500ms including middleware overhead).

import { notFound } from "next/navigation";
import { getParticipantWithLogsByToken, getUnreadFeedbackCount, getFeedbackByParticipant } from "@/lib/supabase";
import { isStandaloneTenant } from "@/lib/standalone";
import LogsClient, { type LogsInitialData } from "./LogsClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function LogsPageServer({
  params,
}: {
  params: { token: string };
}) {
  const t0 = Date.now();
  const token = params.token;

  const result = await getParticipantWithLogsByToken(token);
  const tFetch1 = Date.now();
  if (!result?.participant || !result.participant.tenantId) {
    notFound();
  }
  const participant = result.participant;
  const tenantId = participant.tenantId;

  // Parallel fetch feedback list / unread count to populate the bottom-nav
  // badges. Mission badge requires mission_comments join — left to the
  // client-side background revalidate to keep the server fetch small.
  const [feedbacks, unreadCount] = await Promise.all([
    getFeedbackByParticipant(participant.name, tenantId),
    getUnreadFeedbackCount(participant.name, tenantId),
  ]);
  const tFetch2 = Date.now();

  // standalone: ローソク足の長期表示は初日から常時（2026-06-10夜 本藤さん決定。
  // 解禁ゲートが残るのは AI分析のみ）
  const standaloneCandle = await isStandaloneTenant(tenantId);

  const initialData: LogsInitialData = {
    logs: result.logs.map((l) => ({
      id: l.id,
      date: l.date,
      datetime: l.datetime,
      dayOfWeek: l.dayOfWeek,
      dayNum: l.dayNum,
      morningIntent: l.morningIntent,
      eveningInsight: l.eveningInsight,
      energy: l.energy,
      eveningEnergy: l.eveningEnergy,
      status: l.status,
      hasFeedback: l.hasFeedback,
      hmFeedback: l.hmFeedback,
      managerComment: l.managerComment,
      managerCommentTime: l.managerCommentTime,
      managerReaction: l.managerReaction,
      morningTime: l.morningTime,
      eveningTime: l.eveningTime,
    })),
    badges: {
      feedback: unreadCount,
      feedbackTotal: feedbacks.length,
      mission: 0, // filled by client-side background revalidate
    },
    standaloneCandle,
  };

  console.log(
    `[perf] /p/[token]/logs total=${Date.now() - t0}ms ` +
      `(participant+logs=${tFetch1 - t0}ms, feedback=${tFetch2 - tFetch1}ms)`,
  );

  return <LogsClient token={token} initialData={initialData} />;
}
