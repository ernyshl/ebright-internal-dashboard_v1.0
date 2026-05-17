const fs = require('fs');
const path = require('path');
const { env } = require('./env');
const { createApp } = require('./app');
const { pool } = require('./db');
const { startStSync } = require('./services/stSync');
const { startAmfSync } = require('./services/amfSync');
const { getTableNames } = require('./utils/tableNames');
const { startFinanceRefreshJob } = require('./jobs/refreshFinanceView');
const { startFinanceRenewalsRefreshJob } = require('./jobs/refreshFinanceRenewals');
const { startDailySnapshotJob } = require('./jobs/dailySnapshotCron');

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

  // nl_to_ct: tables backing the Testing NL to CT Breakdown dashboard.
  // See docs/superpowers/specs/2026-05-17-nl-to-ct-breakdown-design.md
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nl_to_ct_tabs (
      id         SERIAL       PRIMARY KEY,
      gid        TEXT         NOT NULL UNIQUE,
      tab_name   TEXT         NOT NULL,
      week_date  DATE         NOT NULL UNIQUE,
      added_by   INTEGER      REFERENCES users(id) ON DELETE SET NULL,
      added_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_nl_to_ct_tabs_week_date_desc
      ON nl_to_ct_tabs (week_date DESC)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nl_to_ct_captures (
      id           SERIAL       PRIMARY KEY,
      tab_id       INTEGER      NOT NULL REFERENCES nl_to_ct_tabs(id) ON DELETE CASCADE,
      slot_key     TEXT         NOT NULL,
      branch_code  TEXT         NOT NULL,
      actual       INTEGER      NOT NULL,
      captured_by  INTEGER      REFERENCES users(id) ON DELETE SET NULL,
      captured_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      CONSTRAINT nl_to_ct_captures_unique UNIQUE (tab_id, slot_key, branch_code)
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_nl_to_ct_captures_tab
      ON nl_to_ct_captures (tab_id)
  `);

  // Apply any standalone SQL migration files in backend/sql/ (e.g. ST merged
  // staff view, AMF sync state). They're idempotent (CREATE OR REPLACE,
  // CREATE IF NOT EXISTS) so safe to re-run on every boot.
  const sqlDir = path.join(__dirname, '..', 'sql');
  if (fs.existsSync(sqlDir)) {
    const files = fs.readdirSync(sqlDir).filter(f => f.endsWith('.sql')).sort();
    const failed = [];
    for (const file of files) {
      const sql = fs.readFileSync(path.join(sqlDir, file), 'utf8');
      try {
        await pool.query(sql);
      } catch (err) {
        // Don't crash startup on a single file. The migrations are cumulative
        // history; on a DB whose state has drifted from prod (e.g. duplicate
        // rows preventing a unique-index step) the app is still useful even
        // if one migration step couldn't apply. Log each failure loudly and
        // emit a summary at the end so it's obvious the DB needs attention.
        // eslint-disable-next-line no-console
        console.warn(`[migrations] ⚠️  ${file} FAILED: ${err.message}`);
        failed.push({ file, message: err.message });
      }
    }
    if (failed.length) {
      // eslint-disable-next-line no-console
      console.warn(
        `[migrations] ⚠️  ${failed.length}/${files.length} migration file(s) failed — DB state has drifted. ` +
        `Run a deduplication / cleanup pass and re-deploy. Failed: ${failed.map(f => f.file).join(', ')}`
      );
    }
  }

  // eslint-disable-next-line no-console
  console.log('✅ DB migrations complete');
}

// Cold-start the remote DB can blip on the very first connect after laptop
// wake. Retry the migration phase a few times before giving up so a transient
// network hiccup doesn't crash the backend and leave the dashboard dead.
async function runMigrationsWithRetry() {
  const attempts = 3;
  for (let i = 1; i <= attempts; i++) {
    try {
      await runMigrations();
      return;
    } catch (err) {
      const msg = err && (err.message || err);
      // eslint-disable-next-line no-console
      console.error(`[startup] migrations attempt ${i}/${attempts} failed:`, msg);
      if (i === attempts) throw err;
      await new Promise(r => setTimeout(r, i * 3000));
    }
  }
}

async function start() {
  await runMigrationsWithRetry();

  // AMF direct-device backfill runs on a recurring interval so scans the
  // vendor middleware missed (or that piled up while the laptop was closed)
  // are recovered from the device's 50,000-event on-board buffer. The first
  // tick fires immediately inside startAmfSync() — a slow/offline device
  // can't block startup because the tick runs in the background.
  startAmfSync();

  const app = createApp();
  app.listen(env.PORT, '0.0.0.0', () => {
    // eslint-disable-next-line no-console
    console.log(`API listening on http://0.0.0.0:${env.PORT}`);
  });
  startStSync();
  startFinanceRefreshJob();
  startFinanceRenewalsRefreshJob();
  startDailySnapshotJob();
}

// Don't let a transient DB blip (remote Postgres dropping an idle client, etc.)
// crash the process. Log and carry on — pools recover on the next query.
// Startup-time rejections are still surfaced via the start().catch below.
process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('[unhandledRejection]', reason && (reason.message || reason));
});
process.on('uncaughtException', (err) => {
  // eslint-disable-next-line no-console
  console.error('[uncaughtException]', err && (err.message || err));
});

start().catch(err => {
  // eslint-disable-next-line no-console
  console.error('Startup failed:', err);
  process.exit(1);
});

