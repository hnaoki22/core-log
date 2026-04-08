"use client";

import { useParams } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { useState, useEffect } from "react";
import { useFeatures } from "@/lib/use-features";

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
  const [badges, setBadges] = useState<{ feedback: number; mission: number }>({ feedback: 0, mission: 0 });
  const [loading, setLoading] = useState(true);
  const { isOn, loaded: featuresLoaded } = useFeatures();
  const fbOn = !featuresLoaded || isOn("feature.managerFeedback");

  useEffect(() => {
    async function fetchData() {
      try {
        const fbRes = await fetch(`/api/feedback?token=${token}`);
        if (fbRes.ok) {
          const fbData = await fbRes.json();
          setFeedbacks(fbData.feedback || []);
          setUnreadCount(fbData.unreadCount || 0);
          setBadges((prev) => ({ ...prev, feedback: fbData.unreadCount || 0 }));
        }
        const logsRes = await fetch(`/api/logs?token=${token}`);
        if (logsRes.ok) {
          const logsData = await logsRes.json();
          if (logsData.badges) {
            setBadges((prev) => ({ ...prev, mission: logsData.badges.mission || 0 }));
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
      setFeedbacks((prev) => prev.map((f) => (f.id === feedbackId ? { ...f, isRead: true } : f)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
      setBadges((prev) => ({ ...prev, feedback: Math.max(0, prev.feedback - 1) }));
    } catch {
      // silently fail
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#4338CA] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[#9CA3AF] text-sm">データを準備しています...</p>
        </div>
      </div>
    );
  }

  if (featuresLoaded && !fbOn) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-6 pb-24">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <h2 className="text-base font-semibold text-[#111827] mb-2">フィードバック機能は現在オフです</h2>
          <p className="text-sm text-[#6B7280] leading-relaxed">
            まずは自由に記入を続けることで、自分なりの気づきや学びを得る期間です。<br />
            しばらく継続したあとで、この機能が有効化されます。
          </p>
        </div>
        <BottomNav active="feedback" baseUrl={`/p/${token}`} badges={badges} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB] pb-24">
      {/* Header */}
      <div className="gradient-header text-white px-6 pt-12 pb-6 rounded-b-[2rem]">
        <div className="max-w-md mx-auto relative z-10">
          <h1 className="text-xl font-semibold tracking-tight">フィードバック</h1>
          {unreadCount > 0 && (
            <p className="text-indigo-200 text-sm mt-1 font-light">未読 {unreadCount}件</p>
          )}
        </div>
      </div>

      <div className="max-w-md mx-auto px-5 pt-5 space-y-3 animate-fade-up relative z-10">
        {feedbacks.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-12 h-12 bg-[#F3F4F6] rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <p className="text-[#6B7280] text-sm">フィードバックはまだありません</p>
          </div>
        ) : (
          <div className="space-y-3">
            {feedbacks.map((fb) => {
              const isHM = fb.type === "HMフィードバック";
              return (
                <div
                  key={fb.id}
                  className={`card p-4 space-y-3 transition-all ${
                    !fb.isRead ? "border-l-[3px] border-l-[#4338CA] bg-white" : "bg-white"
                  }`}
                  onClick={() => {
                    if (!fb.isRead) markAsRead(fb.id);
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                        isHM ? "bg-amber-50 text-amber-600" : "bg-indigo-50 text-[#4338CA]"
                      }`}>
                        {fb.type}
                      </span>
                      {!fb.isRead && (
                        <span className="bg-[#DC2626] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md">
                          NEW
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#9CA3AF]">{fb.date}</p>
                  </div>

                  {fb.period && (
                    <p className="text-[11px] text-[#9CA3AF]">
                      対象: {fb.period}
                      {fb.weekNum > 0 && ` (第${fb.weekNum}週)`}
                    </p>
                  )}

                  <div className={`p-3 rounded-xl ${isHM ? "bg-amber-50/50" : "bg-indigo-50/50"}`}>
                    <p className="text-[11px] text-[#9CA3AF] mb-1.5">from: {fb.authorName}</p>
                    <p className="text-sm text-[#374151] leading-relaxed whitespace-pre-wrap">{fb.content}</p>
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
