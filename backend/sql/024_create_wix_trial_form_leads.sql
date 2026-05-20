CREATE TABLE wix_trial_form_leads (
  id               SERIAL PRIMARY KEY,
  parent_name      TEXT,
  parent_phone     TEXT,
  parent_email     TEXT,
  children_count   INT,
  children         JSONB,
  preferred_branch TEXT,
  location_key     TEXT,
  branch           TEXT,
  remarks          TEXT,
  utm_source       TEXT,
  utm_medium       TEXT,
  utm_campaign     TEXT,
  utm_content      TEXT,
  utm_term         TEXT,
  lead_source      TEXT DEFAULT 'Trial Class Form',
  landing_page_url TEXT,
  device_type      TEXT,
  fbclid           TEXT,
  gclid            TEXT,
  raw_payload      JSONB,
  received_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON wix_trial_form_leads (parent_email);
CREATE INDEX ON wix_trial_form_leads (parent_phone);
CREATE INDEX ON wix_trial_form_leads (received_at);
