-- Hardening migration following the 2026-05-11 security audit.
--
-- 1. Add an explicit `deny-all` policy on every RLS-enabled table so that any
--    code path that mistakenly uses the anon/authenticated key fails LOUDLY
--    (PostgREST returns 0 rows or 401) instead of silently succeeding under
--    service_role's BYPASSRLS. Previously RLS was enabled with zero policies,
--    relying entirely on service_role — which would mask any accidental
--    privilege downgrade.
--
-- 2. Add RLS for `briefings` and `growth_metrics`, which were omitted from the
--    earlier RLS migration but contain tenant-scoped PII.
--
-- 3. Add missing FK indexes that PostgreSQL does not auto-create. Without
--    these, ON DELETE checks against `participants`/`logs`/`managers` perform
--    sequential scans on every dependent table — slow at any reasonable size.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Deny-all policies on every RLS table
--    Idempotent: drop then create so re-running the migration is safe.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'participants',
    'managers',
    'logs',
    'feedback',
    'missions',
    'mission_comments',
    'rumination_analyses',
    'weekly_concepts',
    'identities',
    'hero_visions',
    'consult_interventions',
    'consultant_spotlights',
    'reflection_depth_analyses',
    'efficacy_moments',
    'aar_entries',
    'ritual_metrics',
    'peer_reflections',
    'client_reports',
    'structured_entries',
    'manager_reflections',
    'outsight_tasks',
    'culture_scores',
    'pitches',
    'before_after_assessments',
    'burnout_scores',
    'unlearn_entries',
    'knowledge_items',
    'psych_safety_analyses',
    'hope_designs',
    'feature_flags',
    'ai_settings'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    -- Only enable + add policy if the table actually exists in this schema
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', tbl || '_deny_all', tbl);
      EXECUTE format(
        'CREATE POLICY %I ON %I AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);',
        tbl || '_deny_all',
        tbl
      );
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Enable RLS on tables that were omitted from the earlier migration
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'briefings'
  ) THEN
    EXECUTE 'ALTER TABLE briefings ENABLE ROW LEVEL SECURITY;';
    EXECUTE 'DROP POLICY IF EXISTS briefings_deny_all ON briefings;';
    EXECUTE 'CREATE POLICY briefings_deny_all ON briefings AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'growth_metrics'
  ) THEN
    EXECUTE 'ALTER TABLE growth_metrics ENABLE ROW LEVEL SECURITY;';
    EXECUTE 'DROP POLICY IF EXISTS growth_metrics_deny_all ON growth_metrics;';
    EXECUTE 'CREATE POLICY growth_metrics_deny_all ON growth_metrics AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Missing FK indexes — these are the columns most likely to participate in
--    cascade checks and JOINs but PostgreSQL doesn't auto-index them.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_rumination_analyses_log_id      ON rumination_analyses(log_id);
CREATE INDEX IF NOT EXISTS idx_structured_entries_log_id       ON structured_entries(log_id);
CREATE INDEX IF NOT EXISTS idx_briefings_participant_id        ON briefings(participant_id);
CREATE INDEX IF NOT EXISTS idx_peer_reflections_from_participant_id ON peer_reflections(from_participant_id);
CREATE INDEX IF NOT EXISTS idx_psych_safety_analyses_manager_id ON psych_safety_analyses(manager_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_items_participant_id  ON knowledge_items(participant_id);
CREATE INDEX IF NOT EXISTS idx_mission_comments_mission_id     ON mission_comments(mission_id);
CREATE INDEX IF NOT EXISTS idx_logs_participant_id_date        ON logs(participant_id, date);
CREATE INDEX IF NOT EXISTS idx_feedback_participant_id         ON feedback(participant_id);

COMMIT;
