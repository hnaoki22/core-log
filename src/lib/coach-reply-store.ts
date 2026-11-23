// 「AIコーチの返信」の読み書き（coach_replies 表ほか。サーバー側だけ）。
//
// - 決まり（返してよいか、AI に渡す文、出力の読み方）は coach-reply.ts（純関数）。
// - 永続化は coach_replies（RLS deny_all + service_role 経由のみ。migration 20261122）。
// - 本人の分は、トークンから引いた参加者 ID とテナント ID の両方で行を絞る。
//   記入も、氏名ではなく参加者 ID で引く（別の環境の同じ氏名の人の記入が混ざらないように）。
// - 読めなかったことと、無いことを分けて返す（読めなかったときに「無い」と扱って、AI を呼び直さない）。
// - 運営向けの読み取りでは、観の期の記入を除く（CLAUDE.md §8 項目 10）。

import { getClient } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { isStandaloneTenant } from "@/lib/standalone";
import {
  parseCoachConfig,
  type CoachConfig,
  type CoachDayLog,
  type CoachReply,
  type CoachReplyKind,
  type CoachReplyStatus,
} from "@/lib/coach-reply";
import { DEFAULT_COACH_SYSTEM_PROMPT } from "@/lib/coach-reply-prompt";
import {
  COACH_NOTICE_CONFIG_KEY,
  parseCoachNoticeConfig,
  type CoachNoticeConfig,
  type CoachNoticeCounts,
  type CoachNoticeRecipientRow,
} from "@/lib/coach-notice";

const REPLY_COLS = "id, reply_date, kind, content, status, created_at";

type ReplyRow = {
  id: string;
  reply_date: string;
  kind: string | null;
  content: string | null;
  status: string | null;
  created_at: string | null;
};

function mapReply(r: ReplyRow): CoachReply {
  const status: CoachReplyStatus =
    r.status === "delivered" || r.status === "withdrawn" ? r.status : "pending_review";
  const kind: CoachReplyKind = r.kind === "weekly" ? "weekly" : "daily";
  return {
    id: r.id,
    replyDate: r.reply_date,
    kind,
    content: r.content ?? "",
    status,
    createdAt: r.created_at,
  };
}

// ---------------------------------------------------------------------------
// 本人の記入（AI に渡す、その日の分）
// ---------------------------------------------------------------------------

/**
 * 指定した日付の、本人の記入（要る欄だけ）。新しい日付が先。
 * 同じ日に複数の行があるときは、更新が新しい行を使う。
 */
export async function getDayLogsForCoach(
  participantId: string,
  tenantId: string,
  dates: readonly string[]
): Promise<{ ok: true; logs: CoachDayLog[] } | { ok: false }> {
  const wanted = dates.filter((d) => d !== "");
  if (wanted.length === 0) return { ok: true, logs: [] };
  const { data, error } = await getClient()
    .from("logs")
    .select("id, date, morning_intent, evening_insight, phase_mode, updated_at")
    .eq("tenant_id", tenantId)
    .eq("participant_id", participantId)
    .in("date", wanted as string[])
    .order("date", { ascending: false })
    .order("updated_at", { ascending: false });
  if (error) {
    logger.error("getDayLogsForCoach failed", { error: error.message, participantId, tenantId });
    return { ok: false };
  }
  const seen = new Set<string>();
  const logs: CoachDayLog[] = [];
  for (const row of (data || []) as Array<{
    id: string;
    date: string;
    morning_intent: string | null;
    evening_insight: string | null;
    phase_mode: string | null;
  }>) {
    if (seen.has(row.date)) continue;
    seen.add(row.date);
    logs.push({
      id: row.id,
      date: row.date,
      morningIntent: row.morning_intent ?? "",
      eveningInsight: row.evening_insight ?? "",
      phaseMode: row.phase_mode ?? "",
    });
  }
  return { ok: true, logs };
}

// ---------------------------------------------------------------------------
// 返信の読み取り（本人の分）
// ---------------------------------------------------------------------------

/** その日の記入への返信（1 人・1 日・1 種類に 1 件）。 */
export async function getCoachReply(
  participantId: string,
  tenantId: string,
  replyDate: string,
  kind: CoachReplyKind = "daily"
): Promise<{ ok: true; reply: CoachReply | null } | { ok: false }> {
  const { data, error } = await getClient()
    .from("coach_replies")
    .select(REPLY_COLS)
    .eq("tenant_id", tenantId)
    .eq("participant_id", participantId)
    .eq("reply_date", replyDate)
    .eq("kind", kind)
    .maybeSingle();
  if (error) {
    logger.error("getCoachReply failed", { error: error.message, participantId, tenantId, replyDate });
    return { ok: false };
  }
  return { ok: true, reply: data ? mapReply(data as ReplyRow) : null };
}

/** 本人の返信の一覧（新しい順）。読めなかったときは null。状態の出し分けは、呼び出し側（toParticipantView）。 */
export async function listCoachRepliesForParticipant(
  participantId: string,
  tenantId: string,
  limit = 30
): Promise<CoachReply[] | null> {
  const { data, error } = await getClient()
    .from("coach_replies")
    .select(REPLY_COLS)
    .eq("tenant_id", tenantId)
    .eq("participant_id", participantId)
    .order("reply_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    logger.error("listCoachRepliesForParticipant failed", { error: error.message, participantId, tenantId });
    return null;
  }
  return ((data || []) as ReplyRow[]).map(mapReply);
}

/** その日より前の、届いた返信のうち、いちばん新しいもの（次の返信に「前回の問い」として渡す）。無ければ null。 */
export async function getPreviousDeliveredReply(
  participantId: string,
  tenantId: string,
  beforeDate: string
): Promise<CoachReply | null> {
  const { data, error } = await getClient()
    .from("coach_replies")
    .select(REPLY_COLS)
    .eq("tenant_id", tenantId)
    .eq("participant_id", participantId)
    .eq("kind", "daily")
    .eq("status", "delivered")
    .lt("reply_date", beforeDate)
    .order("reply_date", { ascending: false })
    .limit(1);
  if (error) {
    // 前回の問いは、無くても返信を作れる。読めなかったことは記録して、無いものとして進める。
    logger.error("getPreviousDeliveredReply failed", { error: error.message, participantId, tenantId });
    return null;
  }
  const row = ((data || []) as ReplyRow[])[0];
  return row ? mapReply(row) : null;
}

// ---------------------------------------------------------------------------
// 返信の保存
// ---------------------------------------------------------------------------

export type InsertCoachReplyResult =
  | { ok: true; reply: CoachReply }
  /** 同じ人・同じ日・同じ種類の返信が、すでにある（ほぼ同時の 2 回目の呼び出し）。 */
  | { ok: false; reason: "conflict" }
  | { ok: false; reason: "error" };

export async function insertCoachReply(args: {
  tenantId: string;
  participantId: string;
  logId: string;
  replyDate: string;
  kind: CoachReplyKind;
  content: string;
  status: CoachReplyStatus;
  model: string | null;
  inputsUsed: readonly string[];
}): Promise<InsertCoachReplyResult> {
  const { data, error } = await getClient()
    .from("coach_replies")
    .insert({
      tenant_id: args.tenantId,
      participant_id: args.participantId,
      log_id: args.logId,
      reply_date: args.replyDate,
      kind: args.kind,
      content: args.content,
      status: args.status,
      model: args.model,
      inputs_used: args.inputsUsed,
    })
    .select(REPLY_COLS);
  if (error) {
    // 23505 = 一意制約（participant_id, reply_date, kind）に当たった。
    if (error.code === "23505") return { ok: false, reason: "conflict" };
    logger.error("insertCoachReply failed", {
      error: error.message,
      participantId: args.participantId,
      tenantId: args.tenantId,
      replyDate: args.replyDate,
    });
    return { ok: false, reason: "error" };
  }
  if (!data || data.length === 0) {
    logger.warn("insertCoachReply returned no row", { participantId: args.participantId, replyDate: args.replyDate });
    return { ok: false, reason: "error" };
  }
  return { ok: true, reply: mapReply(data[0] as ReplyRow) };
}

// ---------------------------------------------------------------------------
// 環境の設定（届け方・開始日・指示文）
// ---------------------------------------------------------------------------

async function readSetting(tenantId: string, key: string): Promise<{ ok: true; value: string | null } | { ok: false }> {
  const { data, error } = await getClient()
    .from("ai_settings")
    .select("value")
    .eq("tenant_id", tenantId)
    .eq("key", key)
    .maybeSingle();
  if (error) {
    logger.error("coach setting read failed", { error: error.message, tenantId, key });
    return { ok: false };
  }
  const value = data && typeof (data as { value?: unknown }).value === "string" ? (data as { value: string }).value : null;
  return { ok: true, value };
}

/**
 * 届け方と開始日。config: null = 設定が無い（または形が正しくない）。その環境では、返信を作らない。
 * 読めなかったこと（ok: false）と、無いことを分けて返す。
 */
export async function getCoachConfig(
  tenantId: string
): Promise<{ ok: true; config: CoachConfig | null } | { ok: false }> {
  const read = await readSetting(tenantId, "coach_reply_config");
  if (!read.ok) return { ok: false };
  const config = parseCoachConfig(read.value);
  if (config === null && read.value !== null && read.value.trim() !== "") {
    // 設定の行はあるが、形が正しくない。動かさずに、記録に残す（値そのものは残さない）。
    logger.warn("coach_reply_config is set but not valid; coach replies stay off", { tenantId });
  }
  return { ok: true, config };
}

/**
 * その環境で、AIコーチの返信が動く状態か。次の 3 つがそろったときだけ active。
 *  1. スイッチ：feature.coachReply と feature.coachingProfile の両方が ON
 *  2. 商品モードでない
 *  3. 環境の設定（coach_reply_config）がある
 * アプリ全体の停止（COACH_REPLY_DISABLED）は、ここでは見ない（呼び出し側が、用途に合わせて見る。
 * 運営の確認ページは、止めているあいだも読めるようにするため）。
 */
export type CoachActivation =
  | { ok: true; active: true; config: CoachConfig }
  | { ok: true; active: false; reason: "flag_off" | "standalone" | "not_configured" }
  | { ok: false };

export async function getCoachActivation(tenantId: string): Promise<CoachActivation> {
  const [reply, profile] = await Promise.all([
    isFeatureEnabled("feature.coachReply", tenantId),
    isFeatureEnabled("feature.coachingProfile", tenantId),
  ]);
  if (!reply || !profile) return { ok: true, active: false, reason: "flag_off" };
  if (await isStandaloneTenant(tenantId)) return { ok: true, active: false, reason: "standalone" };
  const read = await getCoachConfig(tenantId);
  if (!read.ok) return { ok: false };
  if (read.config === null) return { ok: true, active: false, reason: "not_configured" };
  return { ok: true, active: true, config: read.config };
}

/**
 * AI への指示文。環境ごとの上書き（key='coach_system_prompt'）があればそれ、無ければ既定。
 * 読めなかったときは null（既定の文で黙って作らない。上書きした環境で、直す前の文が使われるため）。
 */
export async function getCoachSystemPrompt(tenantId: string): Promise<string | null> {
  const read = await readSetting(tenantId, "coach_system_prompt");
  if (!read.ok) return null;
  const override = (read.value ?? "").trim();
  return override !== "" ? override : DEFAULT_COACH_SYSTEM_PROMPT;
}

// ---------------------------------------------------------------------------
// 本人の入・切（coaching_profiles.coach_enabled）
// ---------------------------------------------------------------------------

/** enabled: null = 設計図の行が、まだ無い。 */
export async function getCoachOptIn(
  participantId: string,
  tenantId: string
): Promise<{ ok: true; enabled: boolean | null } | { ok: false }> {
  const { data, error } = await getClient()
    .from("coaching_profiles")
    .select("coach_enabled")
    .eq("tenant_id", tenantId)
    .eq("participant_id", participantId)
    .maybeSingle();
  if (error) {
    logger.error("getCoachOptIn failed", { error: error.message, participantId, tenantId });
    return { ok: false };
  }
  if (!data) return { ok: true, enabled: null };
  return { ok: true, enabled: (data as { coach_enabled?: boolean | null }).coach_enabled !== false };
}

/** 本人が、受け取る・受け取らないを切り替える。設計図の行が無いときは false（0 行の更新を成功にしない）。 */
export async function setCoachOptIn(participantId: string, tenantId: string, enabled: boolean): Promise<boolean> {
  const { data, error } = await getClient()
    .from("coaching_profiles")
    .update({ coach_enabled: enabled })
    .eq("tenant_id", tenantId)
    .eq("participant_id", participantId)
    .select("participant_id");
  if (error) {
    logger.error("setCoachOptIn failed", { error: error.message, participantId, tenantId });
    return false;
  }
  if (!data || data.length === 0) {
    logger.warn("setCoachOptIn matched 0 rows", { participantId, tenantId });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// 運営の確認ページ
// ---------------------------------------------------------------------------

export type CoachBoardReply = CoachReply & {
  model: string | null;
  inputsUsed: string[];
  reviewedBy: string | null;
  reviewedAt: string | null;
};

export type CoachBoardRow = {
  participantId: string;
  name: string;
  department: string;
  /** 設計図の状態。none = まだ無い。 */
  profileStatus: "none" | "draft" | "confirmed";
  /** 本人が受け取りを切っていない（設計図が無い人は true として扱う）。 */
  coachEnabled: boolean;
  /** その日の記入（観の期の記入は含めない）。 */
  morning: string;
  evening: string;
  reply: CoachBoardReply | null;
};

/**
 * その環境・その日の、参加者ごとの記入と AIコーチの返信。読めなかったときは null。
 * 記入の文を返すので、呼び出し側（API）で、読める人（管理者・閲覧者）と商品モードを先に確かめること。
 */
export async function loadCoachBoard(tenantId: string, date: string): Promise<CoachBoardRow[] | null> {
  const client = getClient();
  const [participants, logs, replies, profiles] = await Promise.all([
    client.from("participants").select("id, name, department").eq("tenant_id", tenantId).order("name"),
    client
      .from("logs")
      .select("participant_id, morning_intent, evening_insight, updated_at")
      .eq("tenant_id", tenantId)
      .eq("date", date)
      // 観の期の記入は「本人と装置だけ」。運営向けの読み取りからは除く。
      .neq("phase_mode", "kan-no-ki")
      .order("updated_at", { ascending: false }),
    client
      .from("coach_replies")
      .select(`${REPLY_COLS}, participant_id, model, inputs_used, reviewed_by, reviewed_at`)
      .eq("tenant_id", tenantId)
      .eq("reply_date", date)
      .eq("kind", "daily"),
    client.from("coaching_profiles").select("participant_id, status, coach_enabled").eq("tenant_id", tenantId),
  ]);
  for (const [name, res] of [
    ["participants", participants],
    ["logs", logs],
    ["coach_replies", replies],
    ["coaching_profiles", profiles],
  ] as const) {
    if (res.error) {
      logger.error("loadCoachBoard failed", { table: name, error: res.error.message, tenantId, date });
      return null;
    }
  }

  const logByParticipant = new Map<string, { morning: string; evening: string }>();
  for (const row of (logs.data || []) as Array<{
    participant_id: string;
    morning_intent: string | null;
    evening_insight: string | null;
  }>) {
    if (logByParticipant.has(row.participant_id)) continue; // 更新が新しい行を使う
    logByParticipant.set(row.participant_id, {
      morning: row.morning_intent ?? "",
      evening: row.evening_insight ?? "",
    });
  }

  const replyByParticipant = new Map<string, CoachBoardReply>();
  for (const row of (replies.data || []) as Array<
    ReplyRow & {
      participant_id: string;
      model: string | null;
      inputs_used: unknown;
      reviewed_by: string | null;
      reviewed_at: string | null;
    }
  >) {
    replyByParticipant.set(row.participant_id, {
      ...mapReply(row),
      model: row.model,
      inputsUsed: Array.isArray(row.inputs_used) ? row.inputs_used.filter((x): x is string => typeof x === "string") : [],
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at,
    });
  }

  const profileByParticipant = new Map<string, { status: "draft" | "confirmed"; coachEnabled: boolean }>();
  for (const row of (profiles.data || []) as Array<{
    participant_id: string;
    status: string | null;
    coach_enabled: boolean | null;
  }>) {
    profileByParticipant.set(row.participant_id, {
      status: row.status === "confirmed" ? "confirmed" : "draft",
      coachEnabled: row.coach_enabled !== false,
    });
  }

  return ((participants.data || []) as Array<{ id: string; name: string; department: string | null }>).map((p) => {
    const log = logByParticipant.get(p.id);
    const prof = profileByParticipant.get(p.id);
    return {
      participantId: p.id,
      name: p.name,
      department: p.department ?? "",
      profileStatus: prof ? prof.status : "none",
      coachEnabled: prof ? prof.coachEnabled : true,
      morning: log ? log.morning : "",
      evening: log ? log.evening : "",
      reply: replyByParticipant.get(p.id) ?? null,
    };
  });
}

/** 返信の行が、どの環境のものか（運営の操作の前に、対象の環境を確かめる）。無ければ tenantId は null。 */
export async function getCoachReplyTenant(
  replyId: string
): Promise<{ ok: true; tenantId: string | null; status: CoachReplyStatus | null; hasContent: boolean } | { ok: false }> {
  const { data, error } = await getClient()
    .from("coach_replies")
    .select("tenant_id, status, content")
    .eq("id", replyId)
    .maybeSingle();
  if (error) {
    logger.error("getCoachReplyTenant failed", { error: error.message, replyId });
    return { ok: false };
  }
  if (!data) return { ok: true, tenantId: null, status: null, hasContent: false };
  const row = data as { tenant_id: string; status: string | null; content: string | null };
  const status: CoachReplyStatus =
    row.status === "delivered" || row.status === "withdrawn" ? row.status : "pending_review";
  return { ok: true, tenantId: row.tenant_id, status, hasContent: (row.content ?? "").trim() !== "" };
}

/**
 * 運営が、返信を届ける・取り下げる。対象の行の環境（tenant_id）で絞り、影響行を確かめる。
 * 記録（行）は消さない。取り下げた返信は、本人の画面に出なくなる。
 *
 * いまの状態（expectedStatus）が、操作を決めたときに読んだ状態のままの行だけを更新する。
 * ほかの人の操作で先に状態が変わっていたら、0 行になり "conflict" を返す（取り下げた返信を、
 * 遅れて届いた「届ける」で届け直さないため）。status は NOT NULL なので、.eq で比べてよい。
 */
export async function setCoachReplyStatus(args: {
  replyId: string;
  tenantId: string;
  expectedStatus: CoachReplyStatus;
  status: Extract<CoachReplyStatus, "delivered" | "withdrawn">;
  reviewedBy: string;
  now: string;
}): Promise<"ok" | "conflict" | "error"> {
  const { data, error } = await getClient()
    .from("coach_replies")
    .update({ status: args.status, reviewed_by: args.reviewedBy, reviewed_at: args.now })
    .eq("id", args.replyId)
    .eq("tenant_id", args.tenantId)
    .eq("status", args.expectedStatus)
    .select("id");
  if (error) {
    logger.error("setCoachReplyStatus failed", { error: error.message, replyId: args.replyId, tenantId: args.tenantId });
    return "error";
  }
  if (!data || data.length === 0) {
    logger.warn("setCoachReplyStatus matched 0 rows", {
      replyId: args.replyId,
      tenantId: args.tenantId,
      expectedStatus: args.expectedStatus,
    });
    return "conflict";
  }
  return "ok";
}

// ---------------------------------------------------------------------------
// 運営へのお知らせメール（返信が、確認待ち・確認が必要になったとき。coach-notice.ts）
// ---------------------------------------------------------------------------

/**
 * お知らせの宛先の設定（ai_settings の key='coach_notify_config'。運営の人の ID の並び）。
 * config: null = 設定が無い、または、形が正しくない（そのときは invalid: true）。どちらも、メールは送らない。
 * 読めなかったこと（ok: false）と、無いことを分けて返す。
 */
export async function getCoachNoticeConfig(
  tenantId: string
): Promise<{ ok: true; config: CoachNoticeConfig | null; invalid: boolean } | { ok: false }> {
  const read = await readSetting(tenantId, COACH_NOTICE_CONFIG_KEY);
  if (!read.ok) return { ok: false };
  const config = parseCoachNoticeConfig(read.value);
  const invalid = config === null && read.value !== null && read.value.trim() !== "";
  if (invalid) {
    // 設定の行はあるが、形が正しくない。送らずに、記録に残す（値そのものは残さない）。
    logger.warn("coach_notify_config is set but not valid; staff notices stay off", { tenantId });
  }
  return { ok: true, config, invalid };
}

/**
 * お知らせの宛先の候補（運営の人の行から、要る欄だけ）。recipient: null = その ID の人がいない。
 * メールアドレスを返す。呼び出し側は、アドレスを記録（ログ）にも、画面への応答にも入れないこと。
 * トークンは読まない（メールに、管理画面を開ける URL を載せないため）。
 */
export async function getCoachNoticeRecipient(
  managerId: string
): Promise<{ ok: true; recipient: CoachNoticeRecipientRow | null } | { ok: false }> {
  const { data, error } = await getClient()
    .from("managers")
    .select("id, email, is_admin, role, tenant_id")
    .eq("id", managerId)
    .maybeSingle();
  if (error) {
    logger.error("getCoachNoticeRecipient failed", { error: error.message, managerId });
    return { ok: false };
  }
  if (!data) return { ok: true, recipient: null };
  const row = data as {
    id: string;
    email: string | null;
    is_admin: boolean | null;
    role: string | null;
    tenant_id: string | null;
  };
  return {
    ok: true,
    recipient: { id: row.id, email: row.email, isAdmin: row.is_admin, role: row.role, tenantId: row.tenant_id },
  };
}

/**
 * その環境で、いま運営の確認を待っている返信の件数（件数だけを数える。文も、だれの返信かも読まない）。
 * pending = 確認待ちの合計。needsAttention = そのうち、返信の文が無いもの（返信を作らなかった記入）。
 */
export async function countPendingCoachReplies(
  tenantId: string
): Promise<({ ok: true } & CoachNoticeCounts) | { ok: false }> {
  const client = getClient();
  const base = () =>
    client
      .from("coach_replies")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("kind", "daily")
      .eq("status", "pending_review");
  const [all, empty] = await Promise.all([base(), base().eq("content", "")]);
  if (all.error || empty.error || all.count === null || empty.count === null) {
    logger.error("countPendingCoachReplies failed", {
      error: all.error?.message ?? empty.error?.message ?? "count was not returned",
      tenantId,
    });
    return { ok: false };
  }
  return { ok: true, pending: all.count, needsAttention: empty.count };
}
