"use client";

import { useParams } from "next/navigation";
import { getParticipantByToken } from "@/lib/mock-data";
import { BottomNav } from "@/components/BottomNav";

export default function MissionPage() {
  const params = useParams();
  const token = params.token as string;
  const participant = getParticipantByToken(token);

  if (!participant) {
    return (
      <div className="min-h-screen bg-[#F8F7FF] flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-[#8B85A8]">参加者が見つかりません</p>
        </div>
      </div>
    );
  }

  const inProgress = participant.missions.filter((m) => m.status === "in_progress");
  const notStarted = participant.missions.filter((m) => m.status === "not_started");
  const completed = participant.missions.filter((m) => m.status === "completed");

  const MissionCard = ({ mission }: { mission: typeof participant.missions[0] }) => (
    <div className="bg-white p-4 rounded-xl shadow-sm">
      <h3 className="font-semibold text-[#1E1B3A] mb-2">{mission.title}</h3>

      <div className="text-xs text-[#8B85A8] mb-3">
        <p>開始: {mission.setDate}</p>
        <p>期限: {mission.deadline}</p>
      </div>

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="flex justify-between mb-1">
          <span className="text-xs text-[#8B85A8]">進捗</span>
          <span className="text-xs font-semibold text-[#5B4FD6]">{mission.progress}%</span>
        </div>
        <div className="w-full bg-[#E8E5F0] rounded-full h-2 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#5B4FD6] to-[#7C6FEA] transition-all"
            style={{ width: `${mission.progress}%` }}
          ></div>
        </div>
      </div>

      {/* Review Memo */}
      {mission.reviewMemo && (
        <div className="bg-[#F8F7FF] p-3 rounded-lg border border-[#E8E5F0] mt-3">
          <p className="text-xs font-semibold text-[#8B85A8] mb-1">レビューメモ</p>
          <p className="text-sm text-[#1E1B3A]">{mission.reviewMemo}</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8F7FF] pb-24">
      {/* Header */}
      <div className="gradient-purple text-white p-6 rounded-b-3xl">
        <div className="max-w-md mx-auto">
          <h1 className="text-2xl font-bold">🎯 ミッション</h1>
        </div>
      </div>

      <div className="max-w-md mx-auto px-6 pt-6">
        {participant.missions.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-[#8B85A8] mb-2">ミッションはまだ設定されていません</p>
            <p className="text-sm text-[#8B85A8]">マネージャーと相談して、ミッションを設定しましょう</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* In Progress */}
            {inProgress.length > 0 && (
              <section>
                <h2 className="text-lg font-bold text-[#1E1B3A] mb-4 flex items-center gap-2">
                  <span className="w-2 h-2 bg-[#5B4FD6] rounded-full"></span>
                  進行中 ({inProgress.length})
                </h2>
                <div className="space-y-3">
                  {inProgress.map((mission) => (
                    <MissionCard key={mission.id} mission={mission} />
                  ))}
                </div>
              </section>
            )}

            {/* Not Started */}
            {notStarted.length > 0 && (
              <section>
                <h2 className="text-lg font-bold text-[#1E1B3A] mb-4 flex items-center gap-2">
                  <span className="w-2 h-2 bg-[#8B85A8] rounded-full"></span>
                  未着手 ({notStarted.length})
                </h2>
                <div className="space-y-3">
                  {notStarted.map((mission) => (
                    <MissionCard key={mission.id} mission={mission} />
                  ))}
                </div>
              </section>
            )}

            {/* Completed */}
            {completed.length > 0 && (
              <section>
                <h2 className="text-lg font-bold text-[#1E1B3A] mb-4 flex items-center gap-2">
                  <span className="w-2 h-2 bg-[#22C55E] rounded-full"></span>
                  完了 ({completed.length})
                </h2>
                <div className="space-y-3">
                  {completed.map((mission) => (
                    <MissionCard key={mission.id} mission={mission} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      <BottomNav active="mission" baseUrl={`/p/${token}`} />
    </div>
  );
}
