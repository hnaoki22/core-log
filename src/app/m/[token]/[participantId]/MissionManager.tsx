"use client";

import { useState, useEffect, useCallback } from "react";

type Mission = {
  id: string;
  title: string;
  participantName: string;
  setDate: string;
  deadline: string;
  status: string;
  purpose: string | null;
  reviewMemo: string | null;
  finalReview: string | null;
  createdBy: string | null;
};

type MissionComment = {
  id: string;
  authorName: string;
  authorRole: "manager" | "participant";
  body: string;
  createdAt: string;
};

type Props = {
  token: string;
  participantName: string;
  initialMissions: Mission[];
};

export default function MissionManager({ token, participantName, initialMissions }: Props) {
  const [missions, setMissions] = useState<Mission[]>(initialMissions);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [expandedMission, setExpandedMission] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, MissionComment[]>>({});
  const [loadingComments, setLoadingComments] = useState<Record<string, boolean>>({});

  // Create form state
  const [newTitle, setNewTitle] = useState("");
  const [newPurpose, setNewPurpose] = useState("");
  const [newDeadline, setNewDeadline] = useState("");
  const [creating, setCreating] = useState(false);

  // Comment form state
  const [commentText, setCommentText] = useState<Record<string, string>>({});
  const [sendingComment, setSendingComment] = useState<Record<string, boolean>>({});

  // Close/reopen state
  const [closingMission, setClosingMission] = useState<string | null>(null);
  const [closeReview, setCloseReview] = useState("");

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

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);

    try {
      const res = await fetch("/api/mission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          participantName,
          title: newTitle.trim(),
          purpose: newPurpose.trim(),
          deadline: newDeadline,
        }),
      });

      if (res.ok) {
        // Refresh missions
        const refreshRes = await fetch(`/api/mission?participantName=${encodeURIComponent(participantName)}`);
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          setMissions(data.missions);
        }
        setNewTitle("");
        setNewPurpose("");
        setNewDeadline("");
        setShowCreateForm(false);
      }
    } catch {
      // silently fail
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = async (missionId: string, newStatus: string, review?: string) => {
    try {
      const res = await fetch("/api/mission", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          missionId,
          status: newStatus,
          finalReview: review,
        }),
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
    }
  };

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

  const getStatusStyle = (status: string) => {
    if (status === "完了" || status === "completed") return { bg: "bg-green-100", text: "text-green-700", label: "完了" };
    if (status === "進行中" || status === "in_progress") return { bg: "bg-blue-100", text: "text-blue-700", label: "進行中" };
    return { bg: "bg-gray-100", text: "text-gray-600", label: "未着手" };
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

  const activeMissions = missions.filter((m) => m.status !== "完了" && m.status !== "completed");
  const completedMissions = missions.filter((m) => m.status === "完了" || m.status === "completed");

  return (
    <section className="bg-white rounded-xl shadow-sm">
      {/* Header */}
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-500 flex items-center gap-2">
          🎯 ミッション管理
        </h2>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="text-xs bg-[#1A1A2E] text-white px-3 py-1.5 rounded-lg hover:bg-[#141423] transition-colors"
        >
          + 新規ミッション
        </button>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <div className="p-4 bg-[#F5F0EB] border-b border-gray-100">
          <h3 className="text-sm font-semibold text-[#1A1A2E] mb-3">新しいミッションを設定</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">ミッション名 *</label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="例: Q3営業戦略の提案書を自力で完成させる"
                className="w-full text-sm border border-gray-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-[#1A1A2E] bg-white"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">背景・目的</label>
              <textarea
                value={newPurpose}
                onChange={(e) => setNewPurpose(e.target.value)}
                placeholder="このミッションを設定する背景や、達成に向けた期待を記入"
                className="w-full text-sm border border-gray-200 rounded-lg p-2 resize-none focus:outline-none focus:ring-2 focus:ring-[#1A1A2E] bg-white"
                rows={3}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">達成期限</label>
              <input
                type="date"
                value={newDeadline}
                onChange={(e) => setNewDeadline(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-[#1A1A2E] bg-white"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowCreateForm(false); setNewTitle(""); setNewPurpose(""); setNewDeadline(""); }}
                className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5"
              >
                キャンセル
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !newTitle.trim()}
                className="text-xs bg-[#1A1A2E] text-white rounded-lg px-4 py-1.5 hover:bg-[#141423] disabled:opacity-50"
              >
                {creating ? "作成中..." : "ミッションを設定"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mission List */}
      <div className="divide-y divide-gray-50">
        {missions.length === 0 && !showCreateForm && (
          <div className="p-6 text-center text-gray-400 text-sm">
            ミッションはまだ設定されていません
          </div>
        )}

        {/* Active Missions */}
        {activeMissions.map((mission) => {
          const statusStyle = getStatusStyle(mission.status);
          const isExpanded = expandedMission === mission.id;
          const missionComments = comments[mission.id] || [];
          const isLoadingComments = loadingComments[mission.id];
          const isClosing = closingMission === mission.id;

          return (
            <div key={mission.id} className="p-4">
              {/* Mission Header */}
              <div
                className="flex items-start justify-between cursor-pointer"
                onClick={() => setExpandedMission(isExpanded ? null : mission.id)}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusStyle.bg} ${statusStyle.text}`}>
                      {statusStyle.label}
                    </span>
                    {mission.createdBy && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                        mission.createdBy === "上司設定" ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"
                      }`}>
                        {mission.createdBy}
                      </span>
                    )}
                    <h3 className="font-medium text-[#1A1A2E] text-sm">{mission.title}</h3>
                  </div>
                  <div className="flex gap-3 text-xs text-gray-400 mt-1">
                    {mission.setDate && <span>開始: {formatDate(mission.setDate)}</span>}
                    {mission.deadline && <span>期限: {formatDate(mission.deadline)}</span>}
                  </div>
                </div>
                <span className="text-gray-400 text-xs ml-2">{isExpanded ? "▲" : "▼"}</span>
              </div>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="mt-3 space-y-3">
                  {/* Purpose */}
                  {mission.purpose && (
                    <div className="bg-[#F5F0EB] p-3 rounded-lg">
                      <p className="text-xs font-semibold text-gray-400 mb-1">背景・目的</p>
                      <p className="text-sm text-[#1A1A2E]">{mission.purpose}</p>
                    </div>
                  )}

                  {/* Close/Reopen Actions */}
                  <div className="flex gap-2">
                    {mission.status !== "完了" && mission.status !== "completed" ? (
                      <>
                        {!isClosing ? (
                          <button
                            onClick={() => setClosingMission(mission.id)}
                            className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700"
                          >
                            ミッション完了
                          </button>
                        ) : (
                          <div className="w-full space-y-2">
                            <textarea
                              value={closeReview}
                              onChange={(e) => setCloseReview(e.target.value)}
                              placeholder="最終振り返りコメント（任意）"
                              className="w-full text-xs border rounded-lg p-2 resize-none focus:outline-none focus:ring-2 focus:ring-green-400 bg-white"
                              rows={2}
                            />
                            <div className="flex gap-2 justify-end">
                              <button
                                onClick={() => { setClosingMission(null); setCloseReview(""); }}
                                className="text-xs text-gray-500 px-2 py-1"
                              >
                                キャンセル
                              </button>
                              <button
                                onClick={() => handleStatusChange(mission.id, "完了", closeReview)}
                                className="text-xs bg-green-600 text-white rounded-lg px-3 py-1 hover:bg-green-700"
                              >
                                完了にする
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <button
                        onClick={() => handleStatusChange(mission.id, "進行中")}
                        className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700"
                      >
                        再開する
                      </button>
                    )}
                  </div>

                  {/* Comments / Chat */}
                  <div className="border-t border-gray-100 pt-3">
                    <h4 className="text-xs font-semibold text-gray-400 mb-2">💬 コメント</h4>

                    {isLoadingComments ? (
                      <div className="text-xs text-gray-400 text-center py-2">読み込み中...</div>
                    ) : missionComments.length === 0 ? (
                      <div className="text-xs text-gray-300 text-center py-2">まだコメントはありません</div>
                    ) : (
                      <div className="space-y-2 max-h-60 overflow-y-auto mb-3">
                        {missionComments.map((c) => (
                          <div
                            key={c.id}
                            className={`p-2 rounded-lg text-xs ${
                              c.authorRole === "manager"
                                ? "bg-blue-50 ml-0 mr-4"
                                : "bg-gray-50 ml-4 mr-0"
                            }`}
                          >
                            <div className="flex items-center gap-1 mb-1">
                              <span className={`font-semibold ${c.authorRole === "manager" ? "text-blue-700" : "text-[#1A1A2E]"}`}>
                                {c.authorRole === "manager" ? "👔" : "👤"} {c.authorName}
                              </span>
                              <span className="text-gray-300 text-[10px]">{formatCommentTime(c.createdAt)}</span>
                            </div>
                            <p className="text-gray-700">{c.body}</p>
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
                        className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1A1A2E] bg-white"
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
                        className="text-xs bg-[#1A1A2E] text-white rounded-lg px-3 py-2 hover:bg-[#141423] disabled:opacity-50"
                      >
                        {sendingComment[mission.id] ? "..." : "送信"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Completed Missions */}
        {completedMissions.length > 0 && (
          <div className="p-4">
            <h3 className="text-xs font-semibold text-gray-400 mb-2">完了済みミッション ({completedMissions.length})</h3>
            <div className="space-y-2">
              {completedMissions.map((mission) => (
                <div
                  key={mission.id}
                  className="flex items-center justify-between p-2 bg-gray-50 rounded-lg cursor-pointer"
                  onClick={() => setExpandedMission(expandedMission === mission.id ? null : mission.id)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">完了</span>
                    {mission.createdBy && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                        mission.createdBy === "上司設定" ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"
                      }`}>
                        {mission.createdBy}
                      </span>
                    )}
                    <span className="text-sm text-gray-500 line-through">{mission.title}</span>
                  </div>
                  <span className="text-gray-400 text-xs">{expandedMission === mission.id ? "▲" : "▼"}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
