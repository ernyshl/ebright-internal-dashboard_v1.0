-- 008_ghl_ignored_replayed_at.sql
--
-- Lets the admin UI mark an ignored payload as "replayed" so it disappears
-- from the pending list. The /api/ghl-stages/ignored/:id/replay route stamps
-- replayed_at = NOW() after a successful upsert into ghl_stages.

ALTER TABLE ghl_webhook_log
  ADD COLUMN IF NOT EXISTS replayed_at TIMESTAMPTZ;

CREATE OR REPLACE VIEW ghl_ignored_payloads AS
SELECT
  id,
  email,
  stage_raw,
  stage_key,
  fingerprint,
  ignore_reason  AS reason,
  raw_body       AS payload,
  duration_ms,
  created_at,
  replayed_at
FROM ghl_webhook_log
WHERE action = 'ignored';
