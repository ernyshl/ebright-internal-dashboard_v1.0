-- 019_create_nl_to_ct.sql
-- Tables backing the "Testing NL to CT Breakdown" dashboard.
-- Both are also auto-created at server startup via runMigrations() in src/server.js
-- (idempotent; safe to re-run).

CREATE TABLE IF NOT EXISTS nl_to_ct_tabs (
  id         SERIAL       PRIMARY KEY,
  gid        TEXT         NOT NULL UNIQUE,
  tab_name   TEXT         NOT NULL,
  week_date  DATE         NOT NULL UNIQUE,
  added_by   INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  added_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nl_to_ct_tabs_week_date_desc
  ON nl_to_ct_tabs (week_date DESC);

CREATE TABLE IF NOT EXISTS nl_to_ct_captures (
  id           SERIAL       PRIMARY KEY,
  tab_id       INTEGER      NOT NULL REFERENCES nl_to_ct_tabs(id) ON DELETE CASCADE,
  slot_key     TEXT         NOT NULL,
  branch_code  TEXT         NOT NULL,
  actual       INTEGER      NOT NULL,
  captured_by  INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  captured_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT nl_to_ct_captures_unique UNIQUE (tab_id, slot_key, branch_code)
);

CREATE INDEX IF NOT EXISTS idx_nl_to_ct_captures_tab
  ON nl_to_ct_captures (tab_id);
