// Daily questions store — per-tenant 6 questions (3 morning + 3 evening).
//
// Loaded from ai_settings table:
//   tenant_id=<tid>, key='daily_questions', value=<JSON {morning:[],evening:[]}>
//
// Companion feature flag: feature.dailyQuestions. When OFF, this loader is
// not called and the input UI falls back to the legacy single-textarea view.
//
// Cache: per-tenant 60s TTL, matching the feature-flags pattern.

import { getClient } from "./supabase";
import { logger } from "./logger";

export type DailyQuestions = {
  morning: string[];
  evening: string[];
};

const EMPTY: DailyQuestions = { morning: [], evening: [] };

const cacheByTenant = new Map<string, { data: DailyQuestions; at: number }>();
const CACHE_TTL_MS = 60 * 1000;

async function readFromSupabase(tenantId: string): Promise<DailyQuestions> {
  try {
    const { data, error } = await getClient()
      .from("ai_settings")
      .select("value")
      .eq("tenant_id", tenantId)
      .eq("key", "daily_questions")
      .maybeSingle();
    if (error) {
      logger.error("daily-questions: read failed", {
        tenantId,
        error: error.message,
      });
      return EMPTY;
    }
    if (!data?.value) return EMPTY;
    const parsed = JSON.parse(data.value) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray((parsed as { morning?: unknown }).morning) &&
      Array.isArray((parsed as { evening?: unknown }).evening)
    ) {
      const obj = parsed as { morning: unknown[]; evening: unknown[] };
      return {
        morning: obj.morning.filter((s): s is string => typeof s === "string"),
        evening: obj.evening.filter((s): s is string => typeof s === "string"),
      };
    }
    return EMPTY;
  } catch (err) {
    logger.error("daily-questions: parse failed", {
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
    return EMPTY;
  }
}

export async function getQuestionsForTenant(
  tenantId: string
): Promise<DailyQuestions> {
  const cached = cacheByTenant.get(tenantId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;
  const data = await readFromSupabase(tenantId);
  cacheByTenant.set(tenantId, { data, at: Date.now() });
  return data;
}

export function invalidateDailyQuestionsCache(tenantId?: string) {
  if (tenantId) cacheByTenant.delete(tenantId);
  else cacheByTenant.clear();
}
