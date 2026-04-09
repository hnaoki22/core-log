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
  createdBy: string | null;
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
  const [participantName, setParticipantName] = useState("");
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
  const [missionsWithManagerComments, setMissionsWithManagerComments] = useState<Set<string>>(new Set());

  // Create form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newPurpose, setNewPurpose] = useState("");
  const [newDeadline, setNewDeadline] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    async function fetchMissions() {
      try {
        const res = await fetch(`/api/logs?token=${token}`);
        if (!res.ok) { setNotFound(true); return; }
        const data = await res.json();
        if (data.missions) {
          setMissions(data.missions);
          // Check which missions have manager comments in the last 7 days
          const withManagerComments = new Set<string>();
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

          for (const mission of data.missions) {
            try {
              const commentsRes = await fetch(`/api/mission/comments?missionId=${mission.id}`);
              if (commentsRes.ok) {
                const commentsData = await commentsRes.json();
                const hasManagerComment = commentsData.comments?.some(
                  (c: { authorRole: string; createdAt: string }) => {
                    return c.authorRole === "manager" && new Date(c.createdAt) >= sevenDaysAgo;
                  }
                );
                if (hasManagerComment) {
                  withManagerComments.add(mission.id);
                }
              }
            } catch {
              // silently fail for individual mission
            }
          }
          setMissionsWithManagerComments(withManagerComments);
        }
        if (data.badges) setBadges(data.badges);
        if (data.participant?.name) setParticipantName(data.participant.name);
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
        const refreshRes = await fetch(`/api/logs?token=${token}`);
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          if (data.missions) setMissions(data.missions);
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
    if (status === "進行中" || status === "in_progress") return { bg: "bg-indigo-50", text: "text-[#1A1A2E]", dot: "bg-[#1A1A2E]", label: "進行中" };
    return { bg: "bg-gray-50", text: "text-[#8B8489]", dot: "bg-[#C9BDAE]", label: "未着手" };
  };

  if (notFound) {
    return (
      <div className="min-h-screen bg-[#F5F0EB] flex items-center justify-center p-6">
        <p className="text-[#5B5560] text-sm">ページを読み込めませんでした</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F0EB] flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#1A1A2E] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[#8B8489] text-sm">データを準備しています...</p>
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
          className="p-4 cursor-pointer hover:bg-[#FBF8F4] transition-colors"
          onClick={() => setExpandedMission(isExpanded ? null : mission.id)}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="font-medium text-sm text-[#1A1A2E] mb-2 leading-snug">{mission.title}</h3>
              <div className="flex gap-3 text-[11px] text-[#8B8489]">
                {mission.setDate && <span>開始: {formatDate(mission.setDate)}</span>}
                {mission.deadline && <span>期限: {formatDate(mission.deadline)}</span>}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5 ml-3">
              <div className="flex items-center gap-1.5 relative">
                {mission.createdBy && (
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${
                    mission.createdBy === "上司設定" ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"
                  }`}>
                    {mission.createdBy}
                  </span>
                )}
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${statusStyle.bg} ${statusStyle.text}`}>
                  {statusStyle.label}
                </span>
                {missionsWithManagerComments.has(mission.id) && (
                  <div className="absolute -top-1 -right-1 w-2 h-2 bg-[#1A1A2E] rounded-full"></div>
                )}
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C9BDAE" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className={`transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}>
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </div>
          </div>
        </div>

        {isExpanded && (
          <div className="px-4 pb-4 space-y-3 border-t border-[#EFE8DD]">
            {mission.purpose && (
              <div className="bg-[#F5F0EB] p-3 rounded-xl border border-[#EFE8DD] mt-3">
                <p className="text-[10px] font-medium text-[#8B8489] tracking-wide uppercase mb-1">背景・目的</p>
                <p className="text-sm text-[#2C2C4A] leading-relaxed">{mission.purpose}</p>
              </div>
            )}

            {mission.reviewMemo && (
              <div className="bg-[#F5F0EB] p-3 rounded-xl border border-[#EFE8DD]">
                <p className="text-[10px] font-medium text-[#8B8489] tracking-wide uppercase mb-1">中間レビューメモ</p>
                <p className="text-sm text-[#2C2C4A] leading-relaxed">{mission.reviewMemo}</p>
              </div>
            )}

            {mission.finalReview && (
              <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100">
                <p className="text-[10px] font-medium text-emerald-600 tracking-wide uppercase mb-1">最終振り返り</p>
                <p className="text-sm text-[#2C2C4A] leading-relaxed">{mission.finalReview}</p>
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
                      className="text-xs bg-[#1A1A2E] text-white px-3.5 py-2 rounded-xl hover:bg-[#141423] disabled:opacity-50 transition-colors"
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
                        className="w-full text-xs border border-[#E5DCD0] rounded-xl p-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 bg-white transition-all"
                        rows={2}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={(e) => { e.stopPropagation(); setClosingMission(null); setCloseReview(""); }}
                          className="text-xs text-[#8B8489] px-2 py-1"
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
                  className="text-xs bg-[#1A1A2E] text-white px-3.5 py-2 rounded-xl hover:bg-[#141423] disabled:opacity-50 transition-colors"
                >
                  {updatingStatus === mission.id ? "更新中..." : "再開する"}
                </button>
              )}
            </div>

            {/* Comments */}
            <div className="border-t border-[#EFE8DD] pt-3 mt-3">
              <h4 className="text-[10px] font-medium text-[#8B8489] tracking-wide uppercase mb-2">コメント</h4>

              {isLoadingComments ? (
                <div className="text-xs text-[#C9BDAE] text-center py-2">読み込み中...</div>
              ) : missionComments.length === 0 ? (
                <div className="text-xs text-[#C9BDAE] text-center py-2">まだコメントはありません</div>
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
                        <span className={`font-medium ${c.authorRole === "manager" ? "text-amber-600" : "text-[#1A1A2E]"}`}>
                          {c.authorName}
                        </span>
                        <span className="text-[#C9BDAE] text-[10px]">{formatCommentTime(c.createdAt)}</span>
                      </div>
                      <p className="text-[#2C2C4A] leading-relaxed">{c.body}</p>
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
                  className="flex-1 text-xs border border-[#E5DCD0] rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#1A1A2E]/10 focus:border-[#1A1A2E] bg-white transition-all"
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
                  className="text-xs bg-[#1A1A2E] text-white rounded-xl px-3.5 py-2.5 hover:bg-[#141423] disabled:bg-[#C9BDAE] disabled:text-[#8B8489] transition-colors"
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
    <div className="min-h-screen bg-[#F5F0EB] pb-24">
      {/* Header */}
      <div className="gradient-header text-white px-6 pt-12 pb-6 rounded-b-[2rem]">
        <div className="max-w-md mx-auto relative z-10">
          <h1 className="text-xl font-semibold tracking-tight">ミッション</h1>
          <p className="text-indigo-200 text-sm mt-1 font-light">上司と共有するミッションと進捗</p>
        </div>
      </div>

      <div className="max-w-md mx-auto px-5 pt-5 animate-fade-up relative z-10">
        {/* New Mission Button */}
        {!showCreateForm && (
          <button
            onClick={() => setShowCreateForm(true)}
            className="w-full mb-5 flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-[#E5DCD0] text-sm text-[#5B5560] hover:border-[#1A1A2E] hover:text-[#1A1A2E] transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            新しいミッションを設定
          </button>
        )}

        {/* Create Form */}
        {showCreateForm && (
          <div className="card p-5 mb-5">
            <h3 className="font-semibold text-sm text-[#1A1A2E] mb-4">新しいミッションを設定</h3>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-medium text-[#8B8489] tracking-wide uppercase block mb-1.5">ミッション名 *</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="例: Q3営業戦略の提案書を自力で完成させる"
                  className="w-full text-sm border border-[#E5DCD0] rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#1A1A2E]/10 focus:border-[#1A1A2E] bg-white transition-all"
                />
              </div>
              <div>
                <label className="text-[10px] font-medium text-[#8B8489] tracking-wide uppercase block mb-1.5">背景・目的</label>
                <textarea
                  value={newPurpose}
                  onChange={(e) => setNewPurpose(e.target.value)}
                  placeholder="このミッションを設定する背景や、達成に向けた期待を記入"
                  className="w-full text-sm border border-[#E5DCD0] rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-[#1A1A2E]/10 focus:border-[#1A1A2E] bg-white transition-all"
                  rows={3}
                />
              </div>
              <div>
                <label className="text-[10px] font-medium text-[#8B8489] tracking-wide uppercase block mb-1.5">達成期限</label>
                <input
                  type="date"
                  value={newDeadline}
                  onChange={(e) => setNewDeadline(e.target.value)}
                  className="text-sm border border-[#E5DCD0] rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#1A1A2E]/10 focus:border-[#1A1A2E] bg-white transition-all"
                />
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <button
                  onClick={() => { setShowCreateForm(false); setNewTitle(""); setNewPurpose(""); setNewDeadline(""); }}
                  className="text-xs text-[#8B8489] hover:text-[#5B5560] px-3 py-2 transition-colors"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleCreate}
                  disabled={creating || !newTitle.trim()}
                  className="text-xs bg-[#1A1A2E] text-white rounded-xl px-4 py-2 hover:bg-[#141423] disabled:bg-[#C9BDAE] disabled:text-[#8B8489] transition-colors"
                >
                  {creating ? "作成中..." : "ミッションを設定"}
                </button>
              </div>
            </div>
          </div>
        )}

        {missions.length === 0 && !showCreateForm ? (
          <div className="text-center py-12">
            <div className="w-12 h-12 bg-[#EFE8DD] rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8B8489" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
              </svg>
            </div>
            <p className="text-[#5B5560] text-sm mb-1">ミッションはまだありません</p>
            <p className="text-xs text-[#C9BDAE]">上のボタンから自分でミッションを設定できます</p>
          </div>
        ) : missions.length > 0 ? (
          <div className="space-y-6">
            {inProgress.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-[#5B5560] tracking-wide uppercase mb-3 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-[#1A1A2E] rounded-full"></div>
                  進行中 ({inProgress.length})
                </h2>
                <div className="space-y-2">
                  {inProgress.map((mission) => <MissionCard key={mission.id} mission={mission} />)}
                </div>
              </section>
            )}

            {notStarted.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-[#5B5560] tracking-wide uppercase mb-3 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-[#C9BDAE] rounded-full"></div>
                  未着手 ({notStarted.length})
                </h2>
                <div className="space-y-2">
                  {notStarted.map((mission) => <MissionCard key={mission.id} mission={mission} />)}
                </div>
              </section>
            )}

            {completed.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-[#5B5560] tracking-wide uppercase mb-3 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
                  完了 ({completed.length})
                </h2>
                <div className="space-y-2">
                  {completed.map((mission) => <MissionCard key={mission.id} mission={mission} />)}
                </div>
              </section>
            )}
          </div>
        ) : null}
      </div>

      <BottomNav active="mission" baseUrl={`/p/${token}`} badges={badges} />
    </div>
  );
}
