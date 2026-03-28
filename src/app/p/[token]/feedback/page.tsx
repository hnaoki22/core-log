"use client";

import { useParams } from "next/navigation";
import { getParticipantByToken } from "@/lib/mock-data";
import { BottomNav } from "@/components/BottomNav";

export default function FeedbackPage() {
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

  return (
    <div className="min-h-screen bg-[#F8F7FF] pb-24">
      {/* Header */}
      <div className="gradient-purple text-white p-6 rounded-b-3xl">
        <div className="max-w-md mx-auto">
          <h1 className="text-2xl font-bold">🎓 フィードバック</h1>
        </div>
      </div>

      <div className="max-w-md mx-auto px-6 pt-6 space-y-4">
        {participant.feedbacks.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-[#8B85A8]">フィードバックはまだありません</p>
          </div>
        ) : (
          <>
            {/* Latest Feedback */}
            {participant.feedbacks[0] && (
              <div className="gradient-orange text-white p-6 rounded-xl shadow-md relative">
                {participant.feedbacks[0].isNew && (
                  <div className="absolute top-4 right-4 bg-[#22C55E] text-white text-xs font-bold px-3 py-1 rounded-full">
                    NEW
                  </div>
                )}
                <p className="text-sm opacity-90 mb-2">{participant.feedbacks[0].weekLabel}</p>
                <p className="text-base leading-relaxed mb-4">{participant.feedbacks[0].body}</p>

                <div className="bg-white/20 backdrop-blur-sm p-4 rounded-lg">
                  <p className="text-xs opacity-90 mb-2 font-semibold">Feedforward</p>
                  <p className="text-sm">{participant.feedbacks[0].feedforward}</p>
                </div>
              </div>
            )}

            {/* Manager Comments */}
            {participant.managerComments.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-[#8B85A8] px-1">マネージャーコメント</p>
                {participant.managerComments.map((comment) => (
                  <div key={comment.id} className="bg-white p-4 rounded-xl shadow-sm">
                    <div className="flex items-start justify-between mb-2">
                      <p className="font-semibold text-[#1E1B3A]">{comment.managerName}</p>
                      <p className="text-xs text-[#8B85A8]">{comment.date}</p>
                    </div>
                    <p className="text-sm text-[#1E1B3A] leading-relaxed">{comment.body}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Past Feedbacks */}
            {participant.feedbacks.length > 1 && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-[#8B85A8] px-1 pt-4">過去のフィードバック</p>
                {participant.feedbacks.slice(1).map((fb, index) => (
                  <div
                    key={fb.id}
                    className="bg-white p-4 rounded-xl shadow-sm"
                    style={{ opacity: 1 - (index + 1) * 0.15 }}
                  >
                    <p className="text-sm font-semibold text-[#1E1B3A] mb-1">{fb.weekLabel}</p>
                    <p className="text-sm text-[#1E1B3A] line-clamp-2 mb-2">{fb.body}</p>
                    <p className="text-xs text-[#8B85A8]">{fb.feedforward}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <BottomNav active="feedback" baseUrl={`/p/${token}`} />
    </div>
  );
}