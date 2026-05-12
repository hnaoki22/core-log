// Server Component for /p/[token]/feedback.
//
// Fetches feedback list + unread count directly from Supabase on the server
// (region-local, no HTTP middleware hop) so the page renders with data
// in the initial HTML. Previously the in-page "データを準備しています..."
// spinner showed during the client-side /api/feedback round trip.

import { notFound } from "next/navigation";
import { getParticipantByToken } from "@/lib/participant-db";
import { getFeedbackByParticipant, getUnreadFeedbackCount } from "@/lib/supabase";
import FeedbackClient, { type FeedbackInitialData } from "./FeedbackClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function FeedbackPageServer({
  params,
}: {
  params: { token: string };
}) {
  const t0 = Date.now();
  const token = params.token;
  const participant = await getParticipantByToken(token);
  if (!participant || !participant.tenantId) {
    notFound();
  }
  const tFetch1 = Date.now();

  const [feedbacks, unreadCount] = await Promise.all([
    getFeedbackByParticipant(participant.name, participant.tenantId),
    getUnreadFeedbackCount(participant.name, participant.tenantId),
  ]);
  const tFetch2 = Date.now();

  const initialData: FeedbackInitialData = {
    feedbacks: feedbacks.map((f) => ({
      id: f.id,
      participantName: f.participantName,
      authorName: f.authorName,
      type: f.type as FeedbackInitialData["feedbacks"][number]["type"],
      content: f.content,
      period: f.period,
      weekNum: f.weekNum,
      date: f.date,
      isRead: f.isRead,
    })),
    unreadCount,
    totalCount: feedbacks.length,
  };

  console.log(
    `[perf] /p/[token]/feedback total=${Date.now() - t0}ms ` +
      `(participant=${tFetch1 - t0}ms, feedback+unread=${tFetch2 - tFetch1}ms)`,
  );

  return <FeedbackClient token={token} initialData={initialData} />;
}
