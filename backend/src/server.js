const { env } = require('./env');
const { createApp } = require('./app');
const { pool } = require('./db');

async function runMigrations() {
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
  // Drop ALL CHECK constraints on studentrecords so all branches (incl. KTG) are accepted
  await pool.query(`
    DO $$
    DECLARE
      con_name TEXT;
    BEGIN
      FOR con_name IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'studentrecords'::regclass
          AND contype = 'c'
      LOOP
        EXECUTE 'ALTER TABLE studentrecords DROP CONSTRAINT IF EXISTS ' || quote_ident(con_name);
        RAISE NOTICE 'Dropped CHECK constraint: %', con_name;
      END LOOP;
    END
    $$;
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
}

start().catch(err => {
  // eslint-disable-next-line no-console
  console.error('Startup failed:', err);
  process.exit(1);
});
