// Participant Detail Page (Manager View)
// Shows individual participant's log entries + full mission management

import Link from "next/link";
import { getLogsByParticipant, getMissionsByParticipant, NotionLogEntry } from "@/lib/notion";
import CommentForm from "./CommentForm";
import MissionManager from "./MissionManager";

type Params = {
  params: {
    token: string;
    participantId: string;
  };
};

const energyColor: Record<string, string> = {
  excellent: "#F59E0B",
  good: "#059669",
  okay: "#9CA3AF",
  low: "#DC2626",
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
    const [fetchedLogs, fetchedMissions] = await Promise.all([
      getLogsByParticipant(participantName),
      getMissionsByParticipant(participantName),
    ]);
    logs = fetchedLogs;
    missions = fetchedMissions;
  } catch (e) {
    console.error("Failed to fetch data:", e);
  }

  function formatTime(isoStr: string | null | undefined): string {
    if (!isoStr) return "";
    try {
      const d = new Date(isoStr);
      const h = d.getUTCHours().toString().padStart(2, "0");
      const m = d.getUTCMinutes().toString().padStart(2, "0");
      return `${h}:${m}`;
    } catch { return ""; }
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
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
          <div className="px-5 py-4 border-b border-[#F3F4F6]">
            <h2 className="text-xs font-semibold text-[#6B7280] tracking-wide uppercase">日報一覧</h2>
          </div>
          {logs.length === 0 ? (
            <div className="p-8 text-center text-[#9CA3AF] text-sm">まだ日報がありません</div>
          ) : (
            <div className="divide-y divide-[#F3F4F6]">
              {logs.map((entry: NotionLogEntry) => (
                <div key={entry.id} className="p-4">
                  <div className="flex justify-between items-center mb-2.5">
                    <span className="text-sm font-medium text-[#111827]">
                      {entry.date}（{entry.dayOfWeek}）
                    </span>
                    {entry.energy && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: energyColor[entry.energy] || "#9CA3AF" }}></div>
                        <span className="text-[11px] text-[#9CA3AF]">{energyLabel[entry.energy] || ""}</span>
                      </div>
                    )}
                  </div>
                  {entry.morningIntent && (
                    <div className="mb-2">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-medium text-[#4338CA] tracking-wide uppercase">朝の意図</span>
                        {entry.morningTime && (
                          <span className="text-[10px] text-[#D1D5DB]">{formatTime(entry.morningTime)}</span>
                        )}
                      </div>
                      <p className="text-xs text-[#374151] leading-relaxed">{entry.morningIntent}</p>
                    </div>
                  )}
                  {entry.eveningInsight && (
                    <div className="mb-2">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-medium text-amber-600 tracking-wide uppercase">夕の気づき</span>
                        {entry.eveningTime && (
                          <span className="text-[10px] text-[#D1D5DB]">{formatTime(entry.eveningTime)}</span>
                        )}
                      </div>
                      <p className="text-xs text-[#374151] leading-relaxed">{entry.eveningInsight}</p>
                    </div>
                  )}
                  {entry.hmFeedback && (
                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-2.5 mt-2">
                      <span className="text-[10px] font-medium text-amber-600 tracking-wide">HM FB</span>
                      <p className="text-xs text-[#374151] mt-0.5 leading-relaxed">{entry.hmFeedback}</p>
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
