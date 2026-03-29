"use client";

import { useParams } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { useState, useEffect } from "react";

type LogEntry = {
  id: string;
  date: string;
  dayOfWeek: string;
  morningIntent: string;
  hmFeedback: string | null;
  managerComment: string | null;
  hasFeedback: boolean;
};

export default function FeedbackPage() {
  const params = useParams();
  const token = params.token as string;

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/logs?token=${token}`);
        if (res.ok) {
          const data = await res.json();
          setLogs(data.logs || []);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [token]);

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

  // Filter logs that have feedback or manager comments
  const logsWithFeedback = logs.filter(
    (log) => log.hmFeedback || log.managerComment
  );

  return (
    <div className="min-h-screen bg-[#F8F7FF] pb-24">
      {/* Header */}
      <div className="gradient-purple text-white p-6 rounded-b-3xl">
        <div className="max-w-md mx-auto">
          <h1 className="text-2xl font-bold">🎓 フィードバック</h1>
        </div>
      </div>

      <div className="max-w-md mx-auto px-6 pt-6 space-y-4">
        {logsWithFeedback.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-[#8B85A8]">フィードバックはまだありません</p>
          </div>
        ) : (
          <div className="space-y-4">
            {logsWithFeedback.map((log) => (
              <div key={log.id} className="bg-white p-4 rounded-xl shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-[#1E1B3A]">
                    {log.date} ({log.dayOfWeek})
                  </p>
                </div>
                <p className="text-xs text-[#8B85A8]">
                  朝の意図: {log.morningIntent}
                </p>

                {log.managerComment && (
                  <div className="bg-[#EDE9FF] p-3 rounded-lg">
                    <p className="text-xs font-semibold text-[#5B4FD6] mb-1">上司コメント</p>
                    <p className="text-sm text-[#1E1B3A] leading-relaxed">{log.managerComment}</p>
                  </div>
                )}

                {log.hmFeedback && (
                  <div className="bg-[#FFE8D0] p-3 rounded-lg">
                    <p className="text-xs font-semibold text-[#FF8C42] mb-1">HMフィードバック</p>
                    <p className="text-sm text-[#1E1B3A] leading-relaxed">{log.hmFeedback}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <BottomNav active="feedback" baseUrl={`/p/${token}`} />
    </div>
  );
}
