-- AMF (Hikvision direct-device) sync watermark.
-- One row only (id=1). Holds the last successfully-synced event time
-- so the next run only fetches AcsEvents newer than this watermark
-- instead of re-pulling the whole 50,000-event device buffer.
CREATE TABLE IF NOT EXISTS amf_sync_state (
  id            INTEGER PRIMARY KEY,
  last_sync_at  TIMESTAMPTZ,
  device_serial TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO amf_sync_state (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;
