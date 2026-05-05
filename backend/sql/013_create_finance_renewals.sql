-- 013_create_finance_renewals.sql
-- Creates the finance_renewals table (derived from autocount_invoices.data JSON)
-- and its append-only refresh log. Tables are also auto-created at server
-- startup via runMigrations() in src/server.js — this file exists for
-- documentation and manual provisioning.

CREATE TABLE IF NOT EXISTS finance_renewals (
  id                      BIGSERIAL     PRIMARY KEY,
  doc_no                  TEXT          NOT NULL,
  doc_date                DATE          NOT NULL,
  branch_code             TEXT          NOT NULL,
  package                 TEXT          NOT NULL,
  amount                  NUMERIC(12,2) NOT NULL,
  student_name            TEXT,
  raw_description         TEXT,
  detail_key              BIGINT        NOT NULL,
  student_index           INTEGER       NOT NULL,
  source_last_modified    TIMESTAMPTZ,
  parsed_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT finance_renewals_doc_key_student_unique UNIQUE (doc_no, detail_key, student_index)
);

CREATE INDEX IF NOT EXISTS idx_finance_renewals_branch_date
  ON finance_renewals (branch_code, doc_date);

CREATE INDEX IF NOT EXISTS idx_finance_renewals_doc_date
  ON finance_renewals (doc_date);

CREATE TABLE IF NOT EXISTS finance_renewals_refresh_log (
  id                        SERIAL      PRIMARY KEY,
  ran_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_max_last_modified  TIMESTAMPTZ,
  rows_upserted             INTEGER,
  rows_deleted              INTEGER,
  duration_ms               INTEGER,
  status                    TEXT,
  error_message             TEXT
);

CREATE INDEX IF NOT EXISTS idx_finance_renewals_refresh_log_status_ran_at
  ON finance_renewals_refresh_log (status, ran_at DESC);
