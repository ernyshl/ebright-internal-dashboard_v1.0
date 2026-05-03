-- 010_ghl_stages_source_partial_unique.sql
--
-- Allows manual replays from the Ignored Payloads admin page to insert rows
-- that would normally violate the (email, opportunity_name, stage_key)
-- uniqueness rule. The dedup constraint stays in place for real GHL webhook
-- fires; replay rows ride alongside as duplicates. The Lead Centre display
-- and Region/Branch counts use DISTINCT ON, so duplicates still render as
-- one row regardless of source.
--
-- Sources currently in use:
--   'webhook'  inbound from /api/ghl-stages/webhook (default for legacy rows)
--   'replay'   from /api/ghl-stages/ignored/:id/replay
--   'manual'   from POST /api/ghl-stages (super_admin form)

ALTER TABLE ghl_stages
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'webhook';

DROP INDEX IF EXISTS uq_ghl_stages_email_oppname_stage;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ghl_stages_email_oppname_stage_webhook
  ON ghl_stages (email, opportunity_name, stage_key)
  WHERE source = 'webhook';
