"use client";

import { useParams } from "next/navigation";
import { useState, useEffect } from "react";

type ParticipantData = {
  id: string;
  name: string;
  department: string;
  dojoPhase: string;
  entryDays: number;
  entryRate: number;
  streak: number;
  fbCount: number;
  managerId: string;
  fbPolicy: string;
  todayHasLog: boolean;
  latestLog: {
    date: string;
    morningIntent: string;
    status: string;
    energy: string | null;
  } | null;
  recentEnergy: (string | null)[];
};

type ManagerData = {
  id: string;
  name: string;
  department: string;
  participantIds: string[];
  participantNames: string[];
};

type AdminData = {
  participants: ParticipantData[];
  managers: ManagerData[];
};

type ManagerOption = { id: string; name: string };
type AddResult = { type: "participant" | "manager"; name: string; token: string; url: string } | null;

const energyEmoji: Record<string, string> = {
  excellent: "🔥",
  good: "😊",
  okay: "😐",
  low: "😞",
};

export default function AdminDashboard() {
  const params = useParams();
  const token = params.token as string;
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);

  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [showAddManager, setShowAddManager] = useState(false);
  const [managerOptions, setManagerOptions] = useState<ManagerOption[]>([]);
  const [addResult, setAddResult] = useState<AddResult>(null);
  const [submitting, setSubmitting] = useState(false);

  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [fbTargetName, setFbTargetName] = useState("");
  const [fbContent, setFbContent] = useState("");
  const [fbPeriod, setFbPeriod] = useState("");
  const [fbWeekNum, setFbWeekNum] = useState(1);
  const [fbSubmitting, setFbSubmitting] = useState(false);
  const [fbSuccess, setFbSuccess] = useState(false);
  const [fbRecentLogs, setFbRecentLogs] = useState<
    { date: string; dayOfWeek: string; morningIntent: string; eveningInsight: string | null; energy: string | null; status: string }[]
  >([]);
  const [fbLogsLoading, setFbLogsLoading] = useState(false);
  const [aiDraftLoading, setAiDraftLoading] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/admin?token=${token}`);
        if (res.status === 403) { setUnauthorized(true); return; }
        if (res.ok) setData(await res.json());
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [token]);

  useEffect(() => {
    if (showAddParticipant) {
      fetch(`/api/admin/members?token=${token}`)
        .then((r) => r.json())
        .then((d) => setManagerOptions(d.managers || []))
        .catch(() => setManagerOptions([]));
    }
  }, [showAddParticipant, token]);

  const handleAddParticipant = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    const form = e.currentTarget;
    const formData = new FormData(form);
    try {
      const res = await fetch("/api/admin/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token, type: "participant",
          data: {
            name: formData.get("name"), email: formData.get("email"),
            department: formData.get("department"), dojoPhase: formData.get("dojoPhase") || "道場1 覚醒",
            role: formData.get("role") || "参加者", managerId: formData.get("managerId") || "",
            emailEnabled: formData.get("emailEnabled") === "on",
          },
        }),
      });
      const result = await res.json();
      if (result.success) {
        setAddResult({ type: "participant", name: result.participant.name, token: result.participant.token, url: result.participant.url });
        setShowAddParticipant(false);
        const refreshRes = await fetch(`/api/admin?token=${token}`);
        if (refreshRes.ok) setData(await refreshRes.json());
      } else { alert(result.error || "追加に失敗しました"); }
    } catch { alert("エラーが発生しました"); } finally { setSubmitting(false); }
  };

  const handleAddManager = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    const form = e.currentTarget;
    const formData = new FormData(form);
    try {
      const res = await fetch("/api/admin/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token, type: "manager",
          data: {
            name: formData.get("name"), email: formData.get("email"),
            department: formData.get("department"), isAdmin: formData.get("isAdmin") === "on",
          },
        }),
      });
      const result = await res.json();
      if (result.success) {
        setAddResult({ type: "manager", name: result.manager.name, token: result.manager.token, url: result.manager.url });
        setShowAddManager(false);
        const refreshRes = await fetch(`/api/admin?token=${token}`);
        if (refreshRes.ok) setData(await refreshRes.json());
      } else { alert(result.error || "追加に失敗しました"); }
    } catch { alert("エラーが発生しました"); } finally { setSubmitting(false); }
  };

  const openFeedbackModal = (participantName: string) => {
    setFbTargetName(participantName);
    setFbContent(""); setFbPeriod(""); setFbWeekNum(1); setFbSuccess(false);
    setFbRecentLogs([]); setFbLogsLoading(true); setShowFeedbackModal(true);
    setAiDraftLoading(false);
    fetch(`/api/feedback?token=${token}&participant=${encodeURIComponent(participantName)}&includeLogs=true`)
      .then((r) => r.json())
      .then((d) => setFbRecentLogs(d.recentLogs || []))
      .catch(() => setFbRecentLogs([]))
      .finally(() => setFbLogsLoading(false));
  };

  const handleAiDraft = async () => {
    if (fbRecentLogs.length === 0) return;
    setAiDraftLoading(true);
    try {
      const targetParticipant = data?.participants.find((p) => p.name === fbTargetName);
      const res = await fetch("/api/feedback/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          participantName: fbTargetName,
          logs: fbRecentLogs,
          dojoPhase: targetParticipant?.dojoPhase || "",
          fbPolicy: targetParticipant?.fbPolicy || "",
        }),
      });
      if (res.ok) {
        const result = await res.json();
        setFbContent(result.draft || "");
      } else {
        const err = await res.json();
        alert(err.error || "AI下書きの生成に失敗しました");
      }
    } catch {
      alert("AI下書きの生成に失敗しました");
    } finally {
      setAiDraftLoading(false);
    }
  };

  const handleSubmitFeedback = async () => {
    if (!fbContent.trim()) return;
    setFbSubmitting(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, participantName: fbTargetName, content: fbContent, period: fbPeriod, weekNum: fbWeekNum, type: "HMフィードバック" }),
      });
      const result = await res.json();
      if (result.success) {
        setFbSuccess(true);
        setTimeout(() => { setShowFeedbackModal(false); setFbSuccess(false); }, 1500);
        const refreshRes = await fetch(`/api/admin?token=${token}`);
        if (refreshRes.ok) setData(await refreshRes.json());
      } else { alert(result.error || "フィードバックの送信に失敗しました"); }
    } catch { alert("エラーが発生しました"); } finally { setFbSubmitting(false); }
  };

  if (unauthorized) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-12 h-12 bg-[#F3F4F6] rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-[#111827]">アクセス権限がありません</h1>
          <p className="text-sm text-[#6B7280] mt-1">有効な管理者トークンが必要です</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#4338CA] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[#9CA3AF] text-sm">データを取得中...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-6">
        <p className="text-[#6B7280] text-sm">データの取得に失敗しました</p>
      </div>
    );
  }

  const { participants, managers } = data;
  const totalLogs = participants.reduce((sum, p) => sum + p.entryDays, 0);
  const avgEntryRate = participants.length > 0
    ? Math.round(participants.reduce((sum, p) => sum + p.entryRate, 0) / participants.length) : 0;
  const totalFeedbacks = participants.reduce((sum, p) => sum + p.fbCount, 0);
  const todayLogCount = participants.filter((p) => p.todayHasLog).length;

  const getStatusBadge = (rate: number, streak: number, entryDays: number) => {
    if (entryDays === 0) return { color: "bg-gray-300", label: "未開始" };
    if (streak > 0 && rate >= 80) return { color: "bg-emerald-500", label: "順調" };
    if (rate >= 50) return { color: "bg-amber-500", label: "やや停滞" };
    return { color: "bg-red-500", label: "要フォロー" };
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      {/* Header */}
      <div className="gradient-header-admin text-white px-6 pt-12 pb-6">
        <div className="max-w-4xl mx-auto relative z-10">
          <div className="flex items-center gap-2.5 mb-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            <h1 className="text-xl font-semibold tracking-tight">管理者ダッシュボード</h1>
          </div>
          <p className="text-gray-400 text-sm font-light ml-7">CORE Log システム全体の状況</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-5 pt-5 animate-fade-up relative z-10">
        {/* Add Result Banner */}
        {addResult && (
          <div className="mb-4 card-elevated p-5 border-l-[3px] border-l-emerald-500">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-emerald-500 rounded-lg flex items-center justify-center">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
                <h3 className="font-medium text-sm text-[#111827]">
                  {addResult.name}さんを{addResult.type === "participant" ? "参加者" : "マネージャー"}として追加
                </h3>
              </div>
              <button onClick={() => setAddResult(null)} className="text-[#9CA3AF] hover:text-[#6B7280] transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="bg-[#F9FAFB] rounded-xl p-3.5 space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-[#9CA3AF] w-16 text-xs">トークン</span>
                <code className="bg-white px-2.5 py-1 rounded-lg border border-[#E5E7EB] font-mono text-[#4338CA] text-xs select-all">{addResult.token}</code>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[#9CA3AF] w-16 text-xs">URL</span>
                <a href={addResult.url} className="text-[#4338CA] underline break-all text-xs" target="_blank">
                  {typeof window !== "undefined" ? window.location.origin : ""}{addResult.url}
                </a>
              </div>
              <p className="text-[11px] text-amber-600 mt-1">このURLを本人にお伝えください</p>
            </div>
          </div>
        )}

        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 mb-5">
          {[
            { value: participants.length, label: "参加者", color: "text-[#111827]" },
            { value: `${avgEntryRate}%`, label: "平均記入率", color: "text-[#4338CA]", highlight: true },
            { value: todayLogCount, label: "今日の記入", color: "text-[#111827]" },
            { value: totalLogs, label: "総ログ数", color: "text-[#111827]" },
            { value: totalFeedbacks, label: "FB配信数", color: "text-[#111827]" },
          ].map((stat, i) => (
            <div key={i} className={`${stat.highlight ? "bg-[#EEF2FF] border border-indigo-200" : "card"} p-4 rounded-2xl`}>
              <div className={`text-2xl font-bold tracking-tight ${stat.color}`}>{stat.value}</div>
              <div className="text-[10px] text-[#9CA3AF] font-medium tracking-wide mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Participants Table */}
        <div className="card overflow-hidden mb-5">
          <div className="px-5 py-4 border-b border-[#F3F4F6] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#111827]">参加者一覧</h2>
            <button onClick={() => setShowAddParticipant(true)} className="btn-accent text-xs px-4 py-2">
              + 参加者を追加
            </button>
          </div>
          <div className="divide-y divide-[#F3F4F6]">
            {participants.map((p) => {
              const status = getStatusBadge(p.entryRate, p.streak, p.entryDays);
              return (
                <div key={p.id} className="p-4 hover:bg-[#FAFAFA] transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-2 h-2 rounded-full ${status.color}`}></div>
                        <span className="font-medium text-sm text-[#111827]">{p.name}</span>
                        <span className="text-[10px] font-medium bg-indigo-50 text-[#4338CA] px-1.5 py-0.5 rounded-md">{p.dojoPhase}</span>
                        {p.todayHasLog && (
                          <span className="bg-[#4338CA] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md">NEW</span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#9CA3AF] mb-1.5 ml-4">{p.department}</p>
                      <div className="flex gap-4 text-xs text-[#9CA3AF] ml-4">
                        <span>記入率: <strong className="text-[#111827]">{p.entryRate}%</strong></span>
                        <span>連続: <strong className="text-[#111827]">{p.streak}日</strong></span>
                        <span>FB: <strong className="text-[#111827]">{p.fbCount}回</strong></span>
                        <span>記入: <strong className="text-[#111827]">{p.entryDays}日</strong></span>
                      </div>
                      {p.latestLog && p.latestLog.morningIntent && (
                        <div className="mt-2 ml-4 text-xs text-[#6B7280] bg-[#F9FAFB] rounded-xl p-2 border border-[#F3F4F6]">
                          <span className="text-[#9CA3AF]">最新 ({p.latestLog.date}):</span> {p.latestLog.morningIntent}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 ml-4">
                      <button
                        onClick={() => openFeedbackModal(p.name)}
                        className="text-[10px] font-medium px-3 py-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors"
                      >
                        FB送信
                      </button>
                      <span className="text-[10px] text-[#9CA3AF]">{status.label}</span>
                      {p.recentEnergy.length > 0 && (
                        <div className="flex gap-0.5 mt-0.5">
                          {p.recentEnergy.map((energy, i) => (
                            <span key={i} className="text-xs leading-none">
                              {energy ? energyEmoji[energy] : "·"}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Managers Table */}
        <div className="card overflow-hidden mb-5">
          <div className="px-5 py-4 border-b border-[#F3F4F6] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#111827]">マネージャー一覧</h2>
            <button onClick={() => setShowAddManager(true)} className="text-xs font-medium px-4 py-2 rounded-xl bg-amber-500 text-white hover:bg-amber-600 transition-colors">
              + マネージャーを追加
            </button>
          </div>
          <div className="divide-y divide-[#F3F4F6]">
            {managers.map((m) => (
              <div key={m.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm text-[#111827]">{m.name}</div>
                    <div className="text-[11px] text-[#9CA3AF] mt-0.5">{m.department}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-[#4338CA] font-medium">担当: {m.participantNames.length}名</div>
                    <div className="text-[11px] text-[#9CA3AF] mt-0.5">{m.participantNames.join("、")}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* System Info */}
        <div className="card overflow-hidden mb-5">
          <div className="px-5 py-4 border-b border-[#F3F4F6]">
            <h2 className="text-sm font-semibold text-[#111827]">システム情報</h2>
          </div>
          <div className="p-4 space-y-0">
            {[
              { label: "データソース", value: "Notion API（リアルタイム）", status: "" },
              { label: "デプロイ先", value: "Vercel", status: "" },
              { label: "認証方式", value: "トークン付きURL", status: "" },
              { label: "Notion DB", value: "接続済み", status: "emerald" },
              { label: "AIフィードバック", value: "実装済み", status: "green" },
            ].map((item, i) => (
              <div key={i} className="flex justify-between items-center py-2.5 border-b border-[#F9FAFB] last:border-0">
                <span className="text-xs text-[#9CA3AF]">{item.label}</span>
                <span className={`text-xs font-medium ${
                  item.status === "emerald" ? "text-emerald-500" : item.status === "amber" ? "text-amber-500" : "text-[#111827]"
                }`}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Links */}
        <div className="card overflow-hidden mb-8">
          <div className="px-5 py-4 border-b border-[#F3F4F6]">
            <h2 className="text-sm font-semibold text-[#111827]">クイックリンク</h2>
          </div>
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <a href="/p/FAe9diVTAxUR8gRv" className="block p-3.5 bg-indigo-50/50 rounded-xl border border-indigo-100 hover:bg-indigo-50 transition-colors">
              <div className="font-medium text-[#4338CA] text-xs mb-0.5">参加者画面（土居 由奈）</div>
              <div className="text-[11px] text-[#9CA3AF]">日報入力・フィードバック確認・ミッション確認</div>
            </a>
            <a href="/m/pn_Oc1ykCMXUQZpZ" className="block p-3.5 bg-amber-50/50 rounded-xl border border-amber-100 hover:bg-amber-50 transition-colors">
              <div className="font-medium text-amber-600 text-xs mb-0.5">上司画面（本藤 直樹）</div>
              <div className="text-[11px] text-[#9CA3AF]">参加者一覧・詳細・コメント入力</div>
            </a>
          </div>
        </div>

        <div className="text-center text-[11px] text-[#D1D5DB] pb-8">
          CORE Log v1.0 — Powered by Next.js + Notion API
        </div>
      </div>

      {/* Add Participant Modal */}
      {showAddParticipant && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-[#F3F4F6]">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-[#111827]">参加者を追加</h3>
                <button onClick={() => setShowAddParticipant(false)} className="text-[#9CA3AF] hover:text-[#6B7280]">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <p className="text-xs text-[#9CA3AF] mt-1">トークンは自動生成されます</p>
            </div>
            <form onSubmit={handleAddParticipant} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#374151] mb-1.5">名前 *</label>
                <input name="name" required placeholder="例: 山田 太郎" className="input-field text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#374151] mb-1.5">メール *</label>
                <input name="email" type="email" required placeholder="例: taro.yamada@example.com" className="input-field text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#374151] mb-1.5">部署</label>
                <input name="department" placeholder="例: 製造部" className="input-field text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#374151] mb-1.5">道場フェーズ</label>
                  <select name="dojoPhase" className="input-field text-sm">
                    <option value="道場1 覚醒">道場1 覚醒</option>
                    <option value="道場2 武装">道場2 武装</option>
                    <option value="道場3 実践">道場3 実践</option>
                    <option value="道場4 深化">道場4 深化</option>
                    <option value="道場5 統合">道場5 統合</option>
                    <option value="道場6 継承">道場6 継承</option>
                    <option value="道場7 卒業">道場7 卒業</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#374151] mb-1.5">役割</label>
                  <select name="role" className="input-field text-sm">
                    <option value="参加者">参加者</option>
                    <option value="HM社内">HM社内</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#374151] mb-1.5">担当上司</label>
                <select name="managerId" className="input-field text-sm">
                  <option value="">未設定</option>
                  {managerOptions.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" name="emailEnabled" id="emailEnabled" className="rounded border-[#D1D5DB]" />
                <label htmlFor="emailEnabled" className="text-xs text-[#374151]">メール通知を有効にする</label>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAddParticipant(false)} className="btn-secondary flex-1 py-2.5 text-sm">キャンセル</button>
                <button type="submit" disabled={submitting} className="btn-primary flex-1 py-2.5 text-sm">{submitting ? "追加中..." : "追加する"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Feedback Modal */}
      {showFeedbackModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-5 border-b border-[#F3F4F6]">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-[#111827]">HMフィードバック送信</h3>
                <button onClick={() => setShowFeedbackModal(false)} className="text-[#9CA3AF] hover:text-[#6B7280]">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <p className="text-xs text-amber-600 font-medium mt-1">対象: {fbTargetName}</p>
              {(() => { const p = data?.participants.find((p) => p.name === fbTargetName); return p?.fbPolicy ? (
                <p className="text-[10px] text-violet-500 mt-1 bg-violet-50 rounded-md px-2 py-1">📋 FB方針: {p.fbPolicy}</p>
              ) : null; })()}
            </div>
            {fbSuccess ? (
              <div className="p-8 text-center">
                <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
                <p className="text-emerald-600 font-medium text-sm">送信完了</p>
                <p className="text-[11px] text-[#9CA3AF] mt-1">本人にメール通知が送信されます</p>
              </div>
            ) : (
              <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
                <div className="bg-[#F9FAFB] rounded-xl p-3 border border-[#F3F4F6]">
                  <p className="text-[10px] font-medium text-[#4338CA] tracking-wide uppercase mb-2">直近1週間のログ</p>
                  {fbLogsLoading ? (
                    <div className="text-center py-2">
                      <div className="w-4 h-4 border-2 border-[#4338CA] border-t-transparent rounded-full animate-spin mx-auto"></div>
                    </div>
                  ) : fbRecentLogs.length === 0 ? (
                    <p className="text-xs text-[#D1D5DB] text-center py-2">直近のログがありません</p>
                  ) : (
                    <div className="space-y-1.5">
                      {fbRecentLogs.map((log, i) => (
                        <div key={i} className="bg-white rounded-lg px-3 py-2 text-xs border border-[#F3F4F6]">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-[#111827]">{log.date} ({log.dayOfWeek})</span>
                            {log.energy && <span className="text-sm leading-none">{energyEmoji[log.energy] || ""}</span>}
                          </div>
                          <p className="text-[#4338CA]">朝: {log.morningIntent || "—"}</p>
                          {log.eveningInsight && <p className="text-amber-600 mt-0.5">夜: {log.eveningInsight}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#374151] mb-1.5">対象期間</label>
                    <input value={fbPeriod} onChange={(e) => setFbPeriod(e.target.value)} placeholder="例: 2026年3月第4週" className="input-field text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#374151] mb-1.5">週番号</label>
                    <input type="number" min={1} max={52} value={fbWeekNum} onChange={(e) => setFbWeekNum(Number(e.target.value))} className="input-field text-sm" />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-medium text-[#374151]">フィードバック内容 *</label>
                    <button
                      onClick={handleAiDraft}
                      disabled={aiDraftLoading || fbLogsLoading || fbRecentLogs.length === 0}
                      className="inline-flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-500 to-purple-600 text-white hover:from-violet-600 hover:to-purple-700 disabled:from-gray-300 disabled:to-gray-400 disabled:text-gray-500 transition-all shadow-sm"
                    >
                      {aiDraftLoading ? (
                        <>
                          <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
                          AI生成中...
                        </>
                      ) : (
                        <>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                          </svg>
                          AI下書き生成
                        </>
                      )}
                    </button>
                  </div>
                  <textarea value={fbContent} onChange={(e) => setFbContent(e.target.value)} rows={6}
                    placeholder="今週のCORE Logを拝見しました。...（AI下書き生成ボタンで自動作成できます）"
                    className="input-field text-sm resize-none leading-relaxed" />
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowFeedbackModal(false)} className="btn-secondary flex-1 py-2.5 text-sm">キャンセル</button>
                  <button onClick={handleSubmitFeedback} disabled={fbSubmitting || !fbContent.trim()}
                    className="flex-1 py-2.5 text-sm font-medium rounded-xl bg-amber-500 text-white hover:bg-amber-600 disabled:bg-[#D1D5DB] disabled:text-[#9CA3AF] transition-colors">
                    {fbSubmitting ? "送信中..." : "送信する"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Manager Modal */}
      {showAddManager && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-5 border-b border-[#F3F4F6]">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-[#111827]">マネージャーを追加</h3>
                <button onClick={() => setShowAddManager(false)} className="text-[#9CA3AF] hover:text-[#6B7280]">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <p className="text-xs text-[#9CA3AF] mt-1">トークンは自動生成されます</p>
            </div>
            <form onSubmit={handleAddManager} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#374151] mb-1.5">名前 *</label>
                <input name="name" required placeholder="例: 鈴木 花子" className="input-field text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#374151] mb-1.5">メール *</label>
                <input name="email" type="email" required placeholder="例: hanako.suzuki@example.com" className="input-field text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#374151] mb-1.5">部署</label>
                <input name="department" placeholder="例: 人事部" className="input-field text-sm" />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" name="isAdmin" id="isAdmin" className="rounded border-[#D1D5DB]" />
                <label htmlFor="isAdmin" className="text-xs text-[#374151]">管理者権限を付与する</label>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAddManager(false)} className="btn-secondary flex-1 py-2.5 text-sm">キャンセル</button>
                <button type="submit" disabled={submitting} className="btn-primary flex-1 py-2.5 text-sm">{submitting ? "追加中..." : "追加する"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
