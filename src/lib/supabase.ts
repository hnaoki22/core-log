/**
 * Supabase backend for CORE Log multi-tenant system.
 * Provides the same interface as notion.ts so the frontend can switch backends per tenant.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { logger } from "./logger";
import { getDayOfWeekJPShort } from "./date-utils";

// ---------------------------------------------------------------------------
// Default tenant ID configuration
// ---------------------------------------------------------------------------
/**
 * Default tenant ID — configured via environment variable
 * Falls back to the Daiko Pharmaceutical tenant for backwards compatibility
 */
export const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID || "81f91c26-214e-4da2-9893-6ac6c8984062";

// ---------------------------------------------------------------------------
// Client singleton
// ---------------------------------------------------------------------------
let _client: SupabaseClient | null = null;

export function getClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase credentials not configured");
  _client = createClient(url, key, {
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
  return _client;
}

// ---------------------------------------------------------------------------
// Shared types (same as notion.ts exports)
// ---------------------------------------------------------------------------
export type NotionLogEntry = {
  id: string;
  date: string;
  datetime: string;
  dayOfWeek: string;
  dayNum: number;
  participantName: string;
  morningIntent: string;
  eveningInsight: string | null;
  energy: "excellent" | "good" | "okay" | "low" | null;
  status: "complete" | "morning_only" | "empty" | "fb_done";
  hasFeedback: boolean;
  hmFeedback: string | null;
  managerComment: string | null;
  managerCommentTime: string | null;
  managerReaction: string | null;
  morningTime: string | null;
  eveningTime: string | null;
  dojoPhase: string;
  weekNum: number;
};

export type NotionParticipant = {
  id: string;
  token: string;
  name: string;
  email: string;
  department: string;
  dojoPhase: string;
  emailEnabled: boolean;
  startDate: string;
  endDate: string;
  role: string;
  managerId: string;
  fbPolicy: string;
};

export type NotionManager = {
  id: string;
  token: string;
  name: string;
  email: string;
  department: string;
  isAdmin: boolean;
  participantIds: string[];
};

export type MissionEntry = {
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

export type MissionComment = {
  id: string;
  authorName: string;
  authorRole: "manager" | "participant";
  body: string;
  createdAt: string;
};

export type NotionFeedback = {
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function generateToken(prefix = ""): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = prefix;
  for (let i = 0; i < 16; i++) token += chars.charAt(Math.floor(Math.random() * chars.length));
  return token;
}

// ---------------------------------------------------------------------------
// Row → Domain converters
// ---------------------------------------------------------------------------
/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToLog(r: any): NotionLogEntry {
  const d = new Date(r.datetime || r.date);
  return {
    id: r.id,
    date: r.date,
    datetime: r.datetime || r.date,
    dayOfWeek: getDayOfWeekJPShort(d) || "",
    dayNum: r.day_num ?? d.getDate(),
    participantName: r.participant_name,
    morningIntent: r.morning_intent || "",
    eveningInsight: r.evening_insight || null,
    energy: r.energy || null,
    status: r.status || "empty",
    hasFeedback: r.has_feedback || false,
    hmFeedback: r.hm_feedback || null,
    managerComment: r.manager_comment || null,
    managerCommentTime: r.manager_comment_time || null,
    managerReaction: r.manager_reaction || null,
    morningTime: r.morning_time || null,
    eveningTime: r.evening_time || null,
    dojoPhase: r.dojo_phase || "",
    weekNum: r.week_num ?? 0,
  };
}

function rowToParticipant(r: any): NotionParticipant {
  return {
    id: r.id,
    token: r.token,
    name: r.name,
    email: r.email || "",
    department: r.department || "",
    dojoPhase: r.dojo_phase || "",
    emailEnabled: r.email_enabled ?? true,
    startDate: r.start_date || "",
    endDate: r.end_date || "",
    role: r.role || "参加者",
    managerId: r.manager_id || "",
    fbPolicy: r.fb_policy || "",
  };
}

function rowToManager(r: any): NotionManager & { role?: string } {
  return {
    id: r.id,
    token: r.token,
    name: r.name,
    email: r.email || "",
    department: r.department || "",
    isAdmin: r.is_admin || false,
    role: r.role || (r.is_admin ? "admin" : "manager"),
    participantIds: [], // populated separately
  };
}

function rowToMission(r: any): MissionEntry {
  return {
    id: r.id,
    title: r.title,
    participantName: r.participant_name,
    setDate: r.set_date || "",
    deadline: r.deadline || "",
    status: r.status || "進行中",
    purpose: r.purpose || null,
    reviewMemo: r.review_memo || null,
    finalReview: r.final_review || null,
    createdBy: r.created_by || null,
  };
}

function rowToComment(r: any): MissionComment {
  return {
    id: r.id,
    authorName: r.author_name,
    authorRole: r.author_role as "manager" | "participant",
    body: r.body,
    createdAt: r.created_at,
  };
}

function rowToFeedback(r: any): NotionFeedback {
  return {
    id: r.id,
    participantName: r.participant_name,
    authorName: r.author_name,
    type: r.type as NotionFeedback["type"],
    content: r.content,
    period: r.period || "",
    weekNum: r.week_num ?? 0,
    date: r.date || "",
    isRead: r.is_read || false,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Tenant resolution helper — every query is scoped by tenant_id
// ---------------------------------------------------------------------------
async function getTenantIdBySlug(slug: string): Promise<string | null> {
  const { data, error } = await getClient().from("tenants").select("id").eq("slug", slug).single();
  if (error) {
    logger.error("Query failed", { error: error.message, slug });
  }
  return data?.id ?? null;
}

// ---------------------------------------------------------------------------
// LOG QUERIES
// ---------------------------------------------------------------------------
export async function getLogsByParticipant(
  participantName: string,
  tenantId: string
): Promise<NotionLogEntry[]> {
  const { data, error } = await getClient()
    .from("logs")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("participant_name", participantName)
    .order("date", { ascending: false });
  if (error) {
    logger.error("Query failed", { error: error.message, participantName, tenantId });
  }
  if (!data) return [];
  return data.map(rowToLog);
}

// Batch: fetch ALL logs for a tenant (or all tenants) in one query (for admin dashboard)
export async function getAllLogsForTenant(
  tenantId?: string
): Promise<Map<string, NotionLogEntry[]>> {
  let query = getClient()
    .from("logs")
    .select("*")
    .order("date", { ascending: false });
  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }
  const { data, error } = await query;
  if (error) {
    logger.error("Query failed (getAllLogsForTenant)", { error: error.message, tenantId: tenantId || "ALL" });
  }
  const logMap = new Map<string, NotionLogEntry[]>();
  if (!data) return logMap;
  for (const row of data) {
    const entry = rowToLog(row);
    const name = row.participant_name;
    const list = logMap.get(name) || [];
    list.push(entry);
    logMap.set(name, list);
  }
  return logMap;
}

export async function hasLoggedToday(
  participantName: string,
  todayStr: string,
  tenantId: string
): Promise<{ hasMorning: boolean; hasEvening: boolean }> {
  const { data, error } = await getClient()
    .from("logs")
    .select("morning_intent, evening_insight")
    .eq("tenant_id", tenantId)
    .eq("participant_name", participantName)
    .eq("date", todayStr)
    .limit(1)
    .maybeSingle();
  if (error) {
    logger.error("Query failed", { error: error.message, participantName, tenantId, todayStr });
  }
  if (!data) return { hasMorning: false, hasEvening: false };
  return {
    hasMorning: !!data.morning_intent,
    hasEvening: !!data.evening_insight,
  };
}

export async function getLogEntryOwner(
  pageId: string
): Promise<string | null> {
  const { data, error } = await getClient()
    .from("logs")
    .select("participant_name")
    .eq("id", pageId)
    .single();
  if (error) {
    logger.error("Query failed", { error: error.message, pageId });
  }
  return data?.participant_name ?? null;
}

// ---------------------------------------------------------------------------
// LOG CREATION / UPDATE
// ---------------------------------------------------------------------------
export async function createMorningEntry(
  participantName: string,
  date: string,
  morningIntent: string,
  energy: string | null,
  dojoPhase: string,
  weekNum: number,
  tenantId: string,
  participantId: string
): Promise<string | null> {
  const now = new Date();
  const d = new Date(date);
  const { data, error } = await getClient()
    .from("logs")
    .insert({
      tenant_id: tenantId,
      participant_id: participantId,
      participant_name: participantName,
      date,
      datetime: now.toISOString(),
      day_of_week: getDayOfWeekJPShort(d) || "",
      day_num: d.getDate(),
      morning_intent: morningIntent,
      energy: energy || null,
      status: "morning_only",
      dojo_phase: dojoPhase,
      week_num: weekNum,
      morning_time: now.toISOString(),
    })
    .select("id")
    .single();
  if (error) {
    logger.error("Insert failed", { error: error.message, participantName, date });
    return null;
  }
  if (!data) {
    logger.warn("Insert returned no data", { participantName, date });
    return null;
  }
  return data.id;
}

export async function updateEveningEntry(
  pageId: string,
  eveningInsight: string,
  energy: string | null
): Promise<boolean> {
  const now = new Date();
  const updateData = {
    evening_insight: eveningInsight,
    energy: energy || undefined,
    status: "complete",
    evening_time: now.toISOString(),
  };
  const { error, data: updated } = await getClient()
    .from("logs")
    .update(updateData)
    .eq("id", pageId)
    .select("id");
  if (error) {
    logger.error("Update failed", { error: error.message, pageId });
    return false;
  }
  if (!updated || updated.length === 0) {
    logger.warn("Update matched 0 rows", { pageId });
    return false;
  }
  return true;
}

export async function createEveningOnlyEntry(
  participantName: string,
  date: string,
  eveningInsight: string,
  energy: string | null,
  dojoPhase: string,
  weekNum: number,
  tenantId: string,
  participantId: string
): Promise<string | null> {
  const now = new Date();
  const d = new Date(date);
  const { data, error } = await getClient()
    .from("logs")
    .insert({
      tenant_id: tenantId,
      participant_id: participantId,
      participant_name: participantName,
      date,
      datetime: now.toISOString(),
      day_of_week: getDayOfWeekJPShort(d) || "",
      day_num: d.getDate(),
      evening_insight: eveningInsight,
      energy: energy || null,
      status: "complete",
      dojo_phase: dojoPhase,
      week_num: weekNum,
      evening_time: now.toISOString(),
    })
    .select("id")
    .single();
  if (error) {
    logger.error("Insert failed", { error: error.message, participantName, date });
    return null;
  }
  if (!data) {
    logger.warn("Insert returned no data", { participantName, date });
    return null;
  }
  return data.id;
}

export async function addManagerComment(
  pageId: string,
  comment: string
): Promise<boolean> {
  const now = new Date();
  const updateData = {
    manager_comment: comment,
    manager_comment_time: now.toISOString(),
  };
  const { error, data: updated } = await getClient()
    .from("logs")
    .update(updateData)
    .eq("id", pageId)
    .select("id");
  if (error) {
    logger.error("Update failed", { error: error.message, pageId });
    return false;
  }
  if (!updated || updated.length === 0) {
    logger.warn("Update matched 0 rows", { pageId });
    return false;
  }
  return true;
}

export async function toggleManagerReaction(
  logId: string,
  emoji: string
): Promise<{ success: boolean; reactions: string | null }> {
  // 1. Read current reactions
  const { data: row, error: readErr } = await getClient()
    .from("logs")
    .select("manager_reaction")
    .eq("id", logId)
    .single();
  if (readErr || !row) {
    logger.error("Read failed for reaction toggle", { error: readErr?.message, logId });
    return { success: false, reactions: null };
  }

  // 2. Parse current reactions (comma-separated)
  const current: string[] = row.manager_reaction
    ? row.manager_reaction.split(",").filter(Boolean)
    : [];
  const idx = current.indexOf(emoji);
  if (idx >= 0) {
    current.splice(idx, 1); // remove
  } else {
    current.push(emoji); // add
  }
  const newValue = current.length > 0 ? current.join(",") : null;

  // 3. Write back
  const { error: writeErr, data: updated } = await getClient()
    .from("logs")
    .update({ manager_reaction: newValue })
    .eq("id", logId)
    .select("id");
  if (writeErr) {
    logger.error("Update failed for reaction", { error: writeErr.message, logId });
    return { success: false, reactions: null };
  }
  if (!updated || updated.length === 0) {
    logger.warn("Reaction update matched 0 rows", { logId });
    return { success: false, reactions: null };
  }
  return { success: true, reactions: newValue };
}

// ---------------------------------------------------------------------------
// PARTICIPANT QUERIES
// ---------------------------------------------------------------------------
export async function getAllParticipantsFromSupabase(
  tenantId?: string
): Promise<NotionParticipant[]> {
  let query = getClient()
    .from("participants")
    .select("*");
  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }
  const { data, error } = await query;
  if (error) {
    logger.error("Query failed", { error: error.message, tenantId: tenantId || "ALL" });
  }
  return (data || []).map(rowToParticipant);
}

export async function getParticipantByTokenFromSupabase(
  token: string
): Promise<(NotionParticipant & { tenantId: string }) | null> {
  const { data, error } = await getClient()
    .from("participants")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (error) {
    logger.error("Query failed", { error: error.message, token });
  }
  if (!data) return null;
  return { ...rowToParticipant(data), tenantId: data.tenant_id };
}

export async function getParticipantByNameFromSupabase(
  name: string,
  tenantId?: string
): Promise<(NotionParticipant & { tenantId?: string }) | null> {
  let query = getClient()
    .from("participants")
    .select("*")
    .eq("name", name);
  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }
  const { data, error } = await query.maybeSingle();
  if (error) {
    logger.error("Query failed", { error: error.message, name, tenantId });
  }
  if (!data) return null;
  return { ...rowToParticipant(data), tenantId: data.tenant_id };
}

// Cross-tenant: find participant by name without tenant filter (for admin views)
export async function getParticipantByNameCrossTenant(
  name: string
): Promise<(NotionParticipant & { tenantId: string }) | null> {
  const { data, error } = await getClient()
    .from("participants")
    .select("*")
    .eq("name", name)
    .maybeSingle();
  if (error) {
    logger.error("Cross-tenant participant lookup failed", { error: error.message, name });
  }
  if (!data) return null;
  return { ...rowToParticipant(data), tenantId: data.tenant_id };
}

export async function getParticipantByEmailFromSupabase(
  email: string,
  tenantId: string
): Promise<NotionParticipant | null> {
  const { data, error } = await getClient()
    .from("participants")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("email", email)
    .maybeSingle();
  if (error) {
    logger.error("Query failed", { error: error.message, email, tenantId });
  }
  if (!data) return null;
  return rowToParticipant(data);
}

export async function createParticipantInSupabase(
  participant: {
    name: string;
    email?: string;
    department?: string;
    dojoPhase?: string;
    managerId?: string;
    fbPolicy?: string;
  },
  tenantId: string
): Promise<{ id: string; token: string } | null> {
  const token = generateToken();
  const { data, error } = await getClient()
    .from("participants")
    .insert({
      tenant_id: tenantId,
      token,
      name: participant.name,
      email: participant.email || "",
      department: participant.department || "",
      dojo_phase: participant.dojoPhase || "",
      manager_id: participant.managerId || null,
      fb_policy: participant.fbPolicy || "",
    })
    .select("id, token")
    .single();
  if (error) {
    logger.error("Insert failed", { error: error.message, name: participant.name, tenantId });
    return null;
  }
  if (!data) {
    logger.warn("Insert returned no data", { name: participant.name, tenantId });
    return null;
  }
  return { id: data.id, token: data.token };
}

export async function updateParticipantInSupabase(
  participantId: string,
  updates: {
    name?: string;
    email?: string;
    department?: string;
    dojoPhase?: string;
    managerId?: string | null;
    fbPolicy?: string;
    emailEnabled?: boolean;
    startDate?: string;
    endDate?: string;
  },
  tenantId: string
): Promise<boolean> {
  const updateData: Record<string, unknown> = {};
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.email !== undefined) updateData.email = updates.email;
  if (updates.department !== undefined) updateData.department = updates.department;
  if (updates.dojoPhase !== undefined) updateData.dojo_phase = updates.dojoPhase;
  if (updates.managerId !== undefined) updateData.manager_id = updates.managerId || null;
  if (updates.fbPolicy !== undefined) updateData.fb_policy = updates.fbPolicy;
  if (updates.emailEnabled !== undefined) updateData.email_enabled = updates.emailEnabled;
  if (updates.startDate !== undefined) updateData.start_date = updates.startDate;
  if (updates.endDate !== undefined) updateData.end_date = updates.endDate;

  if (Object.keys(updateData).length === 0) return true;

  const { error, data: updated } = await getClient()
    .from("participants")
    .update(updateData)
    .eq("id", participantId)
    .eq("tenant_id", tenantId)
    .select("id");
  if (error) {
    logger.error("Update failed", { error: error.message, participantId });
    return false;
  }
  if (!updated || updated.length === 0) {
    logger.warn("Update matched 0 rows", { participantId });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// MANAGER QUERIES
// ---------------------------------------------------------------------------
export async function getAllManagersFromSupabase(
  tenantId?: string
): Promise<NotionManager[]> {
  // Batch: fetch managers and all participants in just 2 queries (not N+1)
  let managersQuery = getClient().from("managers").select("*");
  let participantsQuery = getClient().from("participants").select("id, manager_id");
  if (tenantId) {
    managersQuery = managersQuery.eq("tenant_id", tenantId);
    participantsQuery = participantsQuery.eq("tenant_id", tenantId);
  }
  const [managersResult, participantsResult] = await Promise.all([
    managersQuery,
    participantsQuery,
  ]);
  if (managersResult.error) {
    logger.error("Query failed", { error: managersResult.error.message, tenantId: tenantId || "ALL" });
  }
  if (participantsResult.error) {
    logger.error("Query failed", { error: participantsResult.error.message, tenantId: tenantId || "ALL" });
  }
  const managers = managersResult.data || [];
  const participants = participantsResult.data || [];

  // Build manager_id → participant_ids map in memory
  const managerParticipantMap = new Map<string, string[]>();
  for (const p of participants) {
    if (!p.manager_id) continue;
    const list = managerParticipantMap.get(p.manager_id) || [];
    list.push(p.id);
    managerParticipantMap.set(p.manager_id, list);
  }

  return managers.map((m) => ({
    ...rowToManager(m),
    participantIds: managerParticipantMap.get(m.id) || [],
  }));
}

export async function getManagerByTokenFromSupabase(
  token: string
): Promise<(NotionManager & { tenantId: string }) | null> {
  const { data, error } = await getClient()
    .from("managers")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (error) {
    logger.error("Query failed", { error: error.message, token });
  }
  if (!data) return null;
  const { data: participants, error: participantsError } = await getClient()
    .from("participants")
    .select("id")
    .eq("manager_id", data.id);
  if (participantsError) {
    logger.error("Query failed", { error: participantsError.message, managerId: data.id });
  }
  return {
    ...rowToManager(data),
    participantIds: (participants || []).map((p: { id: string }) => p.id),
    tenantId: data.tenant_id,
  };
}

export async function getManagerByIdFromSupabase(
  managerId: string
): Promise<NotionManager | null> {
  const { data, error } = await getClient()
    .from("managers")
    .select("*")
    .eq("id", managerId)
    .maybeSingle();
  if (error) {
    logger.error("Query failed", { error: error.message, managerId });
  }
  if (!data) return null;
  const { data: participants, error: participantsError } = await getClient()
    .from("participants")
    .select("id")
    .eq("manager_id", data.id);
  if (participantsError) {
    logger.error("Query failed", { error: participantsError.message, managerId: data.id });
  }
  return {
    ...rowToManager(data),
    participantIds: (participants || []).map((p: { id: string }) => p.id),
  };
}

export async function getParticipantsForManagerFromSupabase(
  managerId: string,
  tenantId: string
): Promise<NotionParticipant[]> {
  const { data, error } = await getClient()
    .from("participants")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("manager_id", managerId);
  if (error) {
    logger.error("Query failed", { error: error.message, managerId, tenantId });
  }
  return (data || []).map(rowToParticipant);
}

export async function isAdminTokenFromSupabase(
  token: string
): Promise<boolean> {
  const { data, error } = await getClient()
    .from("managers")
    .select("is_admin")
    .eq("token", token)
    .maybeSingle();
  if (error) {
    logger.error("Query failed", { error: error.message, token });
  }
  return data?.is_admin || false;
}

export async function createManagerInSupabase(
  manager: {
    name: string;
    email?: string;
    department?: string;
    isAdmin?: boolean;
  },
  tenantId: string
): Promise<{ id: string; token: string } | null> {
  const token = generateToken("mgr_");
  const { data, error } = await getClient()
    .from("managers")
    .insert({
      tenant_id: tenantId,
      token,
      name: manager.name,
      email: manager.email || "",
      department: manager.department || "",
      is_admin: manager.isAdmin || false,
    })
    .select("id, token")
    .single();
  if (error) {
    logger.error("Insert failed", { error: error.message, name: manager.name, tenantId });
    return null;
  }
  if (!data) {
    logger.warn("Insert returned no data", { name: manager.name, tenantId });
    return null;
  }
  return { id: data.id, token: data.token };
}

export async function updateManagerInSupabase(
  managerId: string,
  updates: {
    name?: string;
    email?: string;
    department?: string;
    isAdmin?: boolean;
    role?: string;
  },
  tenantId: string,
  newTenantId?: string
): Promise<boolean> {
  const updateData: Record<string, unknown> = {};
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.email !== undefined) updateData.email = updates.email;
  if (updates.department !== undefined) updateData.department = updates.department;
  if (updates.isAdmin !== undefined) updateData.is_admin = updates.isAdmin;
  if (updates.role !== undefined) updateData.role = updates.role;
  if (newTenantId) updateData.tenant_id = newTenantId;

  if (Object.keys(updateData).length === 0) return true;

  const { error, data: updated } = await getClient()
    .from("managers")
    .update(updateData)
    .eq("id", managerId)
    .eq("tenant_id", tenantId)
    .select("id");
  if (error) {
    logger.error("Update failed", { error: error.message, managerId });
    return false;
  }
  if (!updated || updated.length === 0) {
    logger.warn("Update matched 0 rows", { managerId });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// MISSION QUERIES
// ---------------------------------------------------------------------------
export async function getMissionById(
  missionId: string
): Promise<MissionEntry | null> {
  const { data, error } = await getClient()
    .from("missions")
    .select("*")
    .eq("id", missionId)
    .maybeSingle();
  if (error) {
    logger.error("Query failed", { error: error.message, missionId });
  }
  if (!data) return null;
  return rowToMission(data);
}

export async function getMissionsByParticipant(
  participantName: string,
  tenantId: string
): Promise<MissionEntry[]> {
  const { data, error } = await getClient()
    .from("missions")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("participant_name", participantName)
    .order("created_at", { ascending: false });
  if (error) {
    logger.error("Query failed", { error: error.message, participantName, tenantId });
  }
  return (data || []).map(rowToMission);
}

export async function getMissionComments(
  missionId: string
): Promise<MissionComment[]> {
  const { data, error } = await getClient()
    .from("mission_comments")
    .select("*")
    .eq("mission_id", missionId)
    .order("created_at", { ascending: true });
  if (error) {
    logger.error("Query failed", { error: error.message, missionId });
  }
  return (data || []).map(rowToComment);
}

export async function createMission(
  participantName: string,
  title: string,
  purpose: string | null,
  deadline: string | null,
  setDate: string | null,
  createdBy: string | null,
  tenantId: string,
  participantId: string
): Promise<string | null> {
  const { data, error } = await getClient()
    .from("missions")
    .insert({
      tenant_id: tenantId,
      participant_id: participantId,
      participant_name: participantName,
      title,
      purpose,
      deadline: deadline || null,
      set_date: setDate || toDateStr(new Date()),
      created_by: createdBy || "自己設定",
    })
    .select("id")
    .single();
  if (error) {
    logger.error("Insert failed", { error: error.message, participantName, title });
    return null;
  }
  if (!data) {
    logger.warn("Insert returned no data", { participantName, title });
    return null;
  }
  return data.id;
}

export async function updateMissionStatus(
  missionId: string,
  status: string,
  finalReview: string | null
): Promise<boolean> {
  const update: Record<string, unknown> = { status };
  if (finalReview !== null) update.final_review = finalReview;
  const { error, data: updated } = await getClient()
    .from("missions")
    .update(update)
    .eq("id", missionId)
    .select("id");
  if (error) {
    logger.error("Update failed", { error: error.message, missionId });
    return false;
  }
  if (!updated || updated.length === 0) {
    logger.warn("Update matched 0 rows", { missionId });
    return false;
  }
  return true;
}

export async function updateMissionFields(
  missionId: string,
  fields: { title?: string; purpose?: string; deadline?: string }
): Promise<boolean> {
  const update: Record<string, unknown> = {};
  if (fields.title !== undefined) update.title = fields.title;
  if (fields.purpose !== undefined) update.purpose = fields.purpose;
  if (fields.deadline !== undefined) update.deadline = fields.deadline || null;
  if (Object.keys(update).length === 0) return false;
  const { error, data: updated } = await getClient()
    .from("missions")
    .update(update)
    .eq("id", missionId)
    .select("id");
  if (error) {
    logger.error("Mission field update failed", { error: error.message, missionId });
    return false;
  }
  if (!updated || updated.length === 0) {
    logger.warn("Mission field update matched 0 rows", { missionId });
    return false;
  }
  return true;
}

export async function updateMissionComment(
  commentId: string,
  newBody: string
): Promise<boolean> {
  const { error, data: updated } = await getClient()
    .from("mission_comments")
    .update({ body: newBody })
    .eq("id", commentId)
    .select("id");
  if (error) {
    logger.error("Comment update failed", { error: error.message, commentId });
    return false;
  }
  return !!(updated && updated.length > 0);
}

export async function deleteMissionComment(
  commentId: string
): Promise<boolean> {
  const { error } = await getClient()
    .from("mission_comments")
    .delete()
    .eq("id", commentId);
  if (error) {
    logger.error("Comment delete failed", { error: error.message, commentId });
    return false;
  }
  return true;
}

export async function addMissionComment(
  missionId: string,
  authorName: string,
  authorRole: "manager" | "participant",
  commentText: string
): Promise<boolean> {
  const { error } = await getClient()
    .from("mission_comments")
    .insert({
      mission_id: missionId,
      author_name: authorName,
      author_role: authorRole,
      body: commentText,
    });
  return !error;
}

// ---------------------------------------------------------------------------
// FEEDBACK QUERIES
// ---------------------------------------------------------------------------

/**
 * Get feedback counts per participant for a tenant (or all tenants).
 * Returns a Map: participantName → count
 * Used by admin dashboard to display correct FB counts.
 */
export async function getFeedbackCountsByTenant(
  tenantId?: string
): Promise<Map<string, number>> {
  const client = getClient();
  let query = client
    .from("feedback")
    .select("participant_name");

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query;
  if (error) {
    logger.error("Feedback count query failed", { error: error.message, tenantId });
    return new Map();
  }

  const counts = new Map<string, number>();
  for (const row of data || []) {
    const name = row.participant_name;
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return counts;
}

export async function getFeedbackByParticipant(
  participantName: string,
  tenantId: string
): Promise<NotionFeedback[]> {
  const { data, error } = await getClient()
    .from("feedback")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("participant_name", participantName)
    .order("created_at", { ascending: false });
  if (error) {
    logger.error("Query failed", { error: error.message, participantName, tenantId });
  }
  return (data || []).map(rowToFeedback);
}

export async function getUnreadFeedbackCount(
  participantName: string,
  tenantId: string
): Promise<number> {
  const { count, error } = await getClient()
    .from("feedback")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("participant_name", participantName)
    .eq("is_read", false);
  if (error) {
    logger.error("Query failed", { error: error.message, participantName, tenantId });
  }
  return count ?? 0;
}

export async function createFeedback(
  fb: {
    participantName: string;
    authorName: string;
    type: "HMフィードバック" | "上司コメント";
    content: string;
    period?: string;
    weekNum?: number;
  },
  tenantId: string,
  participantId: string | null
): Promise<{ id: string } | null> {
  // Build insert payload — only include participant_id if it's a valid UUID
  // Empty string "" is NOT valid for UUID columns in Supabase
  const insertPayload: Record<string, unknown> = {
    tenant_id: tenantId,
    participant_name: fb.participantName,
    author_name: fb.authorName,
    type: fb.type,
    content: fb.content,
    period: fb.period || "",
    week_num: fb.weekNum ?? 0,
    date: toDateStr(new Date()),
  };
  if (participantId) {
    insertPayload.participant_id = participantId;
  }
  const { data, error } = await getClient()
    .from("feedback")
    .insert(insertPayload)
    .select("id")
    .single();
  if (error) {
    logger.error("Insert failed", { error: error.message, participantName: fb.participantName });
    return null;
  }
  if (!data) {
    logger.warn("Insert returned no data", { participantName: fb.participantName });
    return null;
  }
  return { id: data.id };
}

export async function markFeedbackAsRead(
  feedbackId: string
): Promise<boolean> {
  const { error, data: updated } = await getClient()
    .from("feedback")
    .update({ is_read: true })
    .eq("id", feedbackId)
    .select("id");
  if (error) {
    logger.error("Update failed", { error: error.message, feedbackId });
    return false;
  }
  if (!updated || updated.length === 0) {
    logger.warn("Update matched 0 rows", { feedbackId });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// AI SETTINGS
// ---------------------------------------------------------------------------
export async function getAiSystemPrompt(
  tenantId: string
): Promise<string> {
  const { data, error } = await getClient()
    .from("ai_settings")
    .select("value")
    .eq("tenant_id", tenantId)
    .eq("key", "system_prompt")
    .maybeSingle();
  if (error) {
    logger.error("Query failed", { error: error.message, tenantId });
  }
  return data?.value || "";
}

export async function updateAiSystemPrompt(
  tenantId: string,
  newPrompt: string
): Promise<boolean> {
  const { error, data: updated } = await getClient()
    .from("ai_settings")
    .upsert({
      tenant_id: tenantId,
      key: "system_prompt",
      value: newPrompt,
    }, { onConflict: "tenant_id,key" })
    .select("tenant_id");
  if (error) {
    logger.error("Upsert failed", { error: error.message, tenantId });
    return false;
  }
  if (!updated || updated.length === 0) {
    logger.warn("Upsert returned no data", { tenantId });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// TENANT MANAGEMENT
// ---------------------------------------------------------------------------
export async function createTenant(
  tenant: {
    name: string;
    slug: string;
    companyName: string;
    contactEmail?: string;
    plan?: string;
    featureFlags?: Record<string, boolean>;
  }
): Promise<{ id: string; slug: string } | null> {
  const { data, error } = await getClient()
    .from("tenants")
    .insert({
      name: tenant.name,
      slug: tenant.slug,
      company_name: tenant.companyName,
      contact_email: tenant.contactEmail || "",
      plan: tenant.plan || "demo",
      feature_flags: tenant.featureFlags || { managerFeedback: false },
    })
    .select("id, slug")
    .single();
  if (error || !data) return null;
  return { id: data.id, slug: data.slug };
}

export async function getTenantBySlug(
  slug: string
): Promise<{ id: string; name: string; slug: string; companyName: string; featureFlags: Record<string, boolean> } | null> {
  const { data, error } = await getClient()
    .from("tenants")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) {
    logger.error("Query failed", { error: error.message, slug });
  }
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    companyName: data.company_name,
    featureFlags: data.feature_flags || {},
  };
}

export async function getTenantById(
  id: string
): Promise<{ id: string; name: string; slug: string; companyName: string } | null> {
  const { data, error } = await getClient()
    .from("tenants")
    .select("id, name, slug, company_name")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    logger.error("Query failed", { error: error.message, id });
    return null;
  }
  if (!data) return null;
  return {
    id: data.id as string,
    name: data.name as string,
    slug: data.slug as string,
    companyName: (data.company_name as string) || "",
  };
}

export async function getAllTenants(): Promise<
  { id: string; name: string; slug: string; companyName: string; plan: string }[]
> {
  const { data, error } = await getClient()
    .from("tenants")
    .select("id, name, slug, company_name, plan")
    .order("created_at", { ascending: true });
  if (error) {
    logger.error("Query failed", { error: error.message });
  }
  return (data || []).map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    companyName: t.company_name,
    plan: t.plan,
  }));
}

// Re-export for convenience
export { getTenantIdBySlug };
