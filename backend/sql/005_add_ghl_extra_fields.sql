-- Add preferred_day and time_slot captured from GHL webhook payload
-- (populated via {{opportunity.preferred_day}} and {{opportunity.time_slot}})

ALTER TABLE ghl_stages
  ADD COLUMN IF NOT EXISTS preferred_day TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS time_slot     TEXT NOT NULL DEFAULT '';
