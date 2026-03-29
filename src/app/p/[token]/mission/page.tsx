"use client";

import { useParams } from "next/navigation";
import { getParticipantByToken } from "@/lib/mock-data";
import { BottomNav } from "@/components/BottomNav";
import { useState, useEffect } from "react";

type Mission = {
  id: string;
  title: string;
  setDate: string;
  deadline: string;
  status: string;
  purpose: string | null;
  reviewMemo: string | null;
  finalReview: string | null;
};

export default function MissionPage() {
  const params = useParams();
  const token = params.token as string;
  const participant = getParticipantByToken(token);

  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMissions() {
      try {
        // Fetch missions from the API - logs endpoint also returns missions if available
        const res = await fetch(`/api/logs?token=${token}`);
        if (res.ok) {
          const data = await res.json();
          if (data.missions) {
            setMissions(data.missions);
          }
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchMissions();
  }, [token]);

  if (!participant) {
    return (
      <div className="min-h-screen bg-[#F8F7FF] flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-[#8B85A8]">参加者が見つかりません</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8F7FF] flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-8 h-8 border-3 border-[#5B4FD6] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[#8B85A8]">読み込み中...</p>
        </div>
      </div>
    );
  }

  const inProgress = missions.filter((m) => m.status === "進行中" || m.status === "in_progress");
  const notStarted = missions.filter((m) => m.status === "未着手" || m.status === "not_started");
  const completed = missions.filter((m) => m.status === "完了" || m.status === "completed");

  const MissionCard = ({ mission }: { mission: Mission }) => (
    <div className="bg-white p-4 rounded-xl shadow-sm">
      <h3 className="font-semibold text-[#1E1B3A] mb-2">{mission.title}</h3>

      <div className="text-xs text-[#8B85A8] mb-3">
        {mission.setDate && <p>開始: {mission.setDate}</p>}
        {mission.deadline && <p>期限: {mission.deadline}</p>}
      </div>

      {mission.purpose && (
        <div className="bg-[#F8F7FF] p-3 rounded-lg border border-[#E8E5F0] mb-3">
          <p className="text-xs font-semibold text-[#8B85A8] mb-1">背景・目的</p>
          <p className="text-sm text-[#1E1B3A]">{mission.purpose}</p>
        </div>
      )}

      {mission.reviewMemo && (
        <div className="bg-[#F8F7FF] p-3 rounded-lg border border-[#E8E5F0] mt-3">
          <p className="text-xs font-semibold text-[#8B85A8] mb-1">中間レビューメモ</p>
          <p className="text-sm text-[#1E1B3A]">{mission.reviewMemo}</p>
        </div>
      )}

      {mission.finalReview && (
        <div className="bg-[#E0F7E0] p-3 rounded-lg border border-[#22C55E] mt-3">
          <p className="text-xs font-semibold text-[#22C55E] mb-1">最終振り返り</p>
          <p className="text-sm text-[#1E1B3A]">{mission.finalReview}</p>
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
        {missions.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-[#8B85A8] mb-2">ミッションはまだ設定されていません</p>
            <p className="text-sm text-[#8B85A8]">マネージャーと相談して、ミッションを設定しましょう</p>
          </div>
        ) : (
          <div className="space-y-8">
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
