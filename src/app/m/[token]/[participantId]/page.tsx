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

  const energyMap: Record<string, string> = {
    excellent: "🔥", good: "😊", okay: "😐", low: "😟",
  };

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
    <div className="min-h-screen bg-[#F8F7FF]">
      {/* Header */}
      <header className="bg-gradient-to-r from-[#4A3FBF] to-[#6B5FEA] text-white px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Link
            href={`/m/${token}`}
            className="text-white/80 hover:text-white text-sm"
          >
            ← 一覧
          </Link>
          <h1 className="text-lg font-bold">{participantName}</h1>
        </div>
      </header>

      <main className="p-4 space-y-6 max-w-2xl mx-auto">
        {/* Mission Manager */}
        <MissionManager
          token={token}
          participantName={participantName}
          initialMissions={missions}
        />

        {/* Log Entries */}
        <section className="bg-white rounded-xl shadow-sm">
          <div className="p-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-500">📋 日報一覧</h2>
          </div>
          {logs.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">まだ日報がありません</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {logs.map((entry: NotionLogEntry) => (
                <div key={entry.id} className="p-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-[#1E1B3A]">
                      {entry.date}（{entry.dayOfWeek}）
                    </span>
                    <span className="text-lg">
                      {entry.energy ? energyMap[entry.energy] || "😐" : "—"}
                    </span>
                  </div>
                  {entry.morningIntent && (
                    <div className="mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[#5B4FD6]">朝の意図：</span>
                        {entry.morningTime && (
                          <span className="text-[10px] text-gray-400">🕐 {formatTime(entry.morningTime)}</span>
                        )}
                      </div>
                      <span className="text-xs text-gray-700">{entry.morningIntent}</span>
                    </div>
                  )}
                  {entry.eveningInsight && (
                    <div className="mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[#FF8C42]">夕の気づき：</span>
                        {entry.eveningTime && (
                          <span className="text-[10px] text-gray-400">🕐 {formatTime(entry.eveningTime)}</span>
                        )}
                      </div>
                      <span className="text-xs text-gray-700">{entry.eveningInsight}</span>
                    </div>
                  )}
                  {entry.hmFeedback && (
                    <div className="bg-purple-50 rounded-lg p-2 mt-2">
                      <span className="text-xs font-semibold text-purple-600">HM FB：</span>
                      <span className="text-xs text-purple-800">{entry.hmFeedback}</span>
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
