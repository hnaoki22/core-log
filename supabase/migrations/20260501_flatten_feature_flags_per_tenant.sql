-- Phase 0.5: Flatten legacy nested feature_flags structure to per-tenant flat shape.
--
-- Before: value = {"default": {"flag1": true, "flag2": false, ...}}
-- After:  value = {"flag1": true, "flag2": false, ...}
--
-- Companion code change: feature-flags.ts now reads/writes per-tenant rows
-- in ai_settings. The read path supports BOTH legacy nested and new flat
-- shapes (defensive backwards-compat) so this migration can run before,
-- during, or after the application deploy.
--
-- Applied to production: 2026-05-01 via Supabase MCP (Cowork session).
--
-- Safety:
--  - Idempotent: only matches rows that still have 'default' nesting.
--  - Pure structural reshape: no flag values are added, removed, or changed.
--  - Verified by DO block raising on residual legacy rows.

UPDATE ai_settings
SET value = (value::jsonb->'default')::text
WHERE key = 'feature_flags'
  AND value::jsonb ? 'default'
  AND jsonb_typeof(value::jsonb->'default') = 'object';

DO $$
DECLARE
  legacy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO legacy_count
  FROM ai_settings
  WHERE key = 'feature_flags'
    AND value::jsonb ? 'default'
    AND jsonb_typeof(value::jsonb->'default') = 'object';

  IF legacy_count > 0 THEN
    RAISE EXCEPTION 'Migration failed: % rows still have legacy nested format', legacy_count;
  END IF;

  RAISE NOTICE 'Migration verified: 0 rows in legacy nested format';
END $$;
