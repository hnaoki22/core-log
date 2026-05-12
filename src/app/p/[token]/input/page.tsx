// Server Component for /p/[token]/input.
//
// Combines participant + logs into ONE Supabase nested-select to avoid the
// "ParticipantByToken → wait → LogsByParticipant" sequential round trip.
// Logs timing to the Vercel function log (visible in Vercel dashboard) so
// we can SEE where the time goes per request.

import { notFound } from "next/navigation";
import { getParticipantWithLogsByToken } from "@/lib/supabase";
import { getTodayJST, getCurrentHourJST, isGracePeriod, calculateWeekNum } from "@/lib/date-utils";
import InputClient, { type InputPageInitialData } from "./InputClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function InputPageServer({
  params,
}: {
  params: { token: string };
}) {
  const t0 = Date.now();
  const token = params.token;

  const result = await getParticipantWithLogsByToken(token);
  const tFetched = Date.now();

  if (!result?.participant || !result.participant.tenantId) {
    notFound();
  }
  const participant = result.participant;
  const logs = result.logs;

  const today = getTodayJST();
  const todayEntry = logs.find((l) => l.date === today);

  const hour = getCurrentHourJST();
  const inGracePeriod = isGracePeriod();

  let initialIsMorning = true;
  let initialMorningClosed = false;
  let initialAlreadyCompleted = false;
  let initialTodayLog: InputPageInitialData["todayLog"] = null;

  if (todayEntry && todayEntry.morningIntent) {
    initialTodayLog = {
      id: todayEntry.id,
      morningIntent: todayEntry.morningIntent,
      status: todayEntry.status,
    };
    if (todayEntry.status === "complete" || todayEntry.status === "fb_done") {
      initialAlreadyCompleted = true;
    } else {
      initialIsMorning = false;
    }
  } else if (hour >= 12 || inGracePeriod) {
    initialIsMorning = false;
    initialMorningClosed = true;
  }

  const initialData: InputPageInitialData = {
    participant: {
      name: participant.name,
      dojoPhase: participant.dojoPhase,
      weekNum: calculateWeekNum(participant.startDate || ""),
    },
    todayLog: initialTodayLog,
    initialIsMorning,
    initialMorningClosed,
    initialAlreadyCompleted,
  };

  const tDone = Date.now();
  console.log(`[perf] /p/[token]/input total=${tDone - t0}ms (fetch=${tFetched - t0}ms, build=${tDone - tFetched}ms)`);

  return <InputClient token={token} initialData={initialData} />;
}
