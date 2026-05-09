-- HR Event Confirmation Tracker — same shape as event_mkt_venues but
-- owned by the HR card. Empty on first deploy; HR populates rows via
-- the dashboard's "+ Add Venue" form.
CREATE TABLE IF NOT EXISTS hr_event_venues (
  id            SERIAL      PRIMARY KEY,
  venue_name    TEXT        NOT NULL,
  date_from     DATE,
  date_to       DATE,
  sheet_gids    TEXT        DEFAULT '',
  actual_count  INTEGER     NOT NULL DEFAULT 0,
  sort_order    INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hr_event_venues_sort_date
  ON hr_event_venues (sort_order, date_from);
