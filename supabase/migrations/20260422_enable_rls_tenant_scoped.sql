-- Phase 0 #14: Enable Row Level Security on all tenant-scoped tables.
--
-- Context:
--   Today the app connects with SUPABASE_SERVICE_ROLE_KEY, which uses the
--   Postgres `service_role` role — that role has BYPASSRLS by default, so
--   every query in this codebase skips RLS entirely. Enabling RLS now has
--   ZERO runtime impact on existing code paths.
--
-- What this buys us:
--   1. Defense in depth — if the service_role key ever leaks, any client
--      that ends up with a non-service role (anon/authenticated) is
--      automatically denied across every tenant table.
--   2. Safe migration path — when we move part of the app to anon-key +
--      JWT-based auth (future Phase 0.5+), RLS is already ON and any new
--      non-service code path is denied-by-default. We add per-table
--      policies as we explicitly open each surface.
--   3. Schema-level documentation — RLS being ON is an explicit
--      declaration that tenant isolation is load-bearing for these tables.
--
-- What this does NOT do:
--   - Block any current queries (service_role bypasses RLS).
--   - Enforce tenant isolation for service_role-using code (that remains
--     the app layer's job — see tenant-context.ts and the tenantId
--     arguments on every supabase.ts function).
--
-- Non-tenant-scoped tables intentionally excluded:
--   - tenants       — tenant registry itself
--   - cron_runs     — system-wide cron idempotency lock
--   - otp_codes     — keyed by token, not tenant
--
-- Future work (Phase 0.5+):
--   Add per-table policies of the form:
--     CREATE POLICY "tenant_isolation" ON <table>
--       USING (tenant_id::text = auth.jwt() ->> 'tenant_id');
--   Required before any anon-key / JWT-based access path goes live.

BEGIN;

-- Core domain
ALTER TABLE logs                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants            ENABLE ROW LEVEL SECURITY;
ALTER TABLE managers                ENABLE ROW LEVEL SECURITY;
ALTER TABLE missions                ENABLE ROW LEVEL SECURITY;
ALTER TABLE mission_comments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback                ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_settings             ENABLE ROW LEVEL SECURITY;

-- Feature: calendar / ritual
ALTER TABLE calendar_settings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE micro_ritual_metrics    ENABLE ROW LEVEL SECURITY;

-- Feature: wellbeing / psych safety
ALTER TABLE burnout_scores          ENABLE ROW LEVEL SECURITY;
ALTER TABLE psych_safety_analyses   ENABLE ROW LEVEL SECURITY;
ALTER TABLE rumination_analyses     ENABLE ROW LEVEL SECURITY;

-- Feature: reflection / AAR / hero
ALTER TABLE aar_entries             ENABLE ROW LEVEL SECURITY;
ALTER TABLE before_after_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE hero_assessments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE hope_designs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_entries        ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_concepts         ENABLE ROW LEVEL SECURITY;

-- Feature: manager / peer
ALTER TABLE manager_reflections     ENABLE ROW LEVEL SECURITY;
ALTER TABLE peer_reflections        ENABLE ROW LEVEL SECURITY;

-- Feature: learning / tasks / knowledge
ALTER TABLE knowledge_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE outsight_tasks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE unlearn_entries         ENABLE ROW LEVEL SECURITY;
ALTER TABLE structured_entries      ENABLE ROW LEVEL SECURITY;

-- Consulting intervention log
ALTER TABLE consult_interventions   ENABLE ROW LEVEL SECURITY;

-- Sanity check: expect 25 tables with RLS enabled after this migration.
-- SELECT COUNT(*) FROM pg_tables
--   WHERE schemaname = 'public' AND rowsecurity = true;

COMMIT;
