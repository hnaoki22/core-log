/**
 * Phase 0 #17 — Cron lock / run-log helper
 *
 * Two goals:
 *   1. Idempotency: ensure redundant cron triggers (e.g., Vercel primary +
 *      backup schedule, or manual re-invocation) don't send duplicate emails.
 *   2. Heartbeat: record successful runs in Supabase so external monitoring
 *      can detect silent Vercel cron outages (see the 2026-04-10 incident).
 *
 * Design:
 *   - UNIQUE(cron_type, run_date) in the cron_runs table enforces the lock.
 *   - `acquireCronLock()` inserts a 'running' row; if the INSERT conflicts
 *     (duplicate key), the lock is already held → caller should skip.
 *   - `releaseCronLock()` updates the row with final status + summary.
 *   - If the Supabase table doesn't exist (e.g., migration not applied yet),
 *     we fall back to a per-process in-memory Map. This is NOT durable across
 *     serverless cold starts, but is strictly better than no lock in dev.
 *     Production WARN is emitted via isProductionMode() guards.
 */

import { logger } from "./logger";
import { isProductionMode } from "./env";

// Reuse the Supabase client pattern from otp.ts
let supabaseClient: ReturnType<typeof import("@supabase/supabase-js").createClient> | null = null;

async function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      supabaseClient = createClient(url, key);
      return supabaseClient;
    }
  } catch {
    // Fall through to null
  }
  return null;
}

// In-memory fallback — per-process only, not cold-start durable
interface MemoryLock {
  cronType: string;
  runDate: string;
  startedAt: number;
  status: "running" | "success" | "failed" | "skipped";
}
const memoryLocks = new Map<string, MemoryLock>();
function memoryKey(cronType: string, runDate: string) {
  return `${cronType}:${runDate}`;
}

let tableAvailable: boolean | null = null;
let memoryFallbackWarnedOnce = false;

async function checkCronRunsTable(): Promise<boolean> {
  if (tableAvailable !== null) return tableAvailable;
  const client = await getSupabaseClient();
  if (!client) {
    tableAvailable = false;
    warnMemoryFallbackIfProd("supabase client unavailable");
    return false;
  }
  try {
    const { error } = await client.from("cron_runs").select("id").limit(1);
    if (error) {
      if (error.message.includes("does not exist")) {
        tableAvailable = false;
        warnMemoryFallbackIfProd("cron_runs table not found");
        return false;
      }
      tableAvailable = false;
      warnMemoryFallbackIfProd(`probe failed: ${error.message}`);
      return false;
    }
    tableAvailable = true;
    logger.info("cron-lock: Using Supabase-backed cron_runs table");
    return true;
  } catch (e) {
    tableAvailable = false;
    warnMemoryFallbackIfProd(`probe threw: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

function warnMemoryFallbackIfProd(reason: string): void {
  if (!isProductionMode()) return;
  if (memoryFallbackWarnedOnce) return;
  memoryFallbackWarnedOnce = true;
  logger.warn(
    "cron-lock: memory fallback active in production — redundant cron runs may not be de-duplicated across cold starts. " +
    "Apply supabase/migrations/20260422_create_cron_runs.sql to restore durable lock.",
    { reason }
  );
}

export type AcquireResult =
  | { ok: true; lockId: string; method: "supabase" | "memory" }
  | { ok: false; reason: "already-ran"; existingStatus?: string };

/**
 * Try to acquire an exclusive lock for (cronType, runDate).
 *
 * Returns:
 *   - { ok: true, lockId, method } — lock acquired, proceed with work and call releaseCronLock(lockId, ...)
 *   - { ok: false, reason: "already-ran" } — another run already holds the lock, caller should skip
 */
export async function acquireCronLock(cronType: string, runDate: string): Promise<AcquireResult> {
  if (await checkCronRunsTable()) {
    const client = await getSupabaseClient();
    if (!client) {
      // Should not happen because checkCronRunsTable returned true, but be defensive
      return acquireMemoryLock(cronType, runDate);
    }
    try {
      const insertPayload: Record<string, string | number> = {
        cron_type: cronType,
        run_date: runDate,
        status: "running",
      };
      const { data, error } = await client
        .from("cron_runs")
        .insert(insertPayload as never)
        .select("id")
        .single() as unknown as { data: { id: string } | null; error: { message: string; code?: string } | null };

      if (error) {
        // Unique violation → already ran
        if (error.code === "23505" || error.message.includes("duplicate key")) {
          logger.info("cron-lock: already ran today", { cronType, runDate });
          return { ok: false, reason: "already-ran" };
        }
        // Other error → log and fall back
        logger.error("cron-lock: insert failed, falling back to memory", { error: error.message });
        return acquireMemoryLock(cronType, runDate);
      }
      if (!data) {
        return acquireMemoryLock(cronType, runDate);
      }
      return { ok: true, lockId: data.id, method: "supabase" };
    } catch (e) {
      logger.error("cron-lock: acquire threw, falling back to memory", { error: String(e) });
      return acquireMemoryLock(cronType, runDate);
    }
  }
  return acquireMemoryLock(cronType, runDate);
}

function acquireMemoryLock(cronType: string, runDate: string): AcquireResult {
  const key = memoryKey(cronType, runDate);
  const existing = memoryLocks.get(key);
  if (existing) {
    return { ok: false, reason: "already-ran", existingStatus: existing.status };
  }
  memoryLocks.set(key, { cronType, runDate, startedAt: Date.now(), status: "running" });
  return { ok: true, lockId: `memory:${key}`, method: "memory" };
}

export interface CronRunSummary {
  participantsProcessed: number;
  emailsSent: number;
  detail?: Record<string, unknown>;
}

/**
 * Release the lock with final status. Always call this — even on error paths —
 * so the run-log reflects reality.
 */
export async function releaseCronLock(
  lockId: string,
  status: "success" | "failed" | "skipped",
  summary: CronRunSummary
): Promise<void> {
  if (lockId.startsWith("memory:")) {
    const key = lockId.slice("memory:".length);
    const lock = memoryLocks.get(key);
    if (lock) {
      lock.status = status;
    }
    return;
  }
  const client = await getSupabaseClient();
  if (!client) return;
  try {
    const updatePayload: Record<string, string | number | unknown> = {
      completed_at: new Date().toISOString(),
      status,
      participants_processed: summary.participantsProcessed,
      emails_sent: summary.emailsSent,
    };
    if (summary.detail) {
      updatePayload.detail = summary.detail;
    }
    const { error } = await client
      .from("cron_runs")
      .update(updatePayload as never)
      .eq("id", lockId);
    if (error) {
      logger.error("cron-lock: release failed", { lockId, error: error.message });
    }
  } catch (e) {
    logger.error("cron-lock: release threw", { lockId, error: String(e) });
  }
}

export interface CronRunRecord {
  cron_type: string;
  run_date: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  participants_processed: number;
  emails_sent: number;
}

/**
 * Return the most recent run for each cron_type. Used by the heartbeat
 * endpoint for external monitoring.
 */
export async function getLatestRuns(): Promise<CronRunRecord[]> {
  if (!(await checkCronRunsTable())) {
    // Return memory snapshot as best-effort
    return Array.from(memoryLocks.values()).map((l) => ({
      cron_type: l.cronType,
      run_date: l.runDate,
      started_at: new Date(l.startedAt).toISOString(),
      completed_at: null,
      status: l.status,
      participants_processed: 0,
      emails_sent: 0,
    }));
  }
  const client = await getSupabaseClient();
  if (!client) return [];
  try {
    // Get the most recent 30 rows (covers multiple cron types with history)
    const { data, error } = await client
      .from("cron_runs")
      .select("cron_type, run_date, started_at, completed_at, status, participants_processed, emails_sent")
      .order("started_at", { ascending: false })
      .limit(30) as unknown as { data: CronRunRecord[] | null; error: { message: string } | null };
    if (error) {
      logger.error("cron-lock: getLatestRuns failed", { error: error.message });
      return [];
    }
    return data ?? [];
  } catch (e) {
    logger.error("cron-lock: getLatestRuns threw", { error: String(e) });
    return [];
  }
}
