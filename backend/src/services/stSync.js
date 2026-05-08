// ST attendance + staff sync service.
//
// Pulls rows from a separate scanner database (ebright_hrfs_scanner2) into the
// main ebright_hrfs database that the backend reads from. Runs every
// ST_SYNC_INTERVAL_MS (default 30s). Disabled if ST_SYNC_SOURCE_DATABASE_URL
// is unset.
//
// Conflict handling intentionally deviates from a literal "DO NOTHING":
//   • AttendanceLog rows are UPDATED IN PLACE at the source when a clock-out
//     is registered (same (date, empNo) row gets its clockOutTime filled in).
//     Using DO NOTHING would mean clock-outs arriving after an initial sync
//     never reach the target — the dashboard would show permanent nulls.
//     Instead we UPSERT on the (date, empNo) unique key, copying through
//     clock-out columns and updatedAt.
//   • BranchStaff is insert-only in practice — we preserve source id and
//     DO NOTHING on id conflict.

const { Pool } = require('pg');
const { pool: targetPool } = require('../db');
const { env } = require('../env');

let sourcePool = null;
let intervalHandle = null;
let running = false; // re-entry guard — skip a tick if the previous one is still working

function log(msg, extra) {
  // eslint-disable-next-line no-console
  if (extra !== undefined) console.log(`[stSync] ${msg}`, extra);
  else console.log(`[stSync] ${msg}`);
}

function logErr(msg, err) {
  // eslint-disable-next-line no-console
  console.error(`[stSync] ${msg}:`, err.message || err);
}

// ------------------------------------------------------------
// AttendanceLog → AttendanceLogST
// ------------------------------------------------------------
async function syncAttendance() {
  // Watermark = max updatedAt already in target. Cast both sides to the same
  // type so the comparison is well-defined (source is `timestamp`, target is
  // `timestamptz`). Comparing timestamp > timestamptz works but emits a notice;
  // we cast source-side explicitly.
  const wm = await targetPool.query(
    `SELECT COALESCE(MAX("updatedAt"), '1970-01-01'::timestamptz) AS wm FROM public."AttendanceLogST"`
  );
  const watermark = wm.rows[0].wm;

  // Diagnostic snapshot of the source table — helps distinguish "vendor isn't
  // writing during outages" from "we are writing but our sync misses them".
  // Per-serial breakdown lets us see BMF vs AMF activity independently.
  const srcStats = await sourcePool.query(
    `SELECT COUNT(*)::int                                          AS total_rows,
            COUNT(*) FILTER (WHERE "updatedAt"::timestamptz > $1)::int AS new_since_watermark,
            COUNT(*) FILTER (WHERE "createdAt"::timestamptz > NOW() - INTERVAL '24 hours')::int AS created_last_24h,
            MAX("updatedAt")::text                                 AS source_max_updated,
            MAX("createdAt")::text                                 AS source_max_created
     FROM public."AttendanceLog"`,
    [watermark]
  );
  const stats = srcStats.rows[0];
  log(`watermark=${watermark.toISOString ? watermark.toISOString() : watermark} ` +
      `source: total=${stats.total_rows} new>wm=${stats.new_since_watermark} ` +
      `created_24h=${stats.created_last_24h} ` +
      `src_max_updated=${stats.source_max_updated} src_max_created=${stats.source_max_created}`);

  // Per-scanner activity in the last 24h (clock-in serial only — clock-outs
  // share the same physical device pair, this is enough to see if a scanner
  // has gone silent). NULL serial bucket catches anything malformed.
  const bySerial = await sourcePool.query(
    `SELECT COALESCE("clockInSerialNo", '(null)') AS serial,
            COUNT(*)::int                          AS rows_24h,
            MAX("createdAt")::text                 AS last_seen
     FROM public."AttendanceLog"
     WHERE "createdAt"::timestamptz > NOW() - INTERVAL '24 hours'
     GROUP BY 1
     ORDER BY rows_24h DESC`
  );
  if (bySerial.rows.length === 0) {
    log('source: no rows in last 24h from any scanner');
  } else {
    for (const r of bySerial.rows) {
      log(`source by-serial 24h: serial=${r.serial} rows=${r.rows_24h} last=${r.last_seen}`);
    }
  }

  const src = await sourcePool.query(
    `SELECT id, "date", "empNo", "empName",
            "clockInTime", "clockInSerialNo", "clockInEmailSent",
            "clockOutTime", "clockOutSerialNo", "clockOutEmailSent",
            "createdAt", "updatedAt"
     FROM public."AttendanceLog"
     WHERE "updatedAt"::timestamptz > $1
     ORDER BY "updatedAt" ASC
     LIMIT 500`,
    [watermark]
  );

  if (src.rows.length === 0) return { inserted: 0, updated: 0, skipped: 0, scanned: 0, bySerial: {} };

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const bySerialPulled = {};

  for (const r of src.rows) {
    const k = r.clockInSerialNo || '(null)';
    bySerialPulled[k] = (bySerialPulled[k] || 0) + 1;
    // The DO UPDATE has a WHERE clause that compares the content columns the
    // scanner can legitimately change — clock-out fields + empName. If none
    // differ, Postgres skips the write entirely and RETURNING yields 0 rows.
    // `IS DISTINCT FROM` treats NULL as a value, so NULL→value and
    // value→NULL both count as a real change.
    //
    // RETURNING shape:
    //   rows.length === 0  → conflict + nothing-changed → skipped (no write)
    //   rows[0].was_inserted=true  → INSERT
    //   rows[0].was_inserted=false → UPDATE
    const result = await targetPool.query(
      `INSERT INTO public."AttendanceLogST"
         ("date", "empNo", "empName",
          "clockInTime", "clockInSerialNo", "clockInEmailSent",
          "clockOutTime", "clockOutSerialNo", "clockOutEmailSent",
          "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::timestamptz,$11::timestamptz)
       ON CONFLICT ("date", "empNo") DO UPDATE SET
         "clockOutTime"      = EXCLUDED."clockOutTime",
         "clockOutSerialNo"  = EXCLUDED."clockOutSerialNo",
         "clockOutEmailSent" = EXCLUDED."clockOutEmailSent",
         "empName"           = EXCLUDED."empName",
         "updatedAt"         = EXCLUDED."updatedAt"
       WHERE "AttendanceLogST"."clockOutTime"      IS DISTINCT FROM EXCLUDED."clockOutTime"
          OR "AttendanceLogST"."clockOutSerialNo"  IS DISTINCT FROM EXCLUDED."clockOutSerialNo"
          OR "AttendanceLogST"."clockOutEmailSent" IS DISTINCT FROM EXCLUDED."clockOutEmailSent"
          OR "AttendanceLogST"."empName"           IS DISTINCT FROM EXCLUDED."empName"
       RETURNING (xmax = 0) AS was_inserted`,
      [
        r.date, r.empNo, r.empName,
        r.clockInTime, r.clockInSerialNo, r.clockInEmailSent,
        r.clockOutTime, r.clockOutSerialNo, r.clockOutEmailSent,
        r.createdAt, r.updatedAt,
      ]
    );
    if (result.rows.length === 0) skipped++;
    else if (result.rows[0].was_inserted) inserted++;
    else updated++;
  }

  return { inserted, updated, skipped, scanned: src.rows.length, bySerial: bySerialPulled };
}

// Staff sync intentionally removed.
//
// Reason: the 9 ST staff are now manually maintained in BranchStaff
// rows 306–314 with HR-issued employeeIds that intentionally diverge
// from scanner2.BranchStaff. Re-enabling this sync would silently
// reintroduce duplicate scanner-format rows and undo the manual fix.
// New ST staff additions go through HR onboarding into BranchStaff
// directly, not via the scanner DB.

// ------------------------------------------------------------
// Tick
// ------------------------------------------------------------
async function runOnce() {
  if (running) {
    log('previous run still in progress — skipping tick');
    return;
  }
  running = true;
  const t0 = Date.now();
  try {
    let att = { inserted: 0, updated: 0, skipped: 0, scanned: 0, bySerial: {} };
    try {
      att = await syncAttendance();
    } catch (e) { logErr('attendance sync failed', e); }

    const ms = Date.now() - t0;
    const serialBreakdown = Object.keys(att.bySerial || {}).length
      ? ' pulled-by-serial=' + Object.entries(att.bySerial).map(([k, v]) => `${k}:${v}`).join(',')
      : '';
    if (att.inserted || att.updated) {
      log(`tick ${ms}ms — attendance: scanned=${att.scanned} inserted=${att.inserted} updated=${att.updated} skipped=${att.skipped}${serialBreakdown}`);
    } else if (att.skipped) {
      log(`tick ${ms}ms — skipped=${att.skipped} (heartbeat-only, no writes)${serialBreakdown}`);
    } else {
      log(`tick ${ms}ms — no changes`);
    }
  } finally {
    running = false;
  }
}

// ------------------------------------------------------------
// Public API
// ------------------------------------------------------------
function startStSync() {
  if (!env.ST_SYNC_SOURCE_DATABASE_URL) {
    log('ST_SYNC_SOURCE_DATABASE_URL not set — sync service disabled');
    return { stop: () => {} };
  }

  sourcePool = new Pool({
    connectionString: env.ST_SYNC_SOURCE_DATABASE_URL,
    max: 4,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    application_name: 'ebright-dashboard-stsync',
  });
  sourcePool.on('error', (err) => logErr('source pool idle error', err));

  log(`starting — interval=${env.ST_SYNC_INTERVAL_MS}ms`);

  // Fire the first run immediately so we see results at startup.
  runOnce().catch((e) => logErr('initial run failed', e));
  intervalHandle = setInterval(() => {
    runOnce().catch((e) => logErr('scheduled run failed', e));
  }, env.ST_SYNC_INTERVAL_MS);
  // Don't let the sync keep the event loop alive after everything else exits.
  if (intervalHandle.unref) intervalHandle.unref();

  return {
    stop: async () => {
      if (intervalHandle) clearInterval(intervalHandle);
      intervalHandle = null;
      if (sourcePool) await sourcePool.end().catch(() => {});
      sourcePool = null;
      log('stopped');
    },
  };
}

module.exports = { startStSync };
