-- Mission status enum at the DB layer.
-- The API now whitelists status values at the boundary (src/app/api/mission/route.ts
-- ALLOWED_MISSION_STATUS), but a DB CHECK constraint provides defense in depth
-- against direct DB writes and prevents enum drift between code and storage.
--
-- Wrapped in a DO block so the migration is idempotent: if a row predates the
-- whitelist with a stray value (e.g. casing variant), the ALTER would
-- otherwise fail outright. We coerce known variants to the canonical value
-- first, then add the constraint.

BEGIN;

DO $$
BEGIN
  -- Normalize obvious case/whitespace variants
  UPDATE missions SET status = TRIM(status) WHERE status IS NOT NULL;
  UPDATE missions SET status = '進行中' WHERE status IS NULL OR status = '';

  -- Drop any prior version of the constraint so we can recreate idempotently
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'missions_status_check'
  ) THEN
    EXECUTE 'ALTER TABLE missions DROP CONSTRAINT missions_status_check';
  END IF;

  -- Add CHECK matching the API whitelist
  EXECUTE $sql$
    ALTER TABLE missions
    ADD CONSTRAINT missions_status_check
    CHECK (status IN ('未着手','進行中','完了','保留','中止'))
  $sql$;
END $$;

COMMIT;
