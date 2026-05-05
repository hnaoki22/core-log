"use client";

import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { useFeatures } from "@/lib/use-features";

type ParticipantData = {
  id: string;
  token: string;
  name: string;
  department: string;
  dojoPhase: string;
  // New morning/evening separated stats
  completeDays: number;
  morningCount: number;
  eveningCount: number;
  completionRate: number;
  todayStatus: "complete" | "morning_only" | "evening_only" | "none";
  businessDaysElapsed?: number;
  // Legacy fields
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
    eveningInsight: string | null;
    status: string;
    energy: string | null;
  } | null;
  recentEnergy: (string | null)[];
};

type ManagerData = {
  id: string;
  token: string;
  name: string;
  email: string;
  department: string;
  isAdmin: boolean;
  role: string;
  participantIds: string[];
  participantNames: string[];
};

type TenantInfo = {
  id: string;
  name: string;
  slug: string;
  companyName: string;
};

type AdminData = {
  participants: ParticipantData[];
  managers: ManagerData[];
  viewerRole?: "admin" | "observer" | "manager";
  tenantId?: string;
  tenants?: TenantInfo[];
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
  const { isOn, loaded: featuresLoaded } = useFeatures();
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [selectedTenantSlug, setSelectedTenantSlug] = useState<string>("");

  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [showAddManager, setShowAddManager] = useState(false);
  const [managerOptions, setManagerOptions] = useState<ManagerOption[]>([]);
  const [addResult, setAddResult] = useState<AddResult>(null);
  const [submitting, setSubmitting] = useState(false);

  // CSV Import state
  const [showImportModal, setShowImportModal] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [importStep, setImportStep] = useState<"input" | "preview" | "result">("input");
  const [importPreview, setImportPreview] = useState<{ summary: { total: number; managers: number; participants: number; duplicates: number; newRegistrations: number }; duplicates: string[]; rows: { line: number; name: string; email: string; role: string; department: string; dojoPhase: string; managerName: string; isDuplicate: boolean }[] } | null>(null);
  const [importResult, setImportResult] = useState<{ summary: { total: number; success: number; skipped: number; errors: number }; results: { line: number; name: string; email: string; role: string; status: string; token?: string; url?: string; message: string }[] } | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<{ error: string; details?: string[] } | null>(null);

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

  const [showPromptSettings, setShowPromptSettings] = useState(false);
  const [promptText, setPromptText] = useState("");
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptSaving, setPromptSaving] = useState(false);
  const [promptSaved, setPromptSaved] = useState(false);

  const [showAnalytics, setShowAnalytics] = useState(false);
  const [analyticsData, setAnalyticsData] = useState<{
    weeklyTrend: { weekStart: string; weekLabel: string; entryRate: number; totalEntries: number }[];
    energyDistribution: { excellent: number; good: number; okay: number; low: number };
    participantTrends: { name: string; totalEntries: number; last7Days: number; weeklyEnergy: { weekLabel: string; avg: number }[] }[];
    managerActivity: { participantName: string; totalComments: number; lastCommentDate: string | null; daysSinceComment: number; needsAttention: boolean }[];
  } | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Participant edit state
  const [editingParticipant, setEditingParticipant] = useState<ParticipantData | null>(null);
  const [editForm, setEditForm] = useState<{
    name: string; email: string; department: string; dojoPhase: string;
    managerId: string; fbPolicy: string; emailEnabled: boolean;
    startDate: string; endDate: string;
  }>({ name: "", email: "", department: "", dojoPhase: "", managerId: "", fbPolicy: "", emailEnabled: true, startDate: "", endDate: "" });
  const [editSaving, setEditSaving] = useState(false);

  // Manager edit state
  const [editingManager, setEditingManager] = useState<ManagerData | null>(null);
  const [editManagerForm, setEditManagerForm] = useState<{
    name: string; email: string; department: string; isAdmin: boolean; role: string;
  }>({ name: "", email: "", department: "", isAdmin: false, role: "manager" });
  const [editManagerSaving, setEditManagerSaving] = useState(false);

  // Manager CSV Import state
  const [showManagerImport, setShowManagerImport] = useState(false);
  const [managerCsvText, setManagerCsvText] = useState("");
  const [managerImportStep, setManagerImportStep] = useState<"input" | "preview" | "result">("input");
  const [managerImportPreview, setManagerImportPreview] = useState<typeof importPreview>(null);
  const [managerImportResult, setManagerImportResult] = useState<typeof importResult>(null);
  const [managerImportLoading, setManagerImportLoading] = useState(false);
  const [managerImportError, setManagerImportError] = useState<typeof importError>(null);

  // FB History modal state (read-only, available to observers)
  const [showFbHistory, setShowFbHistory] = useState(false);
  const [fbHistoryTarget, setFbHistoryTarget] = useState("");
  const [fbHistoryList, setFbHistoryList] = useState<{ id: string; content: string; authorName: string; type: string; period: string; weekNum: number; date: string; isRead: boolean }[]>([]);
  const [fbHistoryLoading, setFbHistoryLoading] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const tenantParam = selectedTenantSlug ? `&tenant=${selectedTenantSlug}` : "";
      window.open(`/api/admin/export?token=${token}${tenantParam}`, "_blank");
    } catch (error) {
      console.error("Export error:", error);
      alert("エクスポートに失敗しました");
    } finally {
      setExporting(false);
    }
  };

  const openEditParticipant = async (p: ParticipantData) => {
    setEditingParticipant(p);
    // Fetch full participant data including email, startDate, endDate
    try {
      const tenantParam = selectedTenantSlug ? `&tenant=${selectedTenantSlug}` : "";
      const res = await fetch(`/api/admin/members?token=${token}${tenantParam}`);
      const d = await res.json();
      const managers = d.managers || [];
      setManagerOptions(managers);
    } catch { /* use existing managers */ }
    setEditForm({
      name: p.name, email: "", department: p.department, dojoPhase: p.dojoPhase,
      managerId: p.managerId || "", fbPolicy: p.fbPolicy || "",
      emailEnabled: true, startDate: "", endDate: "",
    });
  };

  const handleSaveParticipant = async () => {
    if (!editingParticipant) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/admin/participants/${editingParticipant.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...editForm }),
      });
      if (res.ok) {
        setEditingParticipant(null);
        const refreshRes = await fetch(`/api/admin?token=${token}${selectedTenantSlug ? `&tenant=${selectedTenantSlug}` : ""}`);
        if (refreshRes.ok) setData(await refreshRes.json());
      } else {
        const err = await res.json();
        alert(err.error || "更新に失敗しました");
      }
    } catch { alert("エラーが発生しました"); } finally { setEditSaving(false); }
  };

  const openEditManager = (m: ManagerData) => {
    setEditingManager(m);
    setEditManagerForm({
      name: m.name,
      email: m.email || "",
      department: m.department || "",
      isAdmin: m.isAdmin || false,
      role: m.role || (m.isAdmin ? "admin" : "manager"),
    });
  };

  const handleSaveManager = async () => {
    if (!editingManager) return;
    setEditManagerSaving(true);
    try {
      const res = await fetch(`/api/admin/managers/${editingManager.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...editManagerForm }),
      });
      if (res.ok) {
        setEditingManager(null);
        const refreshRes = await fetch(`/api/admin?token=${token}${selectedTenantSlug ? `&tenant=${selectedTenantSlug}` : ""}`);
        if (refreshRes.ok) setData(await refreshRes.json());
      } else {
        const err = await res.json();
        alert(err.error || "更新に失敗しました");
      }
    } catch { alert("エラーが発生しました"); } finally { setEditManagerSaving(false); }
  };

  const handleManagerImportDryRun = async () => {
    if (!managerCsvText.trim()) return;
    setManagerImportLoading(true);
    setManagerImportError(null);
    try {
      const res = await fetch("/api/admin/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, csv: managerCsvText, dryRun: true }),
      });
      const d = await res.json();
      if (res.ok) { setManagerImportPreview(d); setManagerImportStep("preview"); }
      else { setManagerImportError({ error: d.error, details: d.details }); }
    } catch { setManagerImportError({ error: "通信エラーが発生しました" }); }
    finally { setManagerImportLoading(false); }
  };

  const handleManagerImportExecute = async () => {
    setManagerImportLoading(true);
    try {
      const res = await fetch("/api/admin/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, csv: managerCsvText, dryRun: false }),
      });
      const d = await res.json();
      if (res.ok) { setManagerImportResult(d); setManagerImportStep("result"); }
      else { setManagerImportError({ error: d.error, details: d.details }); }
    } catch { setManagerImportError({ error: "通信エラーが発生しました" }); }
    finally { setManagerImportLoading(false); }
  };

  const fetchAdminData = async (tenantSlug?: string) => {
    setLoading(true);
    try {
      const tenantParam = tenantSlug ? `&tenant=${tenantSlug}` : "";
      const res = await fetch(`/api/admin?token=${token}${tenantParam}`);
      if (res.status === 403) { setUnauthorized(true); return; }
      if (res.ok) setData(await res.json());
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData(selectedTenantSlug || undefined);
  }, [token, selectedTenantSlug]);

  useEffect(() => {
    if (showAddParticipant) {
      const tenantParam = selectedTenantSlug ? `&tenant=${selectedTenantSlug}` : "";
      fetch(`/api/admin/members?token=${token}${tenantParam}`)
        .then((r) => r.json())
        .then((d) => setManagerOptions(d.managers || []))
        .catch(() => setManagerOptions([]));
    }
  }, [showAddParticipant, token, selectedTenantSlug]);

  const handleAddParticipant = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    const form = e.currentTarget;
    const formData = new FormData(form);
    try {
      const tenantParam = selectedTenantSlug ? `?tenant=${selectedTenantSlug}` : "";
      const res = await fetch(`/api/admin/members${tenantParam}`, {
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
        const refreshRes = await fetch(`/api/admin?token=${token}${selectedTenantSlug ? `&tenant=${selectedTenantSlug}` : ""}`);
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
      // モーダル内で選択されたテナントを優先（admin が全テナント表示中に追加先を指定する用途）。
      // 未指定時はページレベルで選択中のテナントへフォールバック。
      const formTenantSlug = (formData.get("tenantSlug") as string | null) || "";
      const effectiveTenantSlug = formTenantSlug || selectedTenantSlug;
      const tenantParam = effectiveTenantSlug ? `?tenant=${effectiveTenantSlug}` : "";
      // 役割は admin / manager / observer の 3 択。admin の場合は isAdmin も true に。
      const role = (formData.get("role") as string | null) || "manager";
      const isAdmin = role === "admin";
      const res = await fetch(`/api/admin/members${tenantParam}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token, type: "manager",
          data: {
            name: formData.get("name"), email: formData.get("email"),
            department: formData.get("department"),
            isAdmin,
            role,
          },
        }),
      });
      const result = await res.json();
      if (result.success) {
        setAddResult({ type: "manager", name: result.manager.name, token: result.manager.token, url: result.manager.url });
        setShowAddManager(false);
        const refreshRes = await fetch(`/api/admin?token=${token}${selectedTenantSlug ? `&tenant=${selectedTenantSlug}` : ""}`);
        if (refreshRes.ok) setData(await refreshRes.json());
      } else { alert(result.error || "追加に失敗しました"); }
    } catch { alert("エラーが発生しました"); } finally { setSubmitting(false); }
  };

  const openFbHistory = (participantName: string) => {
    setFbHistoryTarget(participantName);
    setFbHistoryList([]); setFbHistoryLoading(true); setShowFbHistory(true);
    const tenantParam = selectedTenantSlug ? `&tenant=${selectedTenantSlug}` : "";
    fetch(`/api/feedback?token=${token}&participant=${encodeURIComponent(participantName)}${tenantParam}`)
      .then((r) => r.json())
      .then((d) => setFbHistoryList(d.feedback || []))
      .catch(() => setFbHistoryList([]))
      .finally(() => setFbHistoryLoading(false));
  };

  const openFeedbackModal = (participantName: string) => {
    setFbTargetName(participantName);
    setFbContent(""); setFbPeriod(""); setFbWeekNum(1); setFbSuccess(false);
    setFbRecentLogs([]); setFbLogsLoading(true); setShowFeedbackModal(true);
    setAiDraftLoading(false);
    const tenantParam = selectedTenantSlug ? `&tenant=${selectedTenantSlug}` : "";
    fetch(`/api/feedback?token=${token}&participant=${encodeURIComponent(participantName)}&includeLogs=true${tenantParam}`)
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
      const fbTenantParam = selectedTenantSlug ? `?tenant=${selectedTenantSlug}` : "";
      const res = await fetch(`/api/feedback${fbTenantParam}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, participantName: fbTargetName, content: fbContent, period: fbPeriod, weekNum: fbWeekNum, type: "HMフィードバック" }),
      });
      const result = await res.json();
      if (result.success) {
        setFbSuccess(true);
        setTimeout(() => { setShowFeedbackModal(false); setFbSuccess(false); }, 1500);
        const refreshRes = await fetch(`/api/admin?token=${token}${selectedTenantSlug ? `&tenant=${selectedTenantSlug}` : ""}`);
        if (refreshRes.ok) setData(await refreshRes.json());
      } else { alert(result.error || "フィードバックの送信に失敗しました"); }
    } catch { alert("エラーが発生しました"); } finally { setFbSubmitting(false); }
  };

  const openPromptSettings = async () => {
    setShowPromptSettings(true);
    setPromptLoading(true);
    setPromptSaved(false);
    try {
      const tenantParam = selectedTenantSlug ? `&tenant=${selectedTenantSlug}` : "";
      const res = await fetch(`/api/admin/ai-settings?token=${token}${tenantParam}`);
      if (res.ok) {
        const d = await res.json();
        setPromptText(d.systemPrompt || "");
      }
    } catch {
      alert("AI設定の取得に失敗しました");
    } finally {
      setPromptLoading(false);
    }
  };

  const handleSavePrompt = async () => {
    setPromptSaving(true);
    try {
      const tenantParam = selectedTenantSlug ? `?tenant=${selectedTenantSlug}` : "";
      const res = await fetch(`/api/admin/ai-settings${tenantParam}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, systemPrompt: promptText }),
      });
      if (res.ok) {
        setPromptSaved(true);
        setTimeout(() => setPromptSaved(false), 2000);
      } else {
        const err = await res.json();
        alert(err.error || "保存に失敗しました");
      }
    } catch {
      alert("保存に失敗しました");
    } finally {
      setPromptSaving(false);
    }
  };

  const openAnalytics = async () => {
    setShowAnalytics(true);
    // Always re-fetch — analytics depends on selected tenant
    setAnalyticsLoading(true);
    try {
      const tenantParam = selectedTenantSlug ? `&tenant=${selectedTenantSlug}` : "";
      const res = await fetch(`/api/admin/analytics?token=${token}${tenantParam}`);
      if (res.ok) setAnalyticsData(await res.json());
    } catch {
      // silently fail
    } finally {
      setAnalyticsLoading(false);
    }
  };

  if (unauthorized) {
    return (
      <div className="min-h-screen bg-[#F5F0EB] flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-12 h-12 bg-[#EFE8DD] rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8B8489" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-[#1A1A2E]">アクセス権限がありません</h1>
          <p className="text-sm text-[#5B5560] mt-1">有効な管理者トークンが必要です</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F0EB] flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#1A1A2E] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[#8B8489] text-sm">データを取得中...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-[#F5F0EB] flex items-center justify-center p-6">
        <p className="text-[#5B5560] text-sm">データの取得に失敗しました</p>
      </div>
    );
  }

  const { participants, managers } = data;
  const isObserver = data.viewerRole === "observer";
  const avgCompletionRate = participants.length > 0
    ? Math.round(participants.reduce((sum, p) => sum + (p.completionRate ?? p.entryRate), 0) / participants.length) : 0;
  const totalFeedbacks = participants.reduce((sum, p) => sum + p.fbCount, 0);
  // Today's status breakdown: ◎ complete, △ partial, ー none
  const todayComplete = participants.filter((p) => p.todayStatus === "complete").length;
  const todayPartial = participants.filter((p) => p.todayStatus === "morning_only" || p.todayStatus === "evening_only").length;
  const getStatusBadge = (rate: number, streak: number, entryDays: number, businessDaysElapsed: number) => {
    if (entryDays === 0) return { color: "bg-gray-300", label: "未開始" };
    // Grace period: under 3 business days of history, labels are statistically unreliable.
    // A single missed slot can dominate the rate early on, so we hide the label entirely.
    if (businessDaysElapsed < 3) return { color: "bg-gray-300", label: "計測中" };
    if (streak > 0 && rate >= 80) return { color: "bg-emerald-500", label: "順調" };
    if (rate >= 50) return { color: "bg-amber-500", label: "やや停滞" };
    return { color: "bg-red-500", label: "要フォロー" };
  };

  return (
    <div className="min-h-screen bg-[#F5F0EB]">
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
          {/* Tenant switcher — only visible for admins with multiple tenants */}
          {data.tenants && data.tenants.length > 1 && data.viewerRole === "admin" && (
            <div className="ml-7 mt-2 flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
              <select
                value={selectedTenantSlug}
                onChange={(e) => setSelectedTenantSlug(e.target.value)}
                className="bg-white/15 text-white text-xs font-medium px-3 py-1.5 rounded-lg border border-white/20 outline-none cursor-pointer hover:bg-white/25 transition-colors appearance-none pr-7"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center" }}
              >
                <option value="" className="text-gray-900">全テナント（デフォルト）</option>
                {data.tenants.map((t) => (
                  <option key={t.slug} value={t.slug} className="text-gray-900">
                    {t.companyName || t.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {isObserver && (
            <div className="ml-7 mt-1.5 inline-flex items-center gap-1.5 bg-white/15 text-white/90 text-[10px] font-medium px-2.5 py-1 rounded-lg">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
              </svg>
              閲覧専用モード
            </div>
          )}
        </div>
        <div className="absolute top-0 right-0 mt-1 flex items-center gap-2">
          <button onClick={handleExport} disabled={exporting} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/10 disabled:opacity-50">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            エクスポート
          </button>
          <button onClick={openAnalytics} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/10">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/>
            </svg>
            分析
          </button>
          {!isObserver && (
            <button onClick={openPromptSettings} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/10">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
              </svg>
              AI設定
            </button>
          )}
          {!isObserver && (
            <a href={`/a/${token}/features`} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/10">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
              機能設定
            </a>
          )}
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
                <h3 className="font-medium text-sm text-[#1A1A2E]">
                  {addResult.name}さんを{addResult.type === "participant" ? "参加者" : "マネージャー"}として追加
                </h3>
              </div>
              <button onClick={() => setAddResult(null)} className="text-[#8B8489] hover:text-[#5B5560] transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="bg-[#F5F0EB] rounded-xl p-3.5 space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-[#8B8489] w-16 text-xs">トークン</span>
                <code className="bg-white px-2.5 py-1 rounded-lg border border-[#E5DCD0] font-mono text-[#1A1A2E] text-xs select-all">{addResult.token}</code>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[#8B8489] w-16 text-xs">URL</span>
                <a href={addResult.url} className="text-[#1A1A2E] underline break-all text-xs" target="_blank">
                  {typeof window !== "undefined" ? window.location.origin : ""}{addResult.url}
                </a>
              </div>
              <p className="text-[11px] text-amber-600 mt-1">このURLを本人にお伝えください</p>
            </div>
          </div>
        )}

        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-5">
          <div className="card p-4 rounded-2xl">
            <div className="text-2xl font-bold tracking-tight text-[#1A1A2E]">{participants.length}</div>
            <div className="text-[10px] text-[#8B8489] font-medium tracking-wide mt-0.5">参加者</div>
          </div>
          <div className="bg-[#F2F2F7] border border-indigo-200 p-4 rounded-2xl">
            <div className="text-2xl font-bold tracking-tight text-[#1A1A2E]">{avgCompletionRate}%</div>
            <div className="text-[10px] text-[#8B8489] font-medium tracking-wide mt-0.5">平均完了率</div>
          </div>
          <div className="card p-4 rounded-2xl">
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-emerald-600">◎{todayComplete}</span>
              <span className="text-lg font-bold text-amber-500">△{todayPartial}</span>
            </div>
            <div className="text-[10px] text-[#8B8489] font-medium tracking-wide mt-0.5">今日の記入</div>
          </div>
          <div className="card p-4 rounded-2xl">
            <div className="text-2xl font-bold tracking-tight text-[#1A1A2E]">{totalFeedbacks}</div>
            <div className="text-[10px] text-[#8B8489] font-medium tracking-wide mt-0.5">FB配信数</div>
          </div>
        </div>

        {showAnalytics && (
          <div className="card overflow-hidden mb-5">
            <div className="px-5 py-4 border-b border-[#EFE8DD] flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#1A1A2E]">分析ダッシュボード</h2>
              <button onClick={() => setShowAnalytics(false)} className="text-[#8B8489] hover:text-[#5B5560] text-xs">閉じる</button>
            </div>

            {analyticsLoading ? (
              <div className="p-8 text-center">
                <div className="w-6 h-6 border-2 border-[#1A1A2E] border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                <p className="text-xs text-[#8B8489]">分析データを取得中...</p>
              </div>
            ) : analyticsData ? (
              <div className="p-5 space-y-6">
                {/* Weekly Entry Rate Trend - Bar Chart */}
                <div>
                  <h3 className="text-xs font-semibold text-[#5B5560] mb-3">週次完了率トレンド</h3>
                  <div className="flex items-end gap-1.5 h-32">
                    {analyticsData.weeklyTrend.map((w, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-[10px] font-bold text-[#1A1A2E]">{w.entryRate}%</span>
                        <div className="w-full bg-[#F2F2F7] rounded-t-lg relative" style={{ height: "100%" }}>
                          <div
                            className="absolute bottom-0 w-full bg-[#1A1A2E] rounded-t-lg transition-all"
                            style={{ height: `${Math.max(w.entryRate, 2)}%` }}
                          ></div>
                        </div>
                        <span className="text-[9px] text-[#8B8489]">{w.weekLabel}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Energy Distribution */}
                <div>
                  <h3 className="text-xs font-semibold text-[#5B5560] mb-3">エネルギー分布</h3>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { key: "excellent", emoji: "🔥", label: "絶好調", color: "bg-red-50 border-red-200" },
                      { key: "good", emoji: "😊", label: "良い", color: "bg-green-50 border-green-200" },
                      { key: "okay", emoji: "😐", label: "まあまあ", color: "bg-yellow-50 border-yellow-200" },
                      { key: "low", emoji: "😞", label: "低調", color: "bg-blue-50 border-blue-200" },
                    ].map(e => {
                      const count = analyticsData.energyDistribution[e.key as keyof typeof analyticsData.energyDistribution];
                      const total = Object.values(analyticsData.energyDistribution).reduce((a, b) => a + b, 0);
                      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                      return (
                        <div key={e.key} className={`${e.color} border rounded-xl p-3 text-center`}>
                          <div className="text-xl mb-1">{e.emoji}</div>
                          <div className="text-lg font-bold text-[#1A1A2E]">{pct}%</div>
                          <div className="text-[10px] text-[#8B8489]">{e.label} ({count})</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Manager Engagement Alert */}
                {analyticsData.managerActivity.some(m => m.needsAttention) && (
                  <div>
                    <h3 className="text-xs font-semibold text-[#5B5560] mb-3">要フォロー（3日以上コメントなし）</h3>
                    <div className="space-y-1.5">
                      {analyticsData.managerActivity
                        .filter(m => m.needsAttention)
                        .sort((a, b) => b.daysSinceComment - a.daysSinceComment)
                        .map((m, i) => (
                          <div key={i} className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                            <span className="text-xs font-medium text-[#1A1A2E]">{m.participantName}</span>
                            <span className="text-[10px] text-amber-600 font-medium">
                              {m.daysSinceComment > 100 ? "コメントなし" : `${m.daysSinceComment}日間コメントなし`}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Per-Participant 7-Day Activity */}
                <div>
                  <h3 className="text-xs font-semibold text-[#5B5560] mb-3">直近7日間の記入状況</h3>
                  <div className="space-y-1.5">
                    {analyticsData.participantTrends
                      .sort((a, b) => b.last7Days - a.last7Days)
                      .map((p, i) => (
                        <div key={i} className="flex items-center gap-3 px-3 py-2 bg-[#F5F0EB] rounded-lg">
                          <span className="text-xs font-medium text-[#1A1A2E] w-20 truncate">{p.name}</span>
                          <div className="flex-1 bg-[#E5DCD0] rounded-full h-2">
                            <div
                              className="bg-[#1A1A2E] h-2 rounded-full transition-all"
                              style={{ width: `${Math.round((p.last7Days / 5) * 100)}%` }}
                            ></div>
                          </div>
                          <span className="text-[10px] text-[#5B5560] font-medium w-12 text-right">{p.last7Days}/5日</span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-[#8B8489]">データの取得に失敗しました</div>
            )}
          </div>
        )}

        {/* Participants Table */}
        <div className="card overflow-hidden mb-5">
          <div className="px-5 py-4 border-b border-[#EFE8DD] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#1A1A2E]">参加者一覧</h2>
            {!isObserver && (
              <div className="flex items-center gap-2">
                <button onClick={() => { setShowImportModal(true); setImportStep("input"); setCsvText(""); setImportPreview(null); setImportResult(null); setImportError(null); }} className="text-xs px-4 py-2 rounded-xl border border-[#C4A882] text-[#8B7355] hover:bg-[#FBF8F4] transition-colors">
                  📄 CSV一括インポート
                </button>
                <button onClick={() => setShowAddParticipant(true)} className="btn-accent text-xs px-4 py-2">
                  + 参加者を追加
                </button>
              </div>
            )}
          </div>
          <div className="divide-y divide-[#EFE8DD]">
            {participants.map((p) => {
              const cRate = p.completionRate ?? p.entryRate;
              const status = getStatusBadge(cRate, p.streak, p.entryDays, p.businessDaysElapsed ?? 0);
              const todayIcon = p.todayStatus === "complete" ? "◎"
                : (p.todayStatus === "morning_only" || p.todayStatus === "evening_only") ? "△" : "";
              const todayColor = p.todayStatus === "complete" ? "text-emerald-600"
                : (p.todayStatus === "morning_only" || p.todayStatus === "evening_only") ? "text-amber-500" : "";
              return (
                <div key={p.id} className="p-4 hover:bg-[#FBF8F4] transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-2 h-2 rounded-full ${status.color}`}></div>
                        <a
                          href={`/a/${token}/participant/${encodeURIComponent(p.name)}`}
                          className="font-medium text-sm text-[#1A1A2E] hover:text-amber-700 hover:underline underline-offset-2 transition-colors"
                        >{p.name}</a>
                        <span className="text-[10px] font-medium bg-indigo-50 text-[#1A1A2E] px-1.5 py-0.5 rounded-md">{p.dojoPhase}</span>
                        {todayIcon && (
                          <span className={`text-sm font-bold ${todayColor}`}>{todayIcon}</span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#8B8489] mb-1.5 ml-4">{p.department}</p>
                      <div className="flex gap-4 text-xs text-[#8B8489] ml-4">
                        <span>完了率: <strong className="text-[#1A1A2E]">{cRate}%</strong></span>
                        <span>連続: <strong className="text-[#1A1A2E]">{p.streak}日</strong></span>
                        <span className="text-[#A09898]">朝<strong className="text-[#1A1A2E]">{p.morningCount ?? "?"}</strong> 夕<strong className="text-[#1A1A2E]">{p.eveningCount ?? "?"}</strong></span>
                        <span>FB: <strong className="text-[#1A1A2E]">{p.fbCount}回</strong></span>
                      </div>
                      {p.latestLog && (p.latestLog.morningIntent || p.latestLog.eveningInsight) && (
                        <div className="mt-2 ml-4 text-xs text-[#5B5560] bg-[#F5F0EB] rounded-xl p-2 border border-[#EFE8DD]">
                          <span className="text-[#8B8489]">最新 ({p.latestLog.date}):</span> {p.latestLog.morningIntent || p.latestLog.eveningInsight}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 ml-4">
                      <div className="flex gap-1.5">
                        <a
                          href={`/a/${token}/participant/${encodeURIComponent(p.name)}`}
                          className="text-[10px] font-medium px-3 py-1.5 rounded-lg bg-[#1A1A2E] text-white hover:bg-[#2C2C4A] transition-colors"
                        >
                          ログ
                        </a>
                        <button
                          onClick={() => openFbHistory(p.name)}
                          className="text-[10px] font-medium px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
                        >
                          FB履歴
                        </button>
                        {!isObserver && (
                          <>
                            <button
                              onClick={() => openEditParticipant(p)}
                              className="text-[10px] font-medium px-3 py-1.5 rounded-lg bg-[#EFE8DD] text-[#5B5560] hover:bg-[#E5DDD3] transition-colors"
                            >
                              編集
                            </button>
                            <button
                              onClick={() => openFeedbackModal(p.name)}
                              className="text-[10px] font-medium px-3 py-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors"
                            >
                              FB送信
                            </button>
                          </>
                        )}
                      </div>
                      <span className="text-[10px] text-[#8B8489]">{status.label}</span>
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
          <div className="px-5 py-4 border-b border-[#EFE8DD] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#1A1A2E]">マネージャー一覧</h2>
            {!isObserver && (
              <div className="flex items-center gap-2">
                <button onClick={() => { setShowManagerImport(true); setManagerImportStep("input"); setManagerCsvText(""); setManagerImportPreview(null); setManagerImportResult(null); setManagerImportError(null); }} className="text-xs px-4 py-2 rounded-xl border border-[#C4A882] text-[#8B7355] hover:bg-[#FBF8F4] transition-colors">
                  📄 CSVインポート
                </button>
                <button onClick={() => setShowAddManager(true)} className="text-xs font-medium px-4 py-2 rounded-xl bg-amber-500 text-white hover:bg-amber-600 transition-colors">
                  + マネージャーを追加
                </button>
              </div>
            )}
          </div>
          <div className="divide-y divide-[#EFE8DD]">
            {managers.map((m) => (
              <div key={m.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-[#1A1A2E]">{m.name}</span>
                      {m.isAdmin && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">管理者</span>
                      )}
                      {m.role === "observer" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">閲覧者</span>
                      )}
                    </div>
                    <div className="text-[11px] text-[#8B8489] mt-0.5">{m.department}{m.email ? ` · ${m.email}` : ""}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-xs text-[#1A1A2E] font-medium">担当: {m.participantNames.length}名</div>
                      <div className="text-[11px] text-[#8B8489] mt-0.5">{m.participantNames.join("、")}</div>
                    </div>
                    {!isObserver && (
                      <button
                        onClick={() => openEditManager(m)}
                        className="text-[10px] font-medium px-3 py-1.5 rounded-lg bg-[#EFE8DD] text-[#5B5560] hover:bg-[#E5DDD3] transition-colors shrink-0"
                      >
                        編集
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* System Info */}
        <div className="card overflow-hidden mb-5">
          <div className="px-5 py-4 border-b border-[#EFE8DD]">
            <h2 className="text-sm font-semibold text-[#1A1A2E]">システム情報</h2>
          </div>
          <div className="p-4 space-y-0">
            {[
              { label: "データベース", value: "Supabase（PostgreSQL）", status: "emerald" },
              { label: "ホスティング", value: "Vercel", status: "emerald" },
              { label: "認証方式", value: "OTP認証 + セッションCookie", status: "" },
              { label: "マネージャー数", value: `${data?.managers?.length ?? 0}名`, status: "" },
              { label: "参加者数", value: `${data?.participants?.length ?? 0}名`, status: "" },
              { label: "AIフィードバック", value: "Claude Sonnet", status: "emerald" },
            ].map((item, i) => (
              <div key={i} className="flex justify-between items-center py-2.5 border-b border-[#F5F0EB] last:border-0">
                <span className="text-xs text-[#8B8489]">{item.label}</span>
                <span className={`text-xs font-medium ${
                  item.status === "emerald" ? "text-emerald-500" : item.status === "amber" ? "text-amber-500" : "text-[#1A1A2E]"
                }`}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Feature Management Tools */}
        {featuresLoaded && (
          <>
            {/* Organization Analysis */}
            {(isOn("tier-b.cultureScore") || isOn("tier-f.growthRoi") || isOn("tier-e.microRitualOptimizer")) && (
              <div className="mb-6">
                <h2 className="text-sm font-semibold text-[#5B5560] uppercase tracking-wide px-1 mb-3">組織分析</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {isOn("tier-b.cultureScore") && (
                    <a href={`/a/${token}/features/culture`} className="card p-4 hover:shadow-md transition-shadow">
                      <div className="text-2xl mb-2">📊</div>
                      <h3 className="text-sm font-semibold text-[#1A1A2E] mb-1">カルチャースコア</h3>
                      <p className="text-xs text-[#8B8489]">組織文化メトリクス</p>
                    </a>
                  )}
                  {isOn("tier-f.growthRoi") && (
                    <a href={`/a/${token}/features/growth-roi`} className="card p-4 hover:shadow-md transition-shadow">
                      <div className="text-2xl mb-2">📈</div>
                      <h3 className="text-sm font-semibold text-[#1A1A2E] mb-1">成長ROI</h3>
                      <p className="text-xs text-[#8B8489]">学習効果を可視化</p>
                    </a>
                  )}
                  {isOn("tier-e.microRitualOptimizer") && (
                    <a href={`/a/${token}/features/ritual-metrics`} className="card p-4 hover:shadow-md transition-shadow">
                      <div className="text-2xl mb-2">🔄</div>
                      <h3 className="text-sm font-semibold text-[#1A1A2E] mb-1">リチュアルメトリクス</h3>
                      <p className="text-xs text-[#8B8489]">実施統計</p>
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Reports */}
            {(isOn("tier-f.clientReport") || isOn("tier-g.pitchGenerator")) && (
              <div className="mb-6">
                <h2 className="text-sm font-semibold text-[#5B5560] uppercase tracking-wide px-1 mb-3">レポート生成</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {isOn("tier-f.clientReport") && (
                    <a href={`/a/${token}/features/client-report`} className="card p-4 hover:shadow-md transition-shadow">
                      <div className="text-2xl mb-2">📄</div>
                      <h3 className="text-sm font-semibold text-[#1A1A2E] mb-1">クライアントレポート</h3>
                      <p className="text-xs text-[#8B8489]">成果報告書生成</p>
                    </a>
                  )}
                  {isOn("tier-g.pitchGenerator") && (
                    <a href={`/a/${token}/features/pitch`} className="card p-4 hover:shadow-md transition-shadow">
                      <div className="text-2xl mb-2">🎯</div>
                      <h3 className="text-sm font-semibold text-[#1A1A2E] mb-1">ピッチ生成</h3>
                      <p className="text-xs text-[#8B8489]">営業提案書</p>
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Operations */}
            {(isOn("tier-g.multiTenant") || isOn("tier-g.consultIntervention") || isOn("tier-b.knowledgeLibrary")) && (
              <div className="mb-6">
                <h2 className="text-sm font-semibold text-[#5B5560] uppercase tracking-wide px-1 mb-3">運用管理</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {isOn("tier-g.multiTenant") && (
                    <a href={`/a/${token}/features/tenants`} className="card p-4 hover:shadow-md transition-shadow">
                      <div className="text-2xl mb-2">🏢</div>
                      <h3 className="text-sm font-semibold text-[#1A1A2E] mb-1">マルチテナント</h3>
                      <p className="text-xs text-[#8B8489]">複数組織管理</p>
                    </a>
                  )}
                  {isOn("tier-g.consultIntervention") && (
                    <a href={`/a/${token}/features/consult`} className="card p-4 hover:shadow-md transition-shadow">
                      <div className="text-2xl mb-2">👥</div>
                      <h3 className="text-sm font-semibold text-[#1A1A2E] mb-1">介入ログ</h3>
                      <p className="text-xs text-[#8B8489]">コーチング記録</p>
                    </a>
                  )}

                  {isOn("tier-a.consultantSpotlight") && (
                    <a href={`/a/${token}/features/spotlight`} className="card p-4 hover:shadow-md transition-shadow">
                      <div className="text-2xl mb-2">🔍</div>
                      <h3 className="text-sm font-semibold text-[#1A1A2E] mb-1">スポットライト</h3>
                      <p className="text-xs text-[#8B8489]">注目参加者AI分析</p>
                    </a>
                  )}
                  {isOn("tier-b.knowledgeLibrary") && (
                    <a href={`/a/${token}/features/knowledge`} className="card p-4 hover:shadow-md transition-shadow">
                      <div className="text-2xl mb-2">📚</div>
                      <h3 className="text-sm font-semibold text-[#1A1A2E] mb-1">ナレッジ</h3>
                      <p className="text-xs text-[#8B8489]">組織学習</p>
                    </a>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* Quick Links */}
        <div className="card overflow-hidden mb-8">
          <div className="px-5 py-4 border-b border-[#EFE8DD]">
            <h2 className="text-sm font-semibold text-[#1A1A2E]">クイックリンク</h2>
          </div>
          <div className="p-4 space-y-3">
            {/* Manager links */}
            {data?.managers && data.managers.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold text-[#8B8489] uppercase tracking-wider mb-2">マネージャー画面</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {data.managers.map((m: ManagerData) => (
                    <a key={m.id} href={`/m/${m.token}`} className="block p-3 bg-amber-50/50 rounded-xl border border-amber-100 hover:bg-amber-50 transition-colors">
                      <div className="font-medium text-amber-600 text-xs mb-0.5">{m.name}</div>
                      <div className="text-[10px] text-[#8B8489]">{m.department || ""}{m.role === "admin" ? " · 管理者" : m.role === "observer" ? " · 閲覧者" : ""}</div>
                    </a>
                  ))}
                </div>
              </div>
            )}
            {/* Participant links */}
            {data?.participants && data.participants.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold text-[#8B8489] uppercase tracking-wider mb-2">参加者画面</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {data.participants.map((p: ParticipantData) => (
                    <a key={p.id} href={`/p/${p.token}`} className="block p-3 bg-indigo-50/50 rounded-xl border border-indigo-100 hover:bg-indigo-50 transition-colors">
                      <div className="font-medium text-[#1A1A2E] text-xs mb-0.5">{p.name}</div>
                      <div className="text-[10px] text-[#8B8489]">{p.managerId && data?.managers ? `上司: ${data.managers.find((m: ManagerData) => m.id === p.managerId)?.name || ""}` : ""}</div>
                    </a>
                  ))}
                </div>
              </div>
            )}
            {/* External links */}
            <div>
              <div className="text-[10px] font-semibold text-[#8B8489] uppercase tracking-wider mb-2">外部ツール</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <a href="https://supabase.com/dashboard/project/vnfmbkftbnjruwsdlvtv" target="_blank" rel="noopener noreferrer" className="block p-3 bg-emerald-50/50 rounded-xl border border-emerald-100 hover:bg-emerald-50 transition-colors">
                  <div className="font-medium text-emerald-600 text-xs mb-0.5">Supabase Dashboard</div>
                  <div className="text-[10px] text-[#8B8489]">データベース管理・テーブル編集</div>
                </a>
                <a href="https://vercel.com/naokihondo-humanmatures-projects/core-log" target="_blank" rel="noopener noreferrer" className="block p-3 bg-gray-50/50 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors">
                  <div className="font-medium text-[#1A1A2E] text-xs mb-0.5">Vercel Dashboard</div>
                  <div className="text-[10px] text-[#8B8489]">デプロイ状況・ログ確認</div>
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center text-[11px] text-[#C9BDAE] pb-8">
          CORE Log v1.0 — Powered by Next.js + Supabase
        </div>
      </div>

      {/* Add Participant Modal */}
      {!isObserver && showAddParticipant && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-[#EFE8DD]">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-[#1A1A2E]">参加者を追加</h3>
                <button onClick={() => setShowAddParticipant(false)} className="text-[#8B8489] hover:text-[#5B5560]">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <p className="text-xs text-[#8B8489] mt-1">トークンは自動生成されます</p>
            </div>
            <form onSubmit={handleAddParticipant} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#2C2C4A] mb-1.5">名前 *</label>
                <input name="name" required placeholder="例: 山田 太郎" className="input-field text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#2C2C4A] mb-1.5">メール *</label>
                <input name="email" type="email" required placeholder="例: taro.yamada@example.com" className="input-field text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#2C2C4A] mb-1.5">部署</label>
                <input name="department" placeholder="例: 製造部" className="input-field text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#2C2C4A] mb-1.5">道場フェーズ</label>
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
                  <label className="block text-xs font-medium text-[#2C2C4A] mb-1.5">役割</label>
                  <select name="role" className="input-field text-sm">
                    <option value="参加者">参加者</option>
                    <option value="HM社内">HM社内</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#2C2C4A] mb-1.5">担当上司</label>
                <select name="managerId" className="input-field text-sm">
                  <option value="">未設定</option>
                  {managerOptions.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" name="emailEnabled" id="emailEnabled" className="rounded border-[#C9BDAE]" />
                <label htmlFor="emailEnabled" className="text-xs text-[#2C2C4A]">メール通知を有効にする</label>
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
      {!isObserver && showFeedbackModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-5 border-b border-[#EFE8DD]">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-[#1A1A2E]">HMフィードバック送信</h3>
                <button onClick={() => setShowFeedbackModal(false)} className="text-[#8B8489] hover:text-[#5B5560]">
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
                <p className="text-[11px] text-[#8B8489] mt-1">本人にメール通知が送信されます</p>
              </div>
            ) : (
              <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
                <div className="bg-[#F5F0EB] rounded-xl p-3 border border-[#EFE8DD]">
                  <p className="text-[10px] font-medium text-[#1A1A2E] tracking-wide uppercase mb-2">直近1週間のログ</p>
                  {fbLogsLoading ? (
                    <div className="text-center py-2">
                      <div className="w-4 h-4 border-2 border-[#1A1A2E] border-t-transparent rounded-full animate-spin mx-auto"></div>
                    </div>
                  ) : fbRecentLogs.length === 0 ? (
                    <p className="text-xs text-[#C9BDAE] text-center py-2">直近のログがありません</p>
                  ) : (
                    <div className="space-y-1.5">
                      {fbRecentLogs.map((log, i) => (
                        <div key={i} className="bg-white rounded-lg px-3 py-2 text-xs border border-[#EFE8DD]">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-[#1A1A2E]">{log.date} ({log.dayOfWeek})</span>
                            {log.energy && <span className="text-sm leading-none">{energyEmoji[log.energy] || ""}</span>}
                          </div>
                          <p className="text-[#1A1A2E]">朝: {log.morningIntent || "—"}</p>
                          {log.eveningInsight && <p className="text-amber-600 mt-0.5">夜: {log.eveningInsight}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#2C2C4A] mb-1.5">対象期間</label>
                    <input value={fbPeriod} onChange={(e) => setFbPeriod(e.target.value)} placeholder="例: 2026年3月第4週" className="input-field text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#2C2C4A] mb-1.5">週番号</label>
                    <input type="number" min={1} max={52} value={fbWeekNum} onChange={(e) => setFbWeekNum(Number(e.target.value))} className="input-field text-sm" />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-medium text-[#2C2C4A]">フィードバック内容 *</label>
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
                    className="flex-1 py-2.5 text-sm font-medium rounded-xl bg-amber-500 text-white hover:bg-amber-600 disabled:bg-[#C9BDAE] disabled:text-[#8B8489] transition-colors">
                    {fbSubmitting ? "送信中..." : "送信する"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* FB History Modal (read-only, visible to admin + observer) */}
      {showFbHistory && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
            <div className="p-5 border-b border-[#EFE8DD] flex items-center justify-between">
              <h3 className="text-base font-semibold text-[#1A1A2E]">{fbHistoryTarget} のFB履歴</h3>
              <button onClick={() => setShowFbHistory(false)} className="text-[#8B8489] hover:text-[#5B5560]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex-1">
              {fbHistoryLoading ? (
                <div className="text-center text-sm text-[#8B8489] py-8">読み込み中...</div>
              ) : fbHistoryList.length === 0 ? (
                <div className="text-center text-sm text-[#8B8489] py-8">フィードバック履歴がありません</div>
              ) : (
                <div className="space-y-4">
                  {fbHistoryList.map((fb) => (
                    <div key={fb.id} className="bg-amber-50/50 border border-amber-100 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-medium text-amber-600">{fb.type || "HMフィードバック"}</span>
                        <span className="text-[10px] text-[#8B8489]">
                          {fb.date || ""}
                          {fb.period ? ` · ${fb.period}` : ""}
                        </span>
                      </div>
                      <p className="text-xs text-[#2C2C4A] leading-relaxed whitespace-pre-wrap">{fb.content}</p>
                      <div className="mt-1.5 text-[10px] text-[#8B8489]">by {fb.authorName}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Prompt Settings Modal */}
      {!isObserver && showPromptSettings && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="p-5 border-b border-[#EFE8DD]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-[#1A1A2E]">AIフィードバック設定</h3>
                    <p className="text-[10px] text-[#8B8489]">システムプロンプトを編集して、AI生成の文体や方針を調整できます</p>
                  </div>
                </div>
                <button onClick={() => setShowPromptSettings(false)} className="text-[#8B8489] hover:text-[#5B5560]">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>
            <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto">
              {promptLoading ? (
                <div className="text-center py-8">
                  <div className="w-6 h-6 border-2 border-[#1A1A2E] border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                  <p className="text-xs text-[#8B8489]">読み込み中...</p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-[#2C2C4A] mb-1.5">システムプロンプト</label>
                    <p className="text-[10px] text-[#8B8489] mb-2">AIがフィードバックを生成する際のベースとなる指示文です。参加者ごとの個別方針は、参加者一覧の編集画面から「FB方針」欄で設定できます。</p>
                    <textarea
                      value={promptText}
                      onChange={(e) => setPromptText(e.target.value)}
                      rows={14}
                      className="input-field text-sm resize-none leading-relaxed font-mono"
                      placeholder="AIへの指示文を入力..."
                    />
                  </div>
                  <div className="bg-violet-50 rounded-xl p-3 border border-violet-100">
                    <p className="text-[10px] font-medium text-violet-600 mb-1">参加者ごとの個別調整</p>
                    <p className="text-[10px] text-violet-500 leading-relaxed">参加者一覧の編集ボタンから「FB方針」欄に、参加者ごとの方針を記入するとAI生成時に反映されます。例: 「具体的な数値目標を含めて厳しめに」「モチベーション維持を重視して」</p>
                  </div>
                </>
              )}
            </div>
            <div className="p-5 border-t border-[#EFE8DD] flex items-center gap-3">
              <button onClick={() => setShowPromptSettings(false)} className="btn-secondary flex-1 py-2.5 text-sm">閉じる</button>
              <button onClick={handleSavePrompt} disabled={promptSaving || promptLoading}
                className="flex-1 py-2.5 text-sm font-medium rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 text-white hover:from-violet-600 hover:to-purple-700 disabled:from-gray-300 disabled:to-gray-400 disabled:text-gray-500 transition-all">
                {promptSaving ? "保存中..." : promptSaved ? "保存しました ✓" : "保存する"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Manager Modal */}
      {!isObserver && showAddManager && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-5 border-b border-[#EFE8DD]">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-[#1A1A2E]">マネージャーを追加</h3>
                <button onClick={() => setShowAddManager(false)} className="text-[#8B8489] hover:text-[#5B5560]">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <p className="text-xs text-[#8B8489] mt-1">トークンは自動生成されます</p>
            </div>
            <form onSubmit={handleAddManager} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#2C2C4A] mb-1.5">名前 *</label>
                <input name="name" required placeholder="例: 鈴木 花子" className="input-field text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#2C2C4A] mb-1.5">メール *</label>
                <input name="email" type="email" required placeholder="例: hanako.suzuki@example.com" className="input-field text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#2C2C4A] mb-1.5">部署</label>
                <input name="department" placeholder="例: 人事部" className="input-field text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#2C2C4A] mb-1.5">役割 *</label>
                <select name="role" defaultValue="manager" className="input-field text-sm bg-white">
                  <option value="manager">マネージャー</option>
                  <option value="admin">管理者（管理画面アクセス可）</option>
                  <option value="observer">閲覧者（オブザーバー）</option>
                </select>
                <p className="text-[11px] text-[#8B8489] mt-1">後から編集モーダルでも変更できます。</p>
              </div>
              {/* テナント選択：admin が全テナント表示中で、テナントが 2 つ以上ある場合のみ表示 */}
              {data?.viewerRole === "admin" && !selectedTenantSlug && data?.tenants && data.tenants.length > 1 && (
                <div>
                  <label className="block text-xs font-medium text-[#2C2C4A] mb-1.5">所属テナント *</label>
                  <select name="tenantSlug" required defaultValue="" className="input-field text-sm bg-white">
                    <option value="" disabled>選択してください</option>
                    {data.tenants.map((t) => (
                      <option key={t.slug} value={t.slug}>{t.companyName || t.name}</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-[#8B8489] mt-1">「全テナント表示」中のため、追加先を選んでください。</p>
                </div>
              )}
              {/* 特定テナント表示中の場合：追加先を明示（情報のみ） */}
              {selectedTenantSlug && data?.tenants && (
                <div className="bg-[#FBF8F4] rounded-lg px-3 py-2.5 text-xs text-[#5B5560]">
                  <span className="font-medium">追加先テナント：</span>
                  {data.tenants.find((t) => t.slug === selectedTenantSlug)?.companyName ||
                    data.tenants.find((t) => t.slug === selectedTenantSlug)?.name ||
                    selectedTenantSlug}
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAddManager(false)} className="btn-secondary flex-1 py-2.5 text-sm">キャンセル</button>
                <button type="submit" disabled={submitting} className="btn-primary flex-1 py-2.5 text-sm">{submitting ? "追加中..." : "追加する"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* CSV Import Modal */}
      {!isObserver && showImportModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setShowImportModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#EFE8DD]">
              <h3 className="text-base font-semibold text-[#1A1A2E]">CSV一括インポート</h3>
              <button onClick={() => setShowImportModal(false)} className="text-[#8B8489] hover:text-[#5B5560]">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-5 space-y-4">

              {/* Step 1: Input */}
              {importStep === "input" && (
                <>
                  <div className="bg-[#FBF8F4] rounded-xl p-4 text-xs text-[#5B5560] space-y-2">
                    <p className="font-semibold text-[#2C2C4A]">CSV形式ガイド</p>
                    <p>1行目はヘッダー行です。以下の列名が使えます:</p>
                    <p className="font-mono bg-white rounded px-2 py-1">name, email, department, role, dojoPhase, managerName</p>
                    <p><strong>role</strong>の選択肢: 参加者（デフォルト）/ マネージャー / 管理者 / 閲覧者</p>
                    <p><strong>dojoPhase</strong>の選択肢: 道場1 覚醒 〜 道場7 卒業（参加者のみ。省略時は「道場1 覚醒」）</p>
                    <p><strong>managerName</strong>: 上司の名前（参加者のみ）。マネージャー行を参加者行より上に配置してください</p>
                    <p className="text-[#8B7355]">日本語ヘッダー（名前, メール, 部署, 役割, 道場, 上司）にも対応しています</p>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-medium text-[#2C2C4A]">CSVデータ</label>
                      <a href={`/api/admin/import?token=${token}`} download className="text-xs text-[#8B7355] hover:text-[#6B5335] underline">テンプレートをダウンロード</a>
                    </div>
                    <textarea
                      value={csvText}
                      onChange={(e) => setCsvText(e.target.value)}
                      rows={10}
                      placeholder={"name,email,department,role,dojoPhase,managerName\n田中太郎,tanaka@example.com,営業部,マネージャー,,\n佐藤花子,sato@example.com,営業部,参加者,道場1 覚醒,田中太郎"}
                      className="input-field text-sm font-mono w-full"
                    />
                    <p className="text-xs text-[#8B8489] mt-1">CSVファイルの内容をペーストするか、直接入力してください</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-[#5B5560] flex items-center gap-2 cursor-pointer rounded-xl border border-dashed border-[#C9BDAE] px-4 py-3 hover:bg-[#FBF8F4] transition-colors w-full justify-center">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                      CSVファイルを選択
                      <input type="file" accept=".csv,.txt" className="hidden" onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            const text = ev.target?.result as string;
                            if (text) setCsvText(text);
                          };
                          reader.readAsText(file, "UTF-8");
                        }
                      }} />
                    </label>
                  </div>
                  {importError && (
                    <div className="bg-red-50 rounded-xl p-4 text-xs text-red-700 space-y-1">
                      <p className="font-semibold">{importError.error}</p>
                      {importError.details?.map((d, i) => <p key={i}>• {d}</p>)}
                    </div>
                  )}
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => setShowImportModal(false)} className="btn-secondary flex-1 py-2.5 text-sm">キャンセル</button>
                    <button
                      disabled={!csvText.trim() || importLoading}
                      onClick={async () => {
                        setImportLoading(true); setImportError(null);
                        try {
                          const res = await fetch("/api/admin/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, csv: csvText, dryRun: true }) });
                          const json = await res.json();
                          if (!res.ok) {
                            setImportError({ error: json.error, details: [...(json.details || []), ...(json.duplicates || [])] });
                          } else {
                            setImportPreview(json);
                            setImportStep("preview");
                          }
                        } catch { setImportError({ error: "通信エラーが発生しました" }); }
                        setImportLoading(false);
                      }}
                      className="btn-primary flex-1 py-2.5 text-sm"
                    >{importLoading ? "検証中..." : "プレビュー"}</button>
                  </div>
                </>
              )}

              {/* Step 2: Preview */}
              {importStep === "preview" && importPreview && (
                <>
                  <div className="bg-[#FBF8F4] rounded-xl p-4 text-xs space-y-1">
                    <p className="font-semibold text-[#2C2C4A]">インポート内容の確認</p>
                    <p>合計: <strong>{importPreview.summary.total}名</strong>（マネージャー {importPreview.summary.managers}名 + 参加者 {importPreview.summary.participants}名）</p>
                    {importPreview.summary.duplicates > 0 && (
                      <p className="text-amber-600">⚠️ {importPreview.summary.duplicates}名は既に登録済みのためスキップされます</p>
                    )}
                    <p className="text-green-700">✅ 新規登録: <strong>{importPreview.summary.newRegistrations}名</strong></p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[#EFE8DD] text-left text-[#8B8489]">
                          <th className="py-2 pr-3">名前</th>
                          <th className="py-2 pr-3">メール</th>
                          <th className="py-2 pr-3">部署</th>
                          <th className="py-2 pr-3">役割</th>
                          <th className="py-2 pr-3">道場</th>
                          <th className="py-2 pr-3">上司</th>
                          <th className="py-2">状態</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.rows.map((row, i) => (
                          <tr key={i} className={`border-b border-[#EFE8DD] ${row.isDuplicate ? "opacity-50" : ""}`}>
                            <td className="py-2 pr-3 font-medium text-[#1A1A2E]">{row.name}</td>
                            <td className="py-2 pr-3 text-[#5B5560]">{row.email}</td>
                            <td className="py-2 pr-3 text-[#5B5560]">{row.department}</td>
                            <td className="py-2 pr-3"><span className={`px-1.5 py-0.5 rounded text-[10px] ${row.role === "参加者" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>{row.role}</span></td>
                            <td className="py-2 pr-3 text-[#5B5560]">{row.dojoPhase}</td>
                            <td className="py-2 pr-3 text-[#5B5560]">{row.managerName || "-"}</td>
                            <td className="py-2">{row.isDuplicate ? <span className="text-amber-600">重複</span> : <span className="text-green-600">新規</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => { setImportStep("input"); setImportPreview(null); }} className="btn-secondary flex-1 py-2.5 text-sm">戻る</button>
                    <button
                      disabled={importLoading || importPreview.summary.newRegistrations === 0}
                      onClick={async () => {
                        setImportLoading(true);
                        try {
                          const res = await fetch("/api/admin/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, csv: csvText, dryRun: false }) });
                          const json = await res.json();
                          if (res.ok) {
                            setImportResult(json);
                            setImportStep("result");
                            // refresh participant list
                            const refreshRes = await fetch(`/api/admin?token=${token}${selectedTenantSlug ? `&tenant=${selectedTenantSlug}` : ""}`);
                            if (refreshRes.ok) { const d = await refreshRes.json(); setData(d); }
                          } else {
                            setImportError({ error: json.error, details: json.details });
                            setImportStep("input");
                          }
                        } catch { setImportError({ error: "通信エラーが発生しました" }); setImportStep("input"); }
                        setImportLoading(false);
                      }}
                      className="btn-primary flex-1 py-2.5 text-sm"
                    >{importLoading ? "登録中..." : `${importPreview.summary.newRegistrations}名を登録する`}</button>
                  </div>
                </>
              )}

              {/* Step 3: Result */}
              {importStep === "result" && importResult && (
                <>
                  <div className="bg-green-50 rounded-xl p-4 text-xs space-y-1">
                    <p className="font-semibold text-green-800">インポート完了</p>
                    <p>成功: <strong>{importResult.summary.success}名</strong>　スキップ: {importResult.summary.skipped}名　エラー: {importResult.summary.errors}名</p>
                  </div>
                  <div className="overflow-x-auto max-h-80">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-white">
                        <tr className="border-b border-[#EFE8DD] text-left text-[#8B8489]">
                          <th className="py-2 pr-3">名前</th>
                          <th className="py-2 pr-3">役割</th>
                          <th className="py-2 pr-3">結果</th>
                          <th className="py-2">トークンURL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importResult.results.map((r, i) => (
                          <tr key={i} className="border-b border-[#EFE8DD]">
                            <td className="py-2 pr-3 font-medium text-[#1A1A2E]">{r.name}</td>
                            <td className="py-2 pr-3"><span className={`px-1.5 py-0.5 rounded text-[10px] ${r.role === "参加者" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>{r.role || "参加者"}</span></td>
                            <td className="py-2 pr-3">{r.status === "success" ? <span className="text-green-600">✅ 登録</span> : r.status === "skipped" ? <span className="text-amber-600">⏭️ スキップ</span> : <span className="text-red-600">❌ エラー</span>}</td>
                            <td className="py-2 font-mono text-[10px] text-[#5B5560] break-all">{r.url || r.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button
                    onClick={() => {
                      // Copy all URLs to clipboard
                      const lines = importResult.results
                        .filter((r) => r.status === "success" && r.url)
                        .map((r) => `${r.name}\t${r.email}\t${r.role || "参加者"}\t${r.url}`)
                        .join("\n");
                      navigator.clipboard.writeText(lines);
                    }}
                    className="text-xs text-[#8B7355] hover:text-[#6B5335] underline"
                  >📋 全URLをコピー（タブ区切り）</button>
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => setShowImportModal(false)} className="btn-primary flex-1 py-2.5 text-sm">閉じる</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Participant Edit Modal */}
      {editingParticipant && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditingParticipant(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-[#EFE8DD] flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#1A1A2E]">参加者を編集: {editingParticipant.name}</h3>
              <button onClick={() => setEditingParticipant(null)} className="text-[#8B8489] hover:text-[#1A1A2E]">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-[#5B5560] block mb-1">名前</label>
                <input type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full text-sm border border-[#EFE8DD] rounded-xl px-3 py-2 focus:ring-1 focus:ring-amber-300 focus:border-amber-300 outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-[#5B5560] block mb-1">メールアドレス</label>
                <input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full text-sm border border-[#EFE8DD] rounded-xl px-3 py-2 focus:ring-1 focus:ring-amber-300 focus:border-amber-300 outline-none"
                  placeholder="変更しない場合は空白" />
              </div>
              <div>
                <label className="text-xs font-medium text-[#5B5560] block mb-1">部署</label>
                <input type="text" value={editForm.department} onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                  className="w-full text-sm border border-[#EFE8DD] rounded-xl px-3 py-2 focus:ring-1 focus:ring-amber-300 focus:border-amber-300 outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-[#5B5560] block mb-1">道場フェーズ</label>
                <select value={editForm.dojoPhase} onChange={(e) => setEditForm({ ...editForm, dojoPhase: e.target.value })}
                  className="w-full text-sm border border-[#EFE8DD] rounded-xl px-3 py-2 focus:ring-1 focus:ring-amber-300 focus:border-amber-300 outline-none">
                  {["道場1 覚醒","道場2 探究","道場3 挑戦","道場4 変容","道場5 統合","道場6 共創","道場7 卒業"].map((ph) => (
                    <option key={ph} value={ph}>{ph}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-[#5B5560] block mb-1">担当マネージャー</label>
                <select value={editForm.managerId} onChange={(e) => setEditForm({ ...editForm, managerId: e.target.value })}
                  className="w-full text-sm border border-[#EFE8DD] rounded-xl px-3 py-2 focus:ring-1 focus:ring-amber-300 focus:border-amber-300 outline-none">
                  <option value="">（未設定）</option>
                  {managerOptions.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-[#5B5560] block mb-1">FB方針</label>
                <textarea value={editForm.fbPolicy} onChange={(e) => setEditForm({ ...editForm, fbPolicy: e.target.value })}
                  className="w-full text-sm border border-[#EFE8DD] rounded-xl px-3 py-2 focus:ring-1 focus:ring-amber-300 focus:border-amber-300 outline-none h-20 resize-none"
                  placeholder="フィードバックの方針を入力" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-[#5B5560] block mb-1">開始日</label>
                  <input type="date" value={editForm.startDate} onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })}
                    className="w-full text-sm border border-[#EFE8DD] rounded-xl px-3 py-2 focus:ring-1 focus:ring-amber-300 focus:border-amber-300 outline-none" />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#5B5560] block mb-1">終了日</label>
                  <input type="date" value={editForm.endDate} onChange={(e) => setEditForm({ ...editForm, endDate: e.target.value })}
                    className="w-full text-sm border border-[#EFE8DD] rounded-xl px-3 py-2 focus:ring-1 focus:ring-amber-300 focus:border-amber-300 outline-none" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="editEmailEnabled" checked={editForm.emailEnabled}
                  onChange={(e) => setEditForm({ ...editForm, emailEnabled: e.target.checked })}
                  className="rounded border-[#EFE8DD]" />
                <label htmlFor="editEmailEnabled" className="text-xs text-[#5B5560]">メール通知を有効にする</label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setEditingParticipant(null)}
                  className="text-xs px-4 py-2 rounded-xl border border-[#EFE8DD] text-[#5B5560] hover:bg-[#FBF8F4] transition-colors">
                  キャンセル
                </button>
                <button onClick={handleSaveParticipant} disabled={editSaving}
                  className="btn-accent text-xs px-4 py-2 disabled:opacity-50">
                  {editSaving ? "保存中..." : "保存"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manager Edit Modal */}
      {editingManager && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditingManager(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-[#EFE8DD] flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#1A1A2E]">マネージャーを編集: {editingManager.name}</h3>
              <button onClick={() => setEditingManager(null)} className="text-[#8B8489] hover:text-[#1A1A2E]">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-[#5B5560] block mb-1">名前</label>
                <input type="text" value={editManagerForm.name} onChange={(e) => setEditManagerForm({ ...editManagerForm, name: e.target.value })}
                  className="w-full text-sm border border-[#EFE8DD] rounded-xl px-3 py-2 focus:ring-1 focus:ring-amber-300 focus:border-amber-300 outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-[#5B5560] block mb-1">メールアドレス</label>
                <input type="email" value={editManagerForm.email} onChange={(e) => setEditManagerForm({ ...editManagerForm, email: e.target.value })}
                  className="w-full text-sm border border-[#EFE8DD] rounded-xl px-3 py-2 focus:ring-1 focus:ring-amber-300 focus:border-amber-300 outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-[#5B5560] block mb-1">部署</label>
                <input type="text" value={editManagerForm.department} onChange={(e) => setEditManagerForm({ ...editManagerForm, department: e.target.value })}
                  className="w-full text-sm border border-[#EFE8DD] rounded-xl px-3 py-2 focus:ring-1 focus:ring-amber-300 focus:border-amber-300 outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-[#5B5560] block mb-1">役割</label>
                <select value={editManagerForm.role}
                  onChange={(e) => {
                    const newRole = e.target.value;
                    setEditManagerForm({ ...editManagerForm, role: newRole, isAdmin: newRole === "admin" });
                  }}
                  className="w-full text-sm border border-[#EFE8DD] rounded-xl px-3 py-2 focus:ring-1 focus:ring-amber-300 focus:border-amber-300 outline-none bg-white">
                  <option value="admin">管理者（管理画面アクセス可）</option>
                  <option value="manager">マネージャー</option>
                  <option value="observer">閲覧者（オブザーバー）</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setEditingManager(null)}
                  className="text-xs px-4 py-2 rounded-xl border border-[#EFE8DD] text-[#5B5560] hover:bg-[#FBF8F4] transition-colors">
                  キャンセル
                </button>
                <button onClick={handleSaveManager} disabled={editManagerSaving}
                  className="btn-accent text-xs px-4 py-2 disabled:opacity-50">
                  {editManagerSaving ? "保存中..." : "保存"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manager CSV Import Modal */}
      {showManagerImport && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowManagerImport(false)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-[#EFE8DD] flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#1A1A2E]">マネージャー CSV一括インポート</h3>
              <button onClick={() => setShowManagerImport(false)} className="text-[#8B8489] hover:text-[#1A1A2E]">✕</button>
            </div>
            <div className="p-5">
              {managerImportStep === "input" && (
                <div className="space-y-4">
                  <div className="text-xs text-[#5B5560] bg-[#FBF8F4] rounded-xl p-3 border border-[#EFE8DD]">
                    <p className="font-medium mb-1">CSVフォーマット:</p>
                    <code className="text-[10px] block bg-white rounded-lg p-2 border border-[#EFE8DD]">
                      name,email,department,role<br/>
                      田中太郎,tanaka@example.com,営業部,マネージャー<br/>
                      佐藤花子,sato@example.com,人事部,管理者
                    </code>
                    <p className="mt-2 text-[10px] text-[#8B8489]">role列: 「マネージャー」「管理者」「閲覧者」を指定</p>
                  </div>
                  <textarea value={managerCsvText} onChange={(e) => setManagerCsvText(e.target.value)}
                    className="w-full text-sm border border-[#EFE8DD] rounded-xl px-3 py-2 focus:ring-1 focus:ring-amber-300 focus:border-amber-300 outline-none h-40 resize-none font-mono"
                    placeholder="CSVデータを貼り付け..." />
                  {managerImportError && (
                    <div className="text-xs text-red-600 bg-red-50 rounded-xl p-3 border border-red-100">
                      <p className="font-medium">{managerImportError.error}</p>
                      {managerImportError.details?.map((d, i) => <p key={i} className="mt-1">{d}</p>)}
                    </div>
                  )}
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setShowManagerImport(false)}
                      className="text-xs px-4 py-2 rounded-xl border border-[#EFE8DD] text-[#5B5560] hover:bg-[#FBF8F4] transition-colors">
                      キャンセル
                    </button>
                    <button onClick={handleManagerImportDryRun} disabled={managerImportLoading || !managerCsvText.trim()}
                      className="btn-accent text-xs px-4 py-2 disabled:opacity-50">
                      {managerImportLoading ? "検証中..." : "プレビュー"}
                    </button>
                  </div>
                </div>
              )}
              {managerImportStep === "preview" && managerImportPreview && (
                <div className="space-y-4">
                  <div className="text-xs bg-[#FBF8F4] rounded-xl p-3 border border-[#EFE8DD]">
                    <p>合計: <strong>{managerImportPreview.summary.total}名</strong> / 新規登録: <strong>{managerImportPreview.summary.newRegistrations}名</strong> / 重複: <strong>{managerImportPreview.summary.duplicates}名</strong></p>
                  </div>
                  <div className="border border-[#EFE8DD] rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-[#FBF8F4]">
                        <tr><th className="px-3 py-2 text-left">名前</th><th className="px-3 py-2 text-left">メール</th><th className="px-3 py-2 text-left">部署</th><th className="px-3 py-2 text-left">役割</th><th className="px-3 py-2 text-left">状態</th></tr>
                      </thead>
                      <tbody className="divide-y divide-[#EFE8DD]">
                        {managerImportPreview.rows.map((r, i) => (
                          <tr key={i} className={r.isDuplicate ? "bg-amber-50" : ""}>
                            <td className="px-3 py-2">{r.name}</td><td className="px-3 py-2">{r.email}</td>
                            <td className="px-3 py-2">{r.department}</td><td className="px-3 py-2">{r.role}</td>
                            <td className="px-3 py-2">{r.isDuplicate ? "⚠️ 重複" : "✅ 新規"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setManagerImportStep("input")}
                      className="text-xs px-4 py-2 rounded-xl border border-[#EFE8DD] text-[#5B5560] hover:bg-[#FBF8F4] transition-colors">
                      戻る
                    </button>
                    <button onClick={handleManagerImportExecute} disabled={managerImportLoading}
                      className="btn-accent text-xs px-4 py-2 disabled:opacity-50">
                      {managerImportLoading ? "インポート中..." : "インポート実行"}
                    </button>
                  </div>
                </div>
              )}
              {managerImportStep === "result" && managerImportResult && (
                <div className="space-y-4">
                  <div className="text-xs bg-emerald-50 rounded-xl p-3 border border-emerald-100">
                    <p>成功: <strong>{managerImportResult.summary.success}名</strong> / スキップ: <strong>{managerImportResult.summary.skipped}名</strong> / エラー: <strong>{managerImportResult.summary.errors}名</strong></p>
                  </div>
                  <div className="border border-[#EFE8DD] rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-[#FBF8F4] sticky top-0">
                        <tr><th className="px-3 py-2 text-left">名前</th><th className="px-3 py-2 text-left">メール</th><th className="px-3 py-2 text-left">結果</th><th className="px-3 py-2 text-left">URL</th></tr>
                      </thead>
                      <tbody className="divide-y divide-[#EFE8DD]">
                        {managerImportResult.results.map((r, i) => (
                          <tr key={i}>
                            <td className="px-3 py-2">{r.name}</td><td className="px-3 py-2">{r.email}</td>
                            <td className="px-3 py-2">{r.status === "success" ? "✅" : r.status === "skipped" ? "⏭️" : "❌"} {r.message}</td>
                            <td className="px-3 py-2">{r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-amber-600 hover:underline">開く</a> : ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-end">
                    <button onClick={async () => { setShowManagerImport(false); const refreshRes = await fetch(`/api/admin?token=${token}${selectedTenantSlug ? `&tenant=${selectedTenantSlug}` : ""}`); if (refreshRes.ok) setData(await refreshRes.json()); }}
                      className="btn-accent text-xs px-4 py-2">
                      閉じる
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
