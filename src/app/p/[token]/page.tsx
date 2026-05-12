// Server Component for participant home (/p/[token]).
//
// Why a Server Component?
//   The previous version was a Client Component that fetched /api/logs and
//   /api/feedback from useEffect after hydration. Users saw:
//     1. Click link → loading.tsx skeleton
//     2. Page HTML (empty shell)
//     3. JS bundle downloads, hydrates
//     4. useEffect fires → fetch waterfall (~300-800ms)
//     5. In-page "データを準備しています..." spinner
//     6. Render with data
//
//   Total perceived latency: 1-2 seconds, dominated by the round trips in
//   step 4. Server Component shortcut: the runtime fetches the data
//   directly via Supabase (no HTTP middleware overhead, in-region DB call,
//   shared TLS) and ships the HTML with data already in it. Steps 2-5
//   collapse into one render.

import { notFound } from "next/navigation";
import { getParticipantByToken } from "@/lib/participant-db";
import {
  getLogsByParticipant,
  getFeedbackByParticipant,
  getUnreadFeedbackCount,
} from "@/lib/supabase";
import { computeParticipantStats } from "@/lib/stats";
import { getTodayJST, calculateWeekNum } from "@/lib/date-utils";
import ParticipantHomeClient, { type ParticipantHomeInitialData } from "./ParticipantHomeClient";

// Avoid Next.js trying to cache this — data is per-token and changes on each
// log submission.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ParticipantHome({
  params,
}: {
  params: { token: string };
}) {
  const token = params.token;
  const participant = await getParticipantByToken(token);
  if (!participant || !participant.tenantId) {
    notFound();
  }
  const tenantId = participant.tenantId;

  // 3 parallel Supabase queries — same as /api/logs but skipping the HTTP
  // hop and the middleware feature-flag round trip. Mission data is loaded
  // by the client-side background refresh because the badge depends on
  // mission_comments which is a 4th query; keeping it client-side keeps
  // the server fetch small and the first paint fast.
  const [logs, feedbacks, unreadCount] = await Promise.all([
    getLogsByParticipant(participant.name, tenantId),
    getFeedbackByParticipant(participant.name, tenantId),
    getUnreadFeedbackCount(participant.name, tenantId),
  ]);

  const todayJST = getTodayJST();
  const stats = computeParticipantStats(logs, todayJST);

  const initialData: ParticipantHomeInitialData = {
    participant: {
      id: participant.id,
      name: participant.name,
      department: participant.department,
      dojoPhase: participant.dojoPhase,
      weekNum: calculateWeekNum(participant.startDate || ""),
    },
    logs: logs.map((l) => ({
      id: l.id,
      date: l.date,
      datetime: l.datetime,
      dayOfWeek: l.dayOfWeek,
      dayNum: l.dayNum,
      morningIntent: l.morningIntent,
      eveningInsight: l.eveningInsight,
      energy: l.energy,
      status: l.status,
      hasFeedback: l.hasFeedback,
    })),
    badges: {
      feedback: unreadCount,
      feedbackTotal: feedbacks.length,
      // Mission badge depends on recent manager comments — computed lazily on
      // the client side via the background revalidation. Server-paint
      // displays 0 initially; the badge appears after refresh if any.
      mission: 0,
    },
    unreadFeedback: unreadCount,
    stats: {
      entryDays: stats.entryDays,
      completeDays: stats.completeDays,
      completionRate: stats.completionRate,
      streak: stats.streak,
      todayStatus: stats.todayStatus,
      businessDaysElapsed: stats.businessDaysElapsed,
    },
  };

  return <ParticipantHomeClient token={token} initialData={initialData} />;
}
