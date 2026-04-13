// Participant Detail Page (Manager View)
// Shows individual participant's log entries + full mission management

import Link from "next/link";
import { getLogsByParticipant, getMissionsByParticipant, getParticipantByNameCrossTenant, NotionLogEntry, DEFAULT_TENANT_ID } from "@/lib/supabase";
import { getManagerByToken } from "@/lib/participant-db";
import { formatTimeJST, formatFullDateTimeJST } from "@/lib/date-utils";
import CommentForm from "./CommentForm";
import MissionManager from "./MissionManager";

type Params = {
  params: {
    token: string;
    participantId: string;
  };
};

const energyEmoji: Record<string, string> = {
  excellent: "🔥",
  good: "😊",
  okay: "😐",
  low: "😞",
};

const energyLabel: Record<string, string> = {
  excellent: "絶好調",
  good: "良い",
  okay: "まあまあ",
  low: "低調",
};

export default async function ParticipantDetailPage({ params }: Params) {
  const { token, participantId } = params;
  const participantName = decodeURIComponent(participantId);

  let logs: NotionLogEntry[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let missions: any[] = [];

  try {
    // Resolve the participant's own tenantId first (handles cross-tenant views).
    // Fallback to the manager's tenantId if participant lookup fails.
    const participant = await getParticipantByNameCrossTenant(participantName);
    let tenantId: string;

    if (participant?.tenantId) {
      tenantId = participant.tenantId;
    } else {
      const manager = await getManagerByToken(token);
      tenantId = manager?.tenantId || DEFAULT_TENANT_ID;
    }

    const [fetchedLogs, fetchedMissions] = await Promise.all([
      getLogsByParticipant(participantName, tenantId),
      getMissionsByParticipant(participantName, tenantId),
    ]);
    logs = fetchedLogs;
    missions = fetchedMissions;
  } catch (e) {
    console.error("Failed to fetch data:", e);
  }

  const formatTime = formatTimeJST;

  return (
    <div className="min-h-screen bg-[#F5F0EB]">
      {/* Header */}
      <header className="gradient-header-manager text-white px-5 pt-12 pb-6">
        <div className="max-w-2xl mx-auto relative z-10">
          <Link
            href={`/m/${token}`}
            className="inline-flex items-center gap-1 text-indigo-300 hover:text-white text-sm mb-3 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            一覧に戻る
          </Link>
          <h1 className="text-xl font-semibold tracking-tight">{participantName}</h1>
        </div>
      </header>

      <main className="px-5 py-5 space-y-5 max-w-2xl mx-auto animate-fade-up">
        {/* Mission Manager */}
        <MissionManager
          token={token}
          participantName={participantName}
          initialMissions={missions}
        />

        {/* Log Entries */}
        <section className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-[#EFE8DD]">
            <h2 className="text-xs font-semibold text-[#5B5560] tracking-wide uppercase">日報一覧</h2>
          </div>
          {logs.length === 0 ? (
            <div className="p-8 text-center text-[#8B8489] text-sm">まだ日報がありません</div>
          ) : (
            <div className="divide-y divide-[#EFE8DD]">
              {logs.map((entry: NotionLogEntry) => (
                <div key={entry.id} className="p-4">
                  <div className="flex justify-between items-center mb-2.5">
                    <span className="text-sm font-medium text-[#1A1A2E]">
                      {entry.datetime ? formatFullDateTimeJST(entry.datetime) : entry.date}（{entry.dayOfWeek}）
                    </span>
                    {entry.energy && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-base leading-none">{energyEmoji[entry.energy] || ""}</span>
                        <span className="text-[11px] text-[#8B8489]">{energyLabel[entry.energy] || ""}</span>
                      </div>
                    )}
                  </div>
                  {entry.morningIntent && (
                    <div className="mb-2">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-medium text-[#1A1A2E] tracking-wide uppercase">朝の意図</span>
                        {entry.morningTime && (
                          <span className="text-[10px] text-[#C9BDAE]">{formatTime(entry.morningTime)}</span>
                        )}
                      </div>
                      <p className="text-xs text-[#2C2C4A] leading-relaxed">{entry.morningIntent}</p>
                    </div>
                  )}
                  {entry.eveningInsight && (
                    <div className="mb-2">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-medium text-amber-600 tracking-wide uppercase">夕の気づき</span>
                        {entry.eveningTime && (
                          <span className="text-[10px] text-[#C9BDAE]">{formatTime(entry.eveningTime)}</span>
                        )}
                      </div>
                      <p className="text-xs text-[#2C2C4A] leading-relaxed">{entry.eveningInsight}</p>
                    </div>
                  )}
                  {entry.hmFeedback && (
                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-2.5 mt-2">
                      <span className="text-[10px] font-medium text-amber-600 tracking-wide">HM FB</span>
                      <p className="text-xs text-[#2C2C4A] mt-0.5 leading-relaxed">{entry.hmFeedback}</p>
                    </div>
                  )}
                  <CommentForm
                    token={token}
                    entryId={entry.id}
                    existingComment={entry.managerComment}
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
