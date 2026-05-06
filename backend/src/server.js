const { env } = require('./env');
const { createApp } = require('./app');
const { pool } = require('./db');
const { getTableNames } = require('./utils/tableNames');
const { startFinanceRefreshJob } = require('./jobs/refreshFinanceView');
const { startFinanceRenewalsRefreshJob } = require('./jobs/refreshFinanceRenewals');

async function runMigrations() {
  const { students: studentsTbl } = getTableNames();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS branch_okr_attendance (
      id SERIAL PRIMARY KEY,
      branch VARCHAR(255) NOT NULL,
      week_date DATE NOT NULL,
      total_online_attendance INTEGER DEFAULT 0,
      online_conversion_rate NUMERIC(5,2) DEFAULT 0,
      avg_online_trial_pax NUMERIC(5,2) DEFAULT 0,
      total_onl_attendance INTEGER DEFAULT 0,
      wed_absent INTEGER DEFAULT 0,
      wed_attended INTEGER DEFAULT 0,
      wed_frozen INTEGER DEFAULT 0,
      wed_replaced INTEGER DEFAULT 0,
      thu_absent INTEGER DEFAULT 0,
      thu_attended INTEGER DEFAULT 0,
      thu_frozen INTEGER DEFAULT 0,
      thu_replaced INTEGER DEFAULT 0,
      fri_absent INTEGER DEFAULT 0,
      fri_attended INTEGER DEFAULT 0,
      fri_frozen INTEGER DEFAULT 0,
      fri_replaced INTEGER DEFAULT 0,
      sat_absent INTEGER DEFAULT 0,
      sat_attended INTEGER DEFAULT 0,
      sat_frozen INTEGER DEFAULT 0,
      sat_replaced INTEGER DEFAULT 0,
      sun_absent INTEGER DEFAULT 0,
      sun_attended INTEGER DEFAULT 0,
      sun_frozen INTEGER DEFAULT 0,
      sun_replaced INTEGER DEFAULT 0,
      not_enrolled INTEGER DEFAULT 0,
      outstanding_invoice_disc INTEGER DEFAULT 0,
      expired_package INTEGER DEFAULT 0,
      newly_enrolled INTEGER DEFAULT 0,
      pc_meetup_invited INTEGER DEFAULT 0,
      pc_meetup_showup INTEGER DEFAULT 0,
      outstanding_invoice_pct NUMERIC(5,2) DEFAULT 0,
      partially_paid_unpaid INTEGER DEFAULT 0,
      active_students INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(branch, week_date)
    )
  `);
  // Drop ALL CHECK constraints on the active student table so all branches (incl. KTG) are accepted
  await pool.query(`
    DO $$
    DECLARE
      con_name TEXT;
    BEGIN
      FOR con_name IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = '${studentsTbl}'::regclass
          AND contype = 'c'
      LOOP
        EXECUTE 'ALTER TABLE ${studentsTbl} DROP CONSTRAINT IF EXISTS ' || quote_ident(con_name);
        RAISE NOTICE 'Dropped CHECK constraint: %', con_name;
      END LOOP;
    END
    $$;
  `);
  // finance_renewals: derived from autocount_invoices.data JSON, populated by
  // refreshFinanceRenewals.js cron. See docs/superpowers/specs/2026-05-05-finance-renewals-table-design.md
  await pool.query(`
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
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_finance_renewals_branch_date
      ON finance_renewals (branch_code, doc_date)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_finance_renewals_doc_date
      ON finance_renewals (doc_date)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS finance_renewals_refresh_log (
      id                        SERIAL      PRIMARY KEY,
      ran_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      source_max_last_modified  TIMESTAMPTZ,
      rows_upserted             INTEGER,
      rows_deleted              INTEGER,
      duration_ms               INTEGER,
      status                    TEXT,
      error_message             TEXT
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_finance_renewals_refresh_log_status_ran_at
      ON finance_renewals_refresh_log (status, ran_at DESC)
  `);
  // eslint-disable-next-line no-console
  console.log('✅ DB migrations complete');
}

async function start() {
  await runMigrations();
  const app = createApp();
  app.listen(env.PORT, '0.0.0.0', () => {
    // eslint-disable-next-line no-console
    console.log(`API listening on http://0.0.0.0:${env.PORT}`);
  });
  startFinanceRefreshJob();
  startFinanceRenewalsRefreshJob();
}

start().catch(err => {
  // eslint-disable-next-line no-console
  console.error('Startup failed:', err);
  process.exit(1);
});
