-- 007_ghl_ignored_payloads_view.sql
--
-- Provides a focused view onto the ghl_webhook_log table for the rows that
-- were ignored by the /api/ghl-stages/webhook handler. The webhook
-- intentionally drops fires whose (email, last_name, stage_key) tuple
-- matches an existing ghl_stages row, but the full raw payload is still
-- written to ghl_webhook_log with action='ignored'.
--
-- This view exposes those payloads as `payload` (jsonb) plus the parsed
-- identifying fields, so they can be queried like a real table:
--
--   SELECT * FROM ghl_ignored_payloads WHERE email = 'foo@bar.com';
--
-- To replay a payload back through the webhook, POST it to
-- /api/ghl-stages/webhook (the row will only insert if the matching
-- ghl_stages tuple has since been removed or otherwise no longer exists).

-- Defensive: ensure the source table exists. The webhook route writes to it
-- on every fire; this CREATE TABLE IF NOT EXISTS is just for fresh DBs.
CREATE TABLE IF NOT EXISTS ghl_webhook_log (
  id              BIGSERIAL PRIMARY KEY,
  raw_body        JSONB NOT NULL,
  email           TEXT,
  stage_raw       TEXT,
  stage_key       TEXT,
  fingerprint     TEXT,
  action          TEXT NOT NULL,
  ignore_reason   TEXT,
  error_message   TEXT,
  duration_ms     INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Older deployments created the table without created_at — add it idempotently.
ALTER TABLE ghl_webhook_log
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_ghl_webhook_log_action_created
  ON ghl_webhook_log (action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ghl_webhook_log_email_stage
  ON ghl_webhook_log (email, stage_key);

-- Enforce the dedup rule at the DB level: one row per (email, last_name,
-- stage_key). The webhook route already filters in code, but this catches
-- regressions and makes the constraint explicit.
--
-- Skip if migration 009 has already replaced this index with the
-- opportunity-name variant (uq_ghl_stages_email_oppname_stage). On databases
-- where 009 has run, the (email, last_name, stage_key) tuple is no longer
-- enforced as unique and existing rows may legitimately violate it.
--
-- If 009 hasn't run yet but the data already contains duplicates that
-- violate this constraint (e.g. the dedup is currently enforced only by
-- the newer opportunity-name keying in code), swallow the unique-violation
-- and let migration 009 take over. We do NOT silently swallow other
-- errors — those propagate.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'uq_ghl_stages_email_oppname_stage'
  ) THEN
    BEGIN
      EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uq_ghl_stages_email_lastname_stage
               ON ghl_stages (email, last_name, stage_key)';
    EXCEPTION
      WHEN unique_violation OR SQLSTATE '23505' THEN
        RAISE NOTICE
          'Skipping uq_ghl_stages_email_lastname_stage: existing duplicates violate it. Migration 009 will replace this index.';
    END;
  END IF;
END
$$;

-- DROP first so the column list can change between deploys. CREATE OR
-- REPLACE only allows adding columns at the end, not removing/reordering,
-- which trips up older databases whose view shape has drifted.
DROP VIEW IF EXISTS ghl_ignored_payloads;
CREATE VIEW ghl_ignored_payloads AS
SELECT
  id,
  email,
  stage_raw,
  stage_key,
  fingerprint,
  ignore_reason  AS reason,
  raw_body       AS payload,
  duration_ms,
  created_at
FROM ghl_webhook_log
WHERE action = 'ignored';
