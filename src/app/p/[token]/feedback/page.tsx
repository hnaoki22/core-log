"use client";

import { useParams } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { useState, useEffect } from "react";

type FeedbackEntry = {
  id: string;
  participantName: string;
  authorName: string;
  type: "HMフィードバック" | "上司コメント";
  content: string;
  period: string;
  weekNum: number;
  date: string;
  isRead: boolean;
};

export default function FeedbackPage() {
  const params = useParams();
  const token = params.token as string;

  const [feedbacks, setFeedbacks] = useState<FeedbackEntry[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [badges, setBadges] = useState<{ feedback: number; mission: number }>({
    feedback: 0,
    mission: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch from new Feedback DB
        const fbRes = await fetch(`/api/feedback?token=${token}`);
        if (fbRes.ok) {
          const fbData = await fbRes.json();
          setFeedbacks(fbData.feedback || []);
          setUnreadCount(fbData.unreadCount || 0);
          setBadges((prev) => ({
            ...prev,
            feedback: fbData.unreadCount || 0,
          }));
        }

        // Also fetch badges from logs API for mission badge
        const logsRes = await fetch(`/api/logs?token=${token}`);
        if (logsRes.ok) {
          const logsData = await logsRes.json();
          if (logsData.badges) {
            setBadges((prev) => ({
              ...prev,
              mission: logsData.badges.mission || 0,
            }));
          }
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [token]);

  const markAsRead = async (feedbackId: string) => {
    try {
      await fetch("/api/feedback", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, feedbackId }),
      });
      setFeedbacks((prev) =>
        prev.map((f) => (f.id === feedbackId ? { ...f, isRead: true } : f))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
      setBadges((prev) => ({
        ...prev,
        feedback: Math.max(0, prev.feedback - 1),
      }));
    } catch {
      // silently fail
    }
  };

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

  return (
    <div className="min-h-screen bg-[#F8F7FF] pb-24">
      {/* Header */}
      <div className="gradient-purple text-white p-6 rounded-b-3xl">
        <div className="max-w-md mx-auto">
          <h1 className="text-2xl font-bold">フィードバック</h1>
          {unreadCount > 0 && (
            <p className="text-white/80 text-sm mt-1">
              未読 {unreadCount}件
            </p>
          )}
        </div>
      </div>

      <div className="max-w-md mx-auto px-6 pt-6 space-y-4">
        {feedbacks.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-[#8B85A8]">フィードバックはまだありません</p>
          </div>
        ) : (
          <div className="space-y-4">
            {feedbacks.map((fb) => {
              const isHM = fb.type === "HMフィードバック";
              return (
                <div
                  key={fb.id}
                  className={`bg-white p-4 rounded-xl shadow-sm space-y-3 ${
                    !fb.isRead ? "border-l-4 border-[#FF8C42]" : ""
                  }`}
                  onClick={() => {
                    if (!fb.isRead) markAsRead(fb.id);
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          isHM
                            ? "bg-[#FFE8D0] text-[#FF8C42]"
                            : "bg-[#EDE9FF] text-[#5B4FD6]"
                        }`}
                      >
                        {fb.type}
                      </span>
                      {!fb.isRead && (
                        <span className="bg-[#FF4444] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                          NEW
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#8B85A8]">{fb.date}</p>
                  </div>

                  {fb.period && (
                    <p className="text-xs text-[#8B85A8]">
                      対象: {fb.period}
                      {fb.weekNum > 0 && ` (第${fb.weekNum}週)`}
                    </p>
                  )}

                  <div
                    className={`p-3 rounded-lg ${
                      isHM ? "bg-[#FFE8D0]/50" : "bg-[#EDE9FF]/50"
                    }`}
                  >
                    <p className="text-xs text-[#8B85A8] mb-1">
                      from: {fb.authorName}
                    </p>
                    <p className="text-sm text-[#1E1B3A] leading-relaxed whitespace-pre-wrap">
                      {fb.content}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <BottomNav active="feedback" baseUrl={`/p/${token}`} badges={badges} />
    </div>
  );
}
