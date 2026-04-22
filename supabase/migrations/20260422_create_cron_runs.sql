-- Phase 0 #17 — Cron run log for idempotency and heartbeat monitoring
--
-- Purpose:
--   1. Idempotency — UNIQUE(cron_type, run_date) prevents a second cron run
--      on the same day from re-sending reminders (protects against Vercel
--      cron double-firing, redundant schedules, or manual re-invocations).
--   2. Heartbeat — external monitoring (UptimeRobot, Healthchecks.io, etc.)
--      can query the latest row per cron_type to detect silent cron outages.
--   3. Audit — status/detail columns record what happened, for post-incident
--      analysis when emails don't land.
--
-- Related memory:
--   - project_vercel_cron_unreliable.md (2026-04-10 incident)

CREATE TABLE IF NOT EXISTS cron_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cron_type TEXT NOT NULL,             -- e.g. "remind-morning", "remind-evening"
  run_date DATE NOT NULL,              -- JST business date the cron was for
  started_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  completed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'running' NOT NULL,  -- 'running' | 'success' | 'failed' | 'skipped'
  participants_processed INTEGER DEFAULT 0,
  emails_sent INTEGER DEFAULT 0,
  detail JSONB,
  UNIQUE(cron_type, run_date)
);

-- Index for heartbeat lookups: "latest run of type X"
CREATE INDEX IF NOT EXISTS idx_cron_runs_type_date
  ON cron_runs(cron_type, run_date DESC);

-- Index for cleanup by age
CREATE INDEX IF NOT EXISTS idx_cron_runs_started_at
  ON cron_runs(started_at);

-- Auto-cleanup: delete runs older than 90 days (can be called via cron)
CREATE OR REPLACE FUNCTION cleanup_old_cron_runs()
RETURNS void AS $$
BEGIN
  DELETE FROM cron_runs WHERE started_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;
