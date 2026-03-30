"use client";

import { useParams } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { useState, useEffect, useCallback } from "react";

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

type MissionComment = {
  id: string;
  authorName: string;
  authorRole: "manager" | "participant";
  body: string;
  createdAt: string;
};

export default function MissionPage() {
  const params = useParams();
  const token = params.token as string;

  const [missions, setMissions] = useState<Mission[]>([]);
  const [badges, setBadges] = useState<{ feedback: number; mission: number }>({ feedback: 0, mission: 0 });
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [expandedMission, setExpandedMission] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, MissionComment[]>>({});
  const [loadingComments, setLoadingComments] = useState<Record<string, boolean>>({});
  const [commentText, setCommentText] = useState<Record<string, string>>({});
  const [sendingComment, setSendingComment] = useState<Record<string, boolean>>({});

  useEffect(() => {
    async function fetchMissions() {
      try {
        const res = await fetch(`/api/logs?token=${token}`);
        if (!res.ok) {
          setNotFound(true);
          return;
        }
        const data = await res.json();
        if (data.missions) {
          setMissions(data.missions);
        }
        if (data.badges) setBadges(data.badges);
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchMissions();
  }, [token]);

  const fetchComments = useCallback(async (missionId: string) => {
    setLoadingComments((prev) => ({ ...prev, [missionId]: true }));
    try {
      const res = await fetch(`/api/mission/comments?missionId=${missionId}`);
      if (res.ok) {
        const data = await res.json();
        setComments((prev) => ({ ...prev, [missionId]: data.comments }));
      }
    } catch {
      // silently fail
    } finally {
      setLoadingComments((prev) => ({ ...prev, [missionId]: false }));
    }
  }, []);

  useEffect(() => {
    if (expandedMission && !comments[expandedMission]) {
      fetchComments(expandedMission);
    }
  }, [expandedMission, comments, fetchComments]);

  const handleSendComment = async (missionId: string) => {
    const text = commentText[missionId]?.trim();
    if (!text) return;
    setSendingComment((prev) => ({ ...prev, [missionId]: true }));

    try {
      const res = await fetch("/api/mission/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          missionId,
          comment: text,
        }),
      });

      if (res.ok) {
        setCommentText((prev) => ({ ...prev, [missionId]: "" }));
        await fetchComments(missionId);
      }
    } catch {
      // silently fail
    } finally {
      setSendingComment((prev) => ({ ...prev, [missionId]: false }));
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  };

  const formatCommentTime = (isoStr: string) => {
    const d = new Date(isoStr);
    const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    return `${jst.getMonth() + 1}/${jst.getDate()} ${jst.getHours()}:${String(jst.getMinutes()).padStart(2, "0")}`;
  };

  const getStatusStyle = (status: string) => {
    if (status === "完了" || status === "completed") return { bg: "bg-[#E0F7E0]", text: "text-[#22C55E]", dot: "#22C55E", label: "完了" };
    if (status === "進行中" || status === "in_progress") return { bg: "bg-[#EDE9FF]", text: "text-[#5B4FD6]", dot: "#5B4FD6", label: "進行中" };
    return { bg: "bg-gray-100", text: "text-[#8B85A8]", dot: "#8B85A8", label: "未着手" };
  };

  if (notFound) {
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

  const MissionCard = ({ mission }: { mission: Mission }) => {
    const statusStyle = getStatusStyle(mission.status);
    const isExpanded = expandedMission === mission.id;
    const missionComments = comments[mission.id] || [];
    const isLoadingComments = loadingComments[mission.id];

    return (
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {/* Header - Clickable */}
        <div
          className="p-4 cursor-pointer"
          onClick={() => setExpandedMission(isExpanded ? null : mission.id)}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="font-semibold text-[#1E1B3A] mb-2">{mission.title}</h3>
              <div className="flex gap-3 text-xs text-[#8B85A8]">
                {mission.setDate && <span>開始: {formatDate(mission.setDate)}</span>}
                {mission.deadline && <span>期限: {formatDate(mission.deadline)}</span>}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 ml-3">
              <span className={`text-xs px-2 py-0.5 rounded-full ${statusStyle.bg} ${statusStyle.text}`}>
                {statusStyle.label}
              </span>
              <span className="text-[#8B85A8] text-xs">{isExpanded ? "▲" : "▼"}</span>
            </div>
          </div>
        </div>

        {/* Expanded Content */}
        {isExpanded && (
          <div className="px-4 pb-4 space-y-3 border-t border-[#E8E5F0]">
            {/* Purpose */}
            {mission.purpose && (
              <div className="bg-[#F8F7FF] p-3 rounded-lg border border-[#E8E5F0] mt-3">
                <p className="text-xs font-semibold text-[#8B85A8] mb-1">背景・目的</p>
                <p className="text-sm text-[#1E1B3A]">{mission.purpose}</p>
              </div>
            )}

            {mission.reviewMemo && (
              <div className="bg-[#F8F7FF] p-3 rounded-lg border border-[#E8E5F0]">
                <p className="text-xs font-semibold text-[#8B85A8] mb-1">中間レビューメモ</p>
                <p className="text-sm text-[#1E1B3A]">{mission.reviewMemo}</p>
              </div>
            )}

            {mission.finalReview && (
              <div className="bg-[#E0F7E0] p-3 rounded-lg border border-[#22C55E]">
                <p className="text-xs font-semibold text-[#22C55E] mb-1">最終振り返り</p>
                <p className="text-sm text-[#1E1B3A]">{mission.finalReview}</p>
              </div>
            )}

            {/* Comments / Chat */}
            <div className="border-t border-[#E8E5F0] pt-3 mt-3">
              <h4 className="text-xs font-semibold text-[#8B85A8] mb-2">💬 コメント</h4>

              {isLoadingComments ? (
                <div className="text-xs text-[#8B85A8] text-center py-2">読み込み中...</div>
              ) : missionComments.length === 0 ? (
                <div className="text-xs text-[#C4BFD9] text-center py-2">まだコメントはありません</div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto mb-3">
                  {missionComments.map((c) => (
                    <div
                      key={c.id}
                      className={`p-2 rounded-lg text-xs ${
                        c.authorRole === "manager"
                          ? "bg-[#FFF8F0] ml-0 mr-4 border border-[#FFE0C0]"
                          : "bg-[#EDE9FF] ml-4 mr-0 border border-[#D4CEFF]"
                      }`}
                    >
                      <div className="flex items-center gap-1 mb-1">
                        <span className={`font-semibold ${c.authorRole === "manager" ? "text-[#FF8C42]" : "text-[#5B4FD6]"}`}>
                          {c.authorRole === "manager" ? "👔" : "👤"} {c.authorName}
                        </span>
                        <span className="text-[#C4BFD9] text-[10px]">{formatCommentTime(c.createdAt)}</span>
                      </div>
                      <p className="text-[#1E1B3A]">{c.body}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Comment Input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={commentText[mission.id] || ""}
                  onChange={(e) => setCommentText((prev) => ({ ...prev, [mission.id]: e.target.value }))}
                  placeholder="コメントを入力..."
                  className="flex-1 text-xs border border-[#E8E5F0] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#5B4FD6] bg-white"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendComment(mission.id);
                    }
                  }}
                />
                <button
                  onClick={() => handleSendComment(mission.id)}
                  disabled={sendingComment[mission.id] || !commentText[mission.id]?.trim()}
                  className="text-xs bg-[#5B4FD6] text-white rounded-lg px-3 py-2 hover:bg-[#4A3FBF] disabled:opacity-50 transition-colors"
                >
                  {sendingComment[mission.id] ? "..." : "送信"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F8F7FF] pb-24">
      {/* Header */}
      <div className="gradient-purple text-white p-6 rounded-b-3xl">
        <div className="max-w-md mx-auto">
          <h1 className="text-2xl font-bold">🎯 ミッション</h1>
          <p className="text-white/70 text-sm mt-1">上司と共有するミッションと進捗</p>
        </div>
      </div>

      <div className="max-w-md mx-auto px-6 pt-6">
        {missions.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">🎯</div>
            <p className="text-[#8B85A8] mb-2">ミッションはまだ設定されていません</p>
            <p className="text-sm text-[#C4BFD9]">上司がミッションを設定すると、ここに表示されます</p>
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

      <BottomNav active="mission" baseUrl={`/p/${token}`} badges={badges} />
    </div>
  );
}
