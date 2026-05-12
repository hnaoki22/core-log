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
import {
  getParticipantWithLogsByToken,
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
  const t0 = Date.now();
  const token = params.token;

  // Phase 1: nested-select for participant + logs in 1 round trip
  const result = await getParticipantWithLogsByToken(token);
  const tFetch1 = Date.now();
  if (!result?.participant || !result.participant.tenantId) {
    notFound();
  }
  const participant = result.participant;
  const logs = result.logs;
  const tenantId = participant.tenantId;

  // Phase 2: feedback list + unread count in parallel.
  // Mission data is left to the client-side background refresh because the
  // mission badge needs a join into mission_comments (a 4th query); keeping
  // it client-side keeps the server fetch small and the first paint fast.
  const [feedbacks, unreadCount] = await Promise.all([
    getFeedbackByParticipant(participant.name, tenantId),
    getUnreadFeedbackCount(participant.name, tenantId),
  ]);
  const tFetch2 = Date.now();

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

  const tDone = Date.now();
  console.log(
    `[perf] /p/[token] total=${tDone - t0}ms ` +
      `(participant+logs=${tFetch1 - t0}ms, feedback=${tFetch2 - tFetch1}ms, build=${tDone - tFetch2}ms)`,
  );

  return <ParticipantHomeClient token={token} initialData={initialData} />;
}
