// 「設計図」の読み書き（coaching_profiles 表。サーバー側だけ）。
//
// - 決まり（確定の条件、履歴、メールに使ってよいか）は coaching-profile.ts（純関数）。
// - 永続化は coaching_profiles（RLS deny_all + service_role 経由のみ。migration 20261122）。
// - 読めなかったことと、まだ無いことを分けて返す。読めなかったときに「無い」と扱うと、
//   確定済みの人に「設計図を確認してください」と出てしまう。
// - 本人の保存では、参加者 ID とテナント ID の両方で行を絞る（トークンから引いた値だけを使う）。

import { getClient } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import {
  HISTORY_MAX,
  confirmBlocker,
  mergeTendencyChoices,
  normalizeTendencies,
  sameFields,
  snapshotForHistory,
  type CoachingProfile,
  type CoachingProfileFields,
  type CoachingProfileSnapshot,
  type CoachingProfileStatus,
} from "@/lib/coaching-profile";

type ProfileRow = {
  participant_id: string;
  headline: string | null;
  growth_theme: string | null;
  actions: string | null;
  expected: string | null;
  stall_points: string | null;
  evening_question: string | null;
  tendencies: unknown;
  status: string | null;
  confirmed_at: string | null;
  updated_at: string | null;
};

const SELECT_COLS =
  "participant_id, headline, growth_theme, actions, expected, stall_points, evening_question, tendencies, status, confirmed_at, updated_at";

function mapRow(r: ProfileRow): CoachingProfile {
  const status: CoachingProfileStatus = r.status === "confirmed" ? "confirmed" : "draft";
  return {
    headline: r.headline ?? "",
    growthTheme: r.growth_theme ?? "",
    actions: r.actions ?? "",
    expected: r.expected ?? "",
    stallPoints: r.stall_points ?? "",
    eveningQuestion: r.evening_question ?? "",
    tendencies: normalizeTendencies(r.tendencies),
    status,
    confirmedAt: r.confirmed_at,
    updatedAt: r.updated_at,
  };
}

/** ok:false = 読めなかった。ok:true で profile:null = まだ無い。 */
export type ProfileRead = { ok: true; profile: CoachingProfile | null } | { ok: false };

export async function getCoachingProfile(participantId: string, tenantId: string): Promise<ProfileRead> {
  const { data, error } = await getClient()
    .from("coaching_profiles")
    .select(SELECT_COLS)
    .eq("tenant_id", tenantId)
    .eq("participant_id", participantId)
    .maybeSingle();
  if (error) {
    logger.error("getCoachingProfile failed", { error: error.message, participantId, tenantId });
    return { ok: false };
  }
  return { ok: true, profile: data ? mapRow(data as ProfileRow) : null };
}

/**
 * 環境の全員分（定時処理のメール用）。参加者 ID → 設計図。
 * 読めなかったときは null（呼び出し側は、その人の分を載せずに送る）。
 */
export async function getCoachingProfilesForTenant(
  tenantId: string
): Promise<Map<string, CoachingProfile> | null> {
  const { data, error } = await getClient()
    .from("coaching_profiles")
    .select(SELECT_COLS)
    .eq("tenant_id", tenantId);
  if (error) {
    logger.error("getCoachingProfilesForTenant failed", { error: error.message, tenantId });
    return null;
  }
  const map = new Map<string, CoachingProfile>();
  for (const row of (data || []) as ProfileRow[]) {
    map.set(row.participant_id, mapRow(row));
  }
  return map;
}

export type ProfileSaveResult =
  | { ok: true; profile: CoachingProfile }
  | { ok: false; reason: "blocked"; message: string }
  | { ok: false; reason: "error" };

/**
 * 本人による保存。confirm=true で確定する（確定済みの設計図を直したときも、確定のまま保存する）。
 * - 運営が置いた傾向は、本人の選択（使う／使わない）だけを反映する。文は書き換えない。
 * - 中身が変わったときは、直す前の内容を履歴の先頭に残す。
 * - 影響行を .select() で確かめる（PostgREST の 0 行成功を信じない）。
 */
export async function saveCoachingProfileByParticipant(
  participantId: string,
  tenantId: string,
  submitted: CoachingProfileFields,
  opts: { confirm: boolean; now: string }
): Promise<ProfileSaveResult> {
  const client = getClient();
  const { data: existingRow, error: readError } = await client
    .from("coaching_profiles")
    .select(`${SELECT_COLS}, history`)
    .eq("tenant_id", tenantId)
    .eq("participant_id", participantId)
    .maybeSingle();
  if (readError) {
    logger.error("saveCoachingProfile: read failed", { error: readError.message, participantId, tenantId });
    return { ok: false, reason: "error" };
  }

  const existing = existingRow ? mapRow(existingRow as ProfileRow) : null;
  const fields: CoachingProfileFields = {
    ...submitted,
    tendencies: existing ? mergeTendencyChoices(existing.tendencies, submitted.tendencies) : [],
  };
  const nextStatus: CoachingProfileStatus =
    opts.confirm || existing?.status === "confirmed" ? "confirmed" : "draft";
  if (nextStatus === "confirmed") {
    const blocker = confirmBlocker(fields);
    if (blocker) return { ok: false, reason: "blocked", message: blocker };
  }

  const values = {
    headline: fields.headline,
    growth_theme: fields.growthTheme,
    actions: fields.actions,
    expected: fields.expected,
    stall_points: fields.stallPoints,
    evening_question: fields.eveningQuestion,
    tendencies: fields.tendencies,
    status: nextStatus,
    confirmed_at: nextStatus === "confirmed" ? opts.now : null,
    updated_at: opts.now,
  };

  if (existing) {
    const prevHistory = Array.isArray((existingRow as { history?: unknown }).history)
      ? ((existingRow as { history: CoachingProfileSnapshot[] }).history)
      : [];
    const history = sameFields(existing, fields)
      ? prevHistory
      : [snapshotForHistory(existing, opts.now), ...prevHistory].slice(0, HISTORY_MAX);
    const { data, error } = await client
      .from("coaching_profiles")
      .update({ ...values, history })
      .eq("tenant_id", tenantId)
      .eq("participant_id", participantId)
      .select(SELECT_COLS);
    if (error) {
      logger.error("saveCoachingProfile: update failed", { error: error.message, participantId, tenantId });
      return { ok: false, reason: "error" };
    }
    if (!data || data.length === 0) {
      logger.warn("saveCoachingProfile: update matched 0 rows", { participantId, tenantId });
      return { ok: false, reason: "error" };
    }
    return { ok: true, profile: mapRow(data[0] as ProfileRow) };
  }

  const { data, error } = await client
    .from("coaching_profiles")
    .insert({ tenant_id: tenantId, participant_id: participantId, ...values })
    .select(SELECT_COLS);
  if (error) {
    logger.error("saveCoachingProfile: insert failed", { error: error.message, participantId, tenantId });
    return { ok: false, reason: "error" };
  }
  if (!data || data.length === 0) {
    logger.warn("saveCoachingProfile: insert returned no row", { participantId, tenantId });
    return { ok: false, reason: "error" };
  }
  return { ok: true, profile: mapRow(data[0] as ProfileRow) };
}
