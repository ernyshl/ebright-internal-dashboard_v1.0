CREATE TABLE IF NOT EXISTS google_ads_leads (
  id            BIGSERIAL PRIMARY KEY,
  lead_id       TEXT UNIQUE,
  full_name     TEXT,
  email         TEXT,
  phone         TEXT,
  branch_raw    TEXT,
  branch        TEXT,
  campaign_id   TEXT,
  campaign_name TEXT,
  adgroup_id    TEXT,
  adgroup_name  TEXT,
  form_id       TEXT,
  gcl_id        TEXT,
  is_test       BOOLEAN DEFAULT false,
  raw_payload   JSONB,
  received_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_google_ads_leads_email       ON google_ads_leads(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_google_ads_leads_received_at ON google_ads_leads(received_at);
