// Admin — Individual Participant Log View
// Shows full log history for a single participant (read-only from admin perspective)

import Link from "next/link";
import { getLogsByParticipant, getMissionsByParticipant, NotionLogEntry } from "@/lib/supabase";

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

export default async function AdminParticipantPage({ params }: Params) {
  const { token, participantId } = params;
  const participantName = decodeURIComponent(participantId);

  let logs: NotionLogEntry[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let missions: any[] = [];

  try {
    const [fetchedLogs, fetchedMissions] = await Promise.all([
      getLogsByParticipant(participantName, "81f91c26-214e-4da2-9893-6ac6c8984062"),
      getMissionsByParticipant(participantName, "81f91c26-214e-4da2-9893-6ac6c8984062"),
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
    } catch {
      return "";
    }
  }

  // Stats
  const totalLogs = logs.length;
  const logsWithMorning = logs.filter((l) => l.morningIntent).length;
  const logsWithEvening = logs.filter((l) => l.eveningInsight).length;

  return (
    <div className="min-h-screen bg-[#F5F0EB]">
      {/* Header — admin style */}
      <header className="gradient-header-admin text-white px-5 pt-12 pb-6">
        <div className="max-w-2xl mx-auto relative z-10">
          <Link
            href={`/a/${token}`}
            className="inline-flex items-center gap-1 text-[#C9BDAE] hover:text-white text-sm mb-3 transition-colors"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
            管理者ダッシュボードに戻る
          </Link>
          <h1 className="text-xl font-semibold tracking-tight">{participantName}</h1>
          <p className="text-xs text-[#C9BDAE] mt-1">個人ログ詳細</p>
        </div>
      </header>

      <main className="px-5 py-5 space-y-5 max-w-2xl mx-auto animate-fade-up">
        {/* Summary Stats */}
        <section className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-[#EFE8DD]">
            <h2 className="text-xs font-semibold text-[#5B5560] tracking-wide uppercase">
              サマリー
            </h2>
          </div>
          <div className="grid grid-cols-3 divide-x divide-[#EFE8DD]">
            <div className="p-4 text-center">
              <div className="text-2xl font-bold text-[#1A1A2E]">{totalLogs}</div>
              <div className="text-[10px] text-[#8B8489] mt-1">総ログ数</div>
            </div>
            <div className="p-4 text-center">
              <div className="text-2xl font-bold text-[#1A1A2E]">{logsWithMorning}</div>
              <div className="text-[10px] text-[#8B8489] mt-1">朝の記入</div>
            </div>
            <div className="p-4 text-center">
              <div className="text-2xl font-bold text-[#1A1A2E]">{logsWithEvening}</div>
              <div className="text-[10px] text-[#8B8489] mt-1">夕の記入</div>
            </div>
          </div>
        </section>

        {/* Active Missions */}
        {missions.length > 0 && (
          <section className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-[#EFE8DD]">
              <h2 className="text-xs font-semibold text-[#5B5560] tracking-wide uppercase">
                ミッション
              </h2>
            </div>
            <div className="divide-y divide-[#EFE8DD]">
              {missions.map((m: { id: string; title?: string; status?: string; content?: string }) => (
                <div key={m.id} className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-[#1A1A2E]">
                      {m.title || "（タイトルなし）"}
                    </span>
                    {m.status && (
                      <span className="text-[10px] font-medium bg-indigo-50 text-[#1A1A2E] px-1.5 py-0.5 rounded-md">
                        {m.status}
                      </span>
                    )}
                  </div>
                  {m.content && (
                    <p className="text-xs text-[#8B8489] leading-relaxed">{m.content}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Log Entries */}
        <section className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-[#EFE8DD]">
            <h2 className="text-xs font-semibold text-[#5B5560] tracking-wide uppercase">
              日報一覧
            </h2>
          </div>
          {logs.length === 0 ? (
            <div className="p-8 text-center text-[#8B8489] text-sm">
              まだ日報がありません
            </div>
          ) : (
            <div className="divide-y divide-[#EFE8DD]">
              {logs.map((entry: NotionLogEntry) => (
                <div key={entry.id} className="p-4">
                  {/* Date & Energy */}
                  <div className="flex justify-between items-center mb-2.5">
                    <span className="text-sm font-medium text-[#1A1A2E]">
                      {entry.datetime
                        ? (() => {
                            const d = new Date(entry.datetime);
                            return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d
                              .getHours()
                              .toString()
                              .padStart(2, "0")}:${d
                              .getMinutes()
                              .toString()
                              .padStart(2, "0")}`;
                          })()
                        : entry.date}
                      （{entry.dayOfWeek}）
                    </span>
                    {entry.energy && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-base leading-none">
                          {energyEmoji[entry.energy] || ""}
                        </span>
                        <span className="text-[11px] text-[#8B8489]">
                          {energyLabel[entry.energy] || ""}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Morning Intent */}
                  {entry.morningIntent && (
                    <div className="mb-2">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-medium text-[#1A1A2E] tracking-wide uppercase">
                          朝の意図
                        </span>
                        {entry.morningTime && (
                          <span className="text-[10px] text-[#C9BDAE]">
                            {formatTime(entry.morningTime)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#2C2C4A] leading-relaxed">
                        {entry.morningIntent}
                      </p>
                    </div>
                  )}

                  {/* Evening Insight */}
                  {entry.eveningInsight && (
                    <div className="mb-2">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-medium text-amber-600 tracking-wide uppercase">
                          夕の気づき
                        </span>
                        {entry.eveningTime && (
                          <span className="text-[10px] text-[#C9BDAE]">
                            {formatTime(entry.eveningTime)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#2C2C4A] leading-relaxed">
                        {entry.eveningInsight}
                      </p>
                    </div>
                  )}

                  {/* HM Feedback */}
                  {entry.hmFeedback && (
                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-2.5 mt-2">
                      <span className="text-[10px] font-medium text-amber-600 tracking-wide">
                        HM FB
                      </span>
                      <p className="text-xs text-[#2C2C4A] mt-0.5 leading-relaxed">
                        {entry.hmFeedback}
                      </p>
                    </div>
                  )}

                  {/* Manager Comment (read-only for admin) */}
                  {entry.managerComment && (
                    <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-2.5 mt-2">
                      <span className="text-[10px] font-medium text-indigo-600 tracking-wide">
                        上司コメント
                      </span>
                      <p className="text-xs text-[#2C2C4A] mt-0.5 leading-relaxed">
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
