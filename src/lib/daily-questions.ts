// Daily questions store — per-tenant questions organized by day-of-week (Meso layer).
//
// Schema in ai_settings.value JSON:
//   {
//     "monday":    { "axis": "意図", "morning": string[], "evening": string[] },
//     "tuesday":   { "axis": "対話", "morning": string[], "evening": string[] },
//     "wednesday": { "axis": "感情", ... },
//     "thursday":  { "axis": "学び", ... },
//     "friday":    { "axis": "体",   ... },
//     "saturday":  { "axis": "関係", ... },
//     "sunday":    { "axis": "統合", ... }
//   }
//
// This is the Meso layer of the four-tier inquiry algorithm (v0.2):
//   i.   Macro — dojo theme rotation (monthly/quarterly)         [future]
//   ii.  Meso  — weekly axis rotation (THIS FILE)                [implemented]
//   iii. Micro — AI deepens questions from yesterday's log       [future]
//   iv.  Meta  — monthly self-theorization                       [future]
//
// Backwards compatibility: if the legacy flat shape
//   { morning: string[], evening: string[] }
// is encountered, it is returned as-is for every day (same questions Mon-Sun).
// This lets the migration land without breaking any tenant that still has
// the old shape.

import { getClient } from "./supabase";
import { logger } from "./logger";

export type DayKey =
  | "monday" | "tuesday" | "wednesday" | "thursday"
  | "friday" | "saturday" | "sunday";

export type DailyQuestionsForDay = {
  axis: string;
  morning: string[];
  evening: string[];
};

export type DailyQuestionsWeekly = Record<DayKey, DailyQuestionsForDay>;

const EMPTY_DAY: DailyQuestionsForDay = { axis: "", morning: [], evening: [] };

const DAY_KEYS: DayKey[] = [
  "sunday", "monday", "tuesday", "wednesday",
  "thursday", "friday", "saturday",
];

const cacheByTenant = new Map<string, { data: DailyQuestionsWeekly | null; at: number }>();
const CACHE_TTL_MS = 60 * 1000;

function pickStrings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];
}

function parseWeekly(raw: unknown): DailyQuestionsWeekly | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  // Legacy flat shape: { morning: string[], evening: string[] } → broadcast to all days
  if (Array.isArray((obj as { morning?: unknown }).morning) ||
      Array.isArray((obj as { evening?: unknown }).evening)) {
    const morning = pickStrings(obj.morning);
    const evening = pickStrings(obj.evening);
    if (morning.length === 0 && evening.length === 0) return null;
    const dayBundle: DailyQuestionsForDay = { axis: "", morning, evening };
    return {
      sunday: dayBundle, monday: dayBundle, tuesday: dayBundle,
      wednesday: dayBundle, thursday: dayBundle, friday: dayBundle, saturday: dayBundle,
    };
  }

  // New weekly shape
  const result: Partial<DailyQuestionsWeekly> = {};
  for (const day of DAY_KEYS) {
    const d = obj[day];
    if (d && typeof d === "object") {
      const dd = d as Record<string, unknown>;
      result[day] = {
        axis: typeof dd.axis === "string" ? dd.axis : "",
        morning: pickStrings(dd.morning),
        evening: pickStrings(dd.evening),
      };
    } else {
      result[day] = { ...EMPTY_DAY };
    }
  }
  // If every day is empty, treat as unset
  if (DAY_KEYS.every((d) =>
    result[d]!.morning.length === 0 && result[d]!.evening.length === 0
  )) return null;
  return result as DailyQuestionsWeekly;
}

async function readFromSupabase(tenantId: string): Promise<DailyQuestionsWeekly | null> {
  try {
    const { data, error } = await getClient()
      .from("ai_settings")
      .select("value")
      .eq("tenant_id", tenantId)
      .eq("key", "daily_questions")
      .maybeSingle();
    if (error) {
      logger.error("daily-questions: read failed", { tenantId, error: error.message });
      return null;
    }
    if (!data?.value) return null;
    try {
      return parseWeekly(JSON.parse(data.value));
    } catch (err) {
      logger.error("daily-questions: parse failed", {
        tenantId, error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  } catch (err) {
    logger.error("daily-questions: query failed", {
      tenantId, error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function getWeeklyForTenant(tenantId: string): Promise<DailyQuestionsWeekly | null> {
  const cached = cacheByTenant.get(tenantId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;
  const data = await readFromSupabase(tenantId);
  cacheByTenant.set(tenantId, { data, at: Date.now() });
  return data;
}

// Returns today's day key in JST (Tokyo timezone). The participant's calendar
// day is the JST one — this matches how the rest of the app keys logs by
// getTodayJST().
export function getTodayDayKey(now: Date = new Date()): DayKey {
  // Get JST weekday by formatting in Asia/Tokyo
  const jstWeekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    weekday: "long",
  }).format(now).toLowerCase();
  if ((DAY_KEYS as string[]).includes(jstWeekday)) return jstWeekday as DayKey;
  return "monday";
}

// ---- 週替わりローテーション（プールが多い時、毎日は数問だけを週ごとに出す）----
// 2026-06-21: ネタ集の大量プール投入に合わせ、惰性対策として導入。
// プールが QUESTIONS_PER_SLOT 以下のテナント（既存3問/スロット等）は挙動不変。
export const QUESTIONS_PER_SLOT = 3;

function jstWeekIndex(now: Date): number {
  const days = Math.floor((now.getTime() + 9 * 3600 * 1000) / 86400000);
  return Math.floor(days / 7);
}

function rotateSelect(pool: string[], n: number, weekIdx: number): string[] {
  if (!Array.isArray(pool) || pool.length <= n) return pool || [];
  const start = (((weekIdx * n) % pool.length) + pool.length) % pool.length;
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(pool[(start + i) % pool.length]);
  return out;
}

export async function getTodayQuestionsForTenant(
  tenantId: string,
  now: Date = new Date()
): Promise<DailyQuestionsForDay | null> {
  const weekly = await getWeeklyForTenant(tenantId);
  if (!weekly) return null;
  const day = weekly[getTodayDayKey(now)] || null;
  if (!day) return null;
  const wk = jstWeekIndex(now);
  return {
    axis: day.axis,
    morning: rotateSelect(day.morning, QUESTIONS_PER_SLOT, wk),
    evening: rotateSelect(day.evening, QUESTIONS_PER_SLOT, wk),
  };
}

export function invalidateDailyQuestionsCache(tenantId?: string) {
  if (tenantId) cacheByTenant.delete(tenantId);
  else cacheByTenant.clear();
}

// ---------------------------------------------------------------------------
// Write (admin) — 管理画面から毎日の問いを保存する。
// 2026-06-21: 管理UI追加（本藤さん要望）。upsert + 行数検証 + キャッシュ無効化。
// ---------------------------------------------------------------------------

const MAX_Q_PER_LIST = 30;   // 1曜日・朝/夕あたりの問い上限
const MAX_Q_CHARS = 400;     // 1問あたりの文字数上限

function sanitizeWeekly(weekly: DailyQuestionsWeekly): DailyQuestionsWeekly {
  const out = {} as DailyQuestionsWeekly;
  const cap = (arr: string[]) =>
    arr.map((s) => (typeof s === "string" ? s.trim() : ""))
       .filter((s) => s.length > 0)
       .map((s) => s.slice(0, MAX_Q_CHARS))
       .slice(0, MAX_Q_PER_LIST);
  for (const day of DAY_KEYS) {
    const d = weekly[day] ?? EMPTY_DAY;
    out[day] = {
      axis: (d.axis || "").trim().slice(0, 40),
      morning: cap(d.morning || []),
      evening: cap(d.evening || []),
    };
  }
  return out;
}

/**
 * テナントの毎日の問い（週次）を保存（upsert）する。admin API 専用。
 * 影響行を .select() で検証する（zero-defect-guard 原則1）。保存後はキャッシュを無効化。
 */
export async function saveWeeklyForTenant(
  tenantId: string,
  rawWeekly: unknown
): Promise<boolean> {
  const parsed = parseWeekly(rawWeekly);
  if (!parsed) {
    logger.warn("daily-questions: save rejected (empty or invalid weekly)", { tenantId });
    return false;
  }
  const clean = sanitizeWeekly(parsed);
  const { error, data } = await getClient()
    .from("ai_settings")
    .upsert(
      { tenant_id: tenantId, key: "daily_questions", value: JSON.stringify(clean) },
      { onConflict: "tenant_id,key" }
    )
    .select("tenant_id");
  if (error) {
    logger.error("daily-questions: save failed", { tenantId, error: error.message });
    return false;
  }
  if (!data || data.length === 0) {
    logger.warn("daily-questions: upsert matched 0 rows", { tenantId });
    return false;
  }
  invalidateDailyQuestionsCache(tenantId);
  return true;
}
