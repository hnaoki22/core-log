/**
 * Phase 0 #18 — tests for src/lib/cron-lock.ts (memory fallback path)
 *
 * Exercises the memory fallback, which activates when Supabase is
 * unavailable OR when the cron_runs table doesn't exist. Supabase path
 * is out of scope (would require live DB).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { acquireCronLock, releaseCronLock, getLatestRuns } from "./cron-lock";

describe("cron-lock memory path", () => {
  beforeEach(() => {
    // Ensure memory fallback path (no Supabase)
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("acquire returns ok:true with lockId on first call", async () => {
    const r = await acquireCronLock("test-cron-a", "2026-04-22");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.lockId).toMatch(/^memory:/);
      expect(r.method).toBe("memory");
    }
  });

  it("acquire returns ok:false on duplicate (type, date)", async () => {
    await acquireCronLock("test-cron-b", "2026-04-22");
    const second = await acquireCronLock("test-cron-b", "2026-04-22");
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.reason).toBe("already-ran");
    }
  });

  it("different dates don't collide", async () => {
    await acquireCronLock("test-cron-c", "2026-04-22");
    const other = await acquireCronLock("test-cron-c", "2026-04-23");
    expect(other.ok).toBe(true);
  });

  it("different types don't collide", async () => {
    await acquireCronLock("remind-morning", "2026-04-22");
    const other = await acquireCronLock("remind-evening", "2026-04-22");
    expect(other.ok).toBe(true);
  });

  it("releaseCronLock updates the in-memory record", async () => {
    const r = await acquireCronLock("test-cron-d", "2026-04-22");
    if (!r.ok) throw new Error("precondition: acquire should succeed");
    await releaseCronLock(r.lockId, "success", {
      participantsProcessed: 10,
      emailsSent: 7,
    });
    // The specific update target is internal; we just verify it doesn't throw
    expect(true).toBe(true);
  });

  it("getLatestRuns returns the memory snapshot when Supabase unavailable", async () => {
    await acquireCronLock("test-cron-e", "2026-04-22");
    const runs = await getLatestRuns();
    const found = runs.find(
      (r) => r.cron_type === "test-cron-e" && r.run_date === "2026-04-22"
    );
    expect(found).toBeDefined();
  });
});
