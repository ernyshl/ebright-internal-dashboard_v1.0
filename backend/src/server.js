const fs = require('fs');
const path = require('path');
const { env } = require('./env');
const { createApp } = require('./app');
const { pool } = require('./db');
const { startStSync } = require('./services/stSync');
const { startAmfSync } = require('./services/amfSync');

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

  const sqlDir = path.join(__dirname, '..', 'sql');
  if (fs.existsSync(sqlDir)) {
    const files = fs.readdirSync(sqlDir).filter(f => f.endsWith('.sql')).sort();
    for (const file of files) {
      const sql = fs.readFileSync(path.join(sqlDir, file), 'utf8');
      await pool.query(sql);
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

