// Participant Detail Page (Manager View)
// Shows individual participant's log entries

import Link from "next/link";
import { getLogsByParticipant, getMissionsByParticipant, NotionLogEntry } from "@/lib/notion";

type MissionEntry = {
  id: string;
  title: string;
  participantName: string;
  setDate: string;
  deadline: string;
  status: string;
  purpose: string | null;
  reviewMemo: string | null;
  finalReview: string | null;
};

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
  let missions: MissionEntry[] = [];

  try {
    const [fetchedLogs, fetchedMissions] = await Promise.all([
      getLogsByParticipant(participantName),
      getMissionsByParticipant(participantName),
    ]);
    logs = fetchedLogs;
    missions = fetchedMissions as MissionEntry[];
  } catch (e) {
    console.error("Failed to fetch data:", e);
  }

  const energyMap: Record<string, string> = {
    excellent: "🔥", good: "😊", okay: "😐", low: "😟",
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <Link
          href={`/m/${token}`}
          className="text-blue-600 hover:text-blue-800 text-sm"
        >
          ← 一覧に戻る
        </Link>
        <h1 className="text-lg font-bold text-gray-800">{participantName}</h1>
      </header>

      <main className="p-4 space-y-6 max-w-2xl mx-auto">
        {/* Active Mission */}
        {missions.length > 0 && (
          <section className="bg-white rounded-xl p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-500 mb-3">現在のミッション</h2>
            {missions.slice(0, 1).map((m: MissionEntry) => (
              <div key={m.id} className="border-l-4 border-blue-500 pl-3">
                <p className="font-medium text-gray-800">{m.title}</p>
                <p className="text-xs text-gray-500 mt-1">{m.status}</p>
              </div>
            ))}
          </section>
        )}

        {/* Log Entries */}
        <section className="bg-white rounded-xl p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-500 mb-3">日報一覧</h2>
          {logs.length === 0 ? (
            <p className="text-gray-400 text-sm">まだ日報がありません</p>
          ) : (
            <div className="space-y-3">
              {logs.map((entry: NotionLogEntry) => (
                <div key={entry.id} className="border rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-700">
                      {entry.date}
                    </span>
                    <span className="text-lg">
                      {entry.energy ? energyMap[entry.energy] || "😐" : "😐"}
                    </span>
                  </div>
                  {entry.morningIntent && (
                    <p className="text-xs text-gray-600">
                      <span className="font-semibold">朝の意図：</span>
                      {entry.morningIntent}
                    </p>
                  )}
                  {entry.eveningInsight && (
                    <p className="text-xs text-gray-600 mt-1">
                      <span className="font-semibold">気づき：</span>
                      {entry.eveningInsight}
                    </p>
                  )}
                  {entry.managerComment && (
                    <div className="mt-2 bg-blue-50 rounded p-2">
                      <p className="text-xs text-blue-700">
                        <span className="font-semibold">上司コメント：</span>
                        {entry.managerComment}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
