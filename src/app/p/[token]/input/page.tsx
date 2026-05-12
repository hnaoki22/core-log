// Server Component for /p/[token]/input.
//
// User flow (before): browser navigates → empty HTML shell → JS DL →
// hydration → useEffect fetches /api/logs → 500-1000ms "接続中です..."
// spinner → page renders. Total perceived 1-2 seconds.
//
// After: Vercel function fetches today's status directly via Supabase
// (region-local, no HTTP middleware hop), ships HTML with form already
// in the correct mode (morning vs evening vs completed). User sees the
// real form on first paint.

import { notFound } from "next/navigation";
import { getParticipantByToken } from "@/lib/participant-db";
import { getLogsByParticipant } from "@/lib/supabase";
import { getTodayJST, getCurrentHourJST, isGracePeriod, calculateWeekNum } from "@/lib/date-utils";
import InputClient, { type InputPageInitialData } from "./InputClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function InputPageServer({
  params,
}: {
  params: { token: string };
}) {
  const token = params.token;
  const participant = await getParticipantByToken(token);
  if (!participant || !participant.tenantId) {
    notFound();
  }

  const logs = await getLogsByParticipant(participant.name, participant.tenantId);
  const today = getTodayJST();
  const todayEntry = logs.find((l) => l.date === today);

  // Mirror the original client-side logic (lines 124-140 of old page.tsx):
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

  return <InputClient token={token} initialData={initialData} />;
}
