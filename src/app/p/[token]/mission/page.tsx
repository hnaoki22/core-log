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
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [closingMission, setClosingMission] = useState<string | null>(null);
  const [closeReview, setCloseReview] = useState("");

  useEffect(() => {
    async function fetchMissions() {
      try {
        const res = await fetch(`/api/logs?token=${token}`);
        if (!res.ok) { setNotFound(true); return; }
        const data = await res.json();
        if (data.missions) setMissions(data.missions);
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
        body: JSON.stringify({ token, missionId, comment: text }),
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

  const handleStatusChange = async (missionId: string, newStatus: string, review?: string) => {
    setUpdatingStatus(missionId);
    try {
      const res = await fetch("/api/mission", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, missionId, status: newStatus, finalReview: review }),
      });
      if (res.ok) {
        setMissions((prev) =>
          prev.map((m) =>
            m.id === missionId ? { ...m, status: newStatus, finalReview: review || m.finalReview } : m
          )
        );
        setClosingMission(null);
        setCloseReview("");
      }
    } catch {
      // silently fail
    } finally {
      setUpdatingStatus(null);
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
    if (status === "完了" || status === "completed") return { bg: "bg-emerald-50", text: "text-emerald-600", dot: "bg-emerald-500", label: "完了" };
    if (status === "進行中" || status === "in_progress") return { bg: "bg-indigo-50", text: "text-[#4338CA]", dot: "bg-[#4338CA]", label: "進行中" };
    return { bg: "bg-gray-50", text: "text-[#9CA3AF]", dot: "bg-[#D1D5DB]", label: "未着手" };
  };

  if (notFound) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-6">
        <p className="text-[#6B7280] text-sm">ページを読み込めませんでした</p>
      </div>
    );
  }

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

  const inProgress = missions.filter((m) => m.status === "進行中" || m.status === "in_progress");
  const notStarted = missions.filter((m) => m.status === "未着手" || m.status === "not_started");
  const completed = missions.filter((m) => m.status === "完了" || m.status === "completed");

  const MissionCard = ({ mission }: { mission: Mission }) => {
    const statusStyle = getStatusStyle(mission.status);
    const isExpanded = expandedMission === mission.id;
    const missionComments = comments[mission.id] || [];
    const isLoadingComments = loadingComments[mission.id];

    return (
      <div className="card overflow-hidden">
        <div
          className="p-4 cursor-pointer hover:bg-[#FAFAFA] transition-colors"
          onClick={() => setExpandedMission(isExpanded ? null : mission.id)}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="font-medium text-sm text-[#111827] mb-2 leading-snug">{mission.title}</h3>
              <div className="flex gap-3 text-[11px] text-[#9CA3AF]">
                {mission.setDate && <span>開始: {formatDate(mission.setDate)}</span>}
                {mission.deadline && <span>期限: {formatDate(mission.deadline)}</span>}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5 ml-3">
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${statusStyle.bg} ${statusStyle.text}`}>
                {statusStyle.label}
              </span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className={`transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}>
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </div>
          </div>
        </div>

        {isExpanded && (
          <div className="px-4 pb-4 space-y-3 border-t border-[#F3F4F6]">
            {mission.purpose && (
              <div className="bg-[#F9FAFB] p-3 rounded-xl border border-[#F3F4F6] mt-3">
                <p className="text-[10px] font-medium text-[#9CA3AF] tracking-wide uppercase mb-1">背景・目的</p>
                <p className="text-sm text-[#374151] leading-relaxed">{mission.purpose}</p>
              </div>
            )}

            {mission.reviewMemo && (
              <div className="bg-[#F9FAFB] p-3 rounded-xl border border-[#F3F4F6]">
                <p className="text-[10px] font-medium text-[#9CA3AF] tracking-wide uppercase mb-1">中間レビューメモ</p>
                <p className="text-sm text-[#374151] leading-relaxed">{mission.reviewMemo}</p>
              </div>
            )}

            {mission.finalReview && (
              <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100">
                <p className="text-[10px] font-medium text-emerald-600 tracking-wide uppercase mb-1">最終振り返り</p>
                <p className="text-sm text-[#374151] leading-relaxed">{mission.finalReview}</p>
              </div>
            )}

            {/* Status Actions */}
            <div className="flex gap-2 mt-3">
              {(mission.status !== "完了" && mission.status !== "completed") ? (
                <>
                  {mission.status === "未着手" || mission.status === "not_started" ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleStatusChange(mission.id, "進行中"); }}
                      disabled={updatingStatus === mission.id}
                      className="text-xs bg-[#4338CA] text-white px-3.5 py-2 rounded-xl hover:bg-[#3730A3] disabled:opacity-50 transition-colors"
                    >
                      {updatingStatus === mission.id ? "更新中..." : "着手する"}
                    </button>
                  ) : null}
                  {closingMission !== mission.id ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); setClosingMission(mission.id); }}
                      className="text-xs bg-emerald-600 text-white px-3.5 py-2 rounded-xl hover:bg-emerald-700 transition-colors"
                    >
                      完了にする
                    </button>
                  ) : (
                    <div className="w-full space-y-2">
                      <textarea
                        value={closeReview}
                        onChange={(e) => setCloseReview(e.target.value)}
                        placeholder="振り返りコメント（任意）"
                        className="w-full text-xs border border-[#E5E7EB] rounded-xl p-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 bg-white transition-all"
                        rows={2}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={(e) => { e.stopPropagation(); setClosingMission(null); setCloseReview(""); }}
                          className="text-xs text-[#9CA3AF] px-2 py-1"
                        >
                          キャンセル
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleStatusChange(mission.id, "完了", closeReview); }}
                          disabled={updatingStatus === mission.id}
                          className="text-xs bg-emerald-600 text-white rounded-xl px-3 py-1.5 hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                        >
                          {updatingStatus === mission.id ? "更新中..." : "完了にする"}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); handleStatusChange(mission.id, "進行中"); }}
                  disabled={updatingStatus === mission.id}
                  className="text-xs bg-[#4338CA] text-white px-3.5 py-2 rounded-xl hover:bg-[#3730A3] disabled:opacity-50 transition-colors"
                >
                  {updatingStatus === mission.id ? "更新中..." : "再開する"}
                </button>
              )}
            </div>

            {/* Comments */}
            <div className="border-t border-[#F3F4F6] pt-3 mt-3">
              <h4 className="text-[10px] font-medium text-[#9CA3AF] tracking-wide uppercase mb-2">コメント</h4>

              {isLoadingComments ? (
                <div className="text-xs text-[#D1D5DB] text-center py-2">読み込み中...</div>
              ) : missionComments.length === 0 ? (
                <div className="text-xs text-[#D1D5DB] text-center py-2">まだコメントはありません</div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto mb-3">
                  {missionComments.map((c) => (
                    <div
                      key={c.id}
                      className={`p-2.5 rounded-xl text-xs ${
                        c.authorRole === "manager"
                          ? "bg-amber-50 ml-0 mr-4 border border-amber-100"
                          : "bg-indigo-50 ml-4 mr-0 border border-indigo-100"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={`font-medium ${c.authorRole === "manager" ? "text-amber-600" : "text-[#4338CA]"}`}>
                          {c.authorName}
                        </span>
                        <span className="text-[#D1D5DB] text-[10px]">{formatCommentTime(c.createdAt)}</span>
                      </div>
                      <p className="text-[#374151] leading-relaxed">{c.body}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <input
                  type="text"
                  value={commentText[mission.id] || ""}
                  onChange={(e) => setCommentText((prev) => ({ ...prev, [mission.id]: e.target.value }))}
                  placeholder="コメントを入力..."
                  className="flex-1 text-xs border border-[#E5E7EB] rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#4338CA]/10 focus:border-[#4338CA] bg-white transition-all"
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
                  className="text-xs bg-[#111827] text-white rounded-xl px-3.5 py-2.5 hover:bg-[#1F2937] disabled:bg-[#D1D5DB] disabled:text-[#9CA3AF] transition-colors"
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
    <div className="min-h-screen bg-[#F9FAFB] pb-24">
      {/* Header */}
      <div className="gradient-header text-white px-6 pt-12 pb-6 rounded-b-[2rem]">
        <div className="max-w-md mx-auto relative z-10">
          <h1 className="text-xl font-semibold tracking-tight">ミッション</h1>
          <p className="text-indigo-200 text-sm mt-1 font-light">上司と共有するミッションと進捗</p>
        </div>
      </div>

      <div className="max-w-md mx-auto px-5 pt-5 animate-fade-up relative z-10">
        {missions.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-12 h-12 bg-[#F3F4F6] rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
              </svg>
            </div>
            <p className="text-[#6B7280] text-sm mb-1">ミッションはまだ設定されていません</p>
            <p className="text-xs text-[#D1D5DB]">上司がミッションを設定すると、ここに表示されます</p>
          </div>
        ) : (
          <div className="space-y-6">
            {inProgress.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-[#6B7280] tracking-wide uppercase mb-3 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-[#4338CA] rounded-full"></div>
                  進行中 ({inProgress.length})
                </h2>
                <div className="space-y-2">
                  {inProgress.map((mission) => <MissionCard key={mission.id} mission={mission} />)}
                </div>
              </section>
            )}

            {notStarted.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-[#6B7280] tracking-wide uppercase mb-3 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-[#D1D5DB] rounded-full"></div>
                  未着手 ({notStarted.length})
                </h2>
                <div className="space-y-2">
                  {notStarted.map((mission) => <MissionCard key={mission.id} mission={mission} />)}
                </div>
              </section>
            )}

            {completed.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-[#6B7280] tracking-wide uppercase mb-3 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
                  完了 ({completed.length})
                </h2>
                <div className="space-y-2">
                  {completed.map((mission) => <MissionCard key={mission.id} mission={mission} />)}
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
