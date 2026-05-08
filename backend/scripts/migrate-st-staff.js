#!/usr/bin/env node
/**
 * migrate-st-staff.js
 *
 * Two-step migration for collapsing public."BranchStaffST" into public."BranchStaff".
 *
 * USAGE
 *   node scripts/migrate-st-staff.js backfill            # dry-run (default)
 *   node scripts/migrate-st-staff.js backfill --apply    # commit
 *   node scripts/migrate-st-staff.js drop                # dry-run (default)
 *   node scripts/migrate-st-staff.js drop --apply        # commit
 *
 * STEP 1 — `backfill`
 *   Copies rows from public."BranchStaffST" into public."BranchStaff"
 *   keyed on employeeId. Safe to run multiple times (idempotent — uses an
 *   EXISTS-check, not ON CONFLICT, because BranchStaff has a known
 *   duplicate employeeId '330900253' that prevents a unique constraint).
 *   Does NOT drop BranchStaffST. Does NOT change the sync service.
 *   Run this AFTER deploying the updated stSync.js that targets BranchStaff.
 *   (Step ordering rationale: backfill is forward-compatible — old code can
 *   still read BranchStaffST. Once new code is live, run `drop`.)
 *
 * STEP 2 — `drop`
 *   Drops public."BranchStaffST" entirely. Run this AFTER step 1 has been
 *   applied AND the new sync code is live for at least one sync cycle.
 *   Refuses to run if BranchStaffST has rows that aren't yet in BranchStaff
 *   (would lose data).
 *
 * Both steps run inside a single transaction with full ROLLBACK on error.
 * Pre-flight checks run before any write.
 */

require('dotenv').config();
const { Pool } = require('pg');

const cmd = process.argv[2];
const apply = process.argv.includes('--apply');
const isDry = !apply;

if (!['backfill', 'drop'].includes(cmd)) {
  console.error('Usage: node scripts/migrate-st-staff.js <backfill|drop> [--apply]');
  process.exit(2);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function log(msg) { console.log(`[migrate-st-staff] ${msg}`); }
function banner(msg) { console.log(`\n=== ${msg} ===`); }

(async () => {
  const client = await pool.connect();
  try {
    banner(`mode: ${isDry ? 'DRY-RUN (no changes)' : 'APPLY (committing)'} — step: ${cmd}`);

    await client.query('BEGIN');

    if (cmd === 'backfill') {
      await runBackfill(client);
    } else if (cmd === 'drop') {
      await runDrop(client);
    }

    if (isDry) {
      await client.query('ROLLBACK');
      log('dry-run complete — all changes ROLLED BACK. Re-run with --apply to commit.');
    } else {
      await client.query('COMMIT');
      log('changes COMMITTED.');
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\n[migrate-st-staff] FAILED — transaction rolled back.');
    console.error(err.message || err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();

// -----------------------------------------------------------------------------
// STEP 1 — backfill
// -----------------------------------------------------------------------------
async function runBackfill(client) {
  banner('pre-flight — counts');
  const counts = (await client.query(`
    SELECT
      (SELECT COUNT(*)::int FROM public."BranchStaff")   AS branchstaff_before,
      (SELECT COUNT(*)::int FROM public."BranchStaffST") AS branchstaffst_total
  `)).rows[0];
  console.table([counts]);

  banner('pre-flight — collisions (BranchStaffST.employeeId already in BranchStaff)');
  const collisions = (await client.query(`
    SELECT bs2.id AS bss_id, bs2."employeeId", bs2.name AS bss_name, bs2.branch AS bss_branch,
           bs.id AS bs_id, bs.name AS bs_name, bs.branch AS bs_branch
    FROM public."BranchStaffST" bs2
    INNER JOIN public."BranchStaff" bs ON bs."employeeId" = bs2."employeeId"
  `)).rows;
  if (collisions.length > 0) {
    console.table(collisions);
    log(`${collisions.length} collision(s) — these BranchStaffST rows will be SKIPPED (assumed already migrated).`);
  } else {
    log('no collisions ✅');
  }

  banner('plan — rows that will be INSERTED');
  const planned = (await client.query(`
    SELECT bs2.id AS bss_id, bs2."employeeId", bs2.name, bs2.branch, bs2.email
    FROM public."BranchStaffST" bs2
    LEFT JOIN public."BranchStaff" bs ON bs."employeeId" = bs2."employeeId"
    WHERE bs."employeeId" IS NULL
    ORDER BY bs2.id
  `)).rows;
  console.table(planned);
  log(`would INSERT ${planned.length} row(s) into BranchStaff.`);

  if (planned.length === 0) {
    log('nothing to do.');
    return;
  }

  banner(`executing INSERTs ${isDry ? '(will be rolled back)' : ''}`);
  // Insert one row at a time so we can report exactly what happened, and
  // skip cleanly on the rare race where another writer added the same
  // employeeId between pre-flight and now.
  let inserted = 0;
  for (const r of planned) {
    const res = await client.query(
      `INSERT INTO public."BranchStaff" (name, branch, email, "employeeId", "createdAt", "updatedAt")
       SELECT $1, $2, $3, $4, NOW(), NOW()
       WHERE NOT EXISTS (SELECT 1 FROM public."BranchStaff" WHERE "employeeId" = $4)
       RETURNING id`,
      [r.name, r.branch, r.email, r.employeeId]
    );
    if (res.rowCount > 0) {
      inserted++;
      log(`  inserted: employeeId=${r.employeeId} name="${r.name}" -> new BranchStaff.id=${res.rows[0].id}`);
    } else {
      log(`  skipped:  employeeId=${r.employeeId} name="${r.name}" (race — already present)`);
    }
  }

  banner('post-flight — counts');
  const after = (await client.query(`
    SELECT
      (SELECT COUNT(*)::int FROM public."BranchStaff")                                                AS branchstaff_after,
      (SELECT COUNT(*)::int FROM public."BranchStaffST")                                              AS branchstaffst_total,
      (SELECT COUNT(*)::int FROM public."BranchStaffST" bs2
        WHERE NOT EXISTS (SELECT 1 FROM public."BranchStaff" bs WHERE bs."employeeId" = bs2."employeeId"))
                                                                                                     AS still_missing_in_branchstaff
  `)).rows[0];
  console.table([{ ...counts, ...after, inserted }]);
  if (after.still_missing_in_branchstaff !== 0) {
    throw new Error(`post-flight: ${after.still_missing_in_branchstaff} BranchStaffST row(s) still not in BranchStaff — aborting`);
  }
}

// -----------------------------------------------------------------------------
// STEP 2 — drop
// -----------------------------------------------------------------------------
async function runDrop(client) {
  banner('pre-flight — does BranchStaffST exist?');
  const exists = (await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name='BranchStaffST'
    ) AS yes
  `)).rows[0].yes;
  log(`exists: ${exists}`);
  if (!exists) {
    log('table already gone — nothing to do.');
    return;
  }

  banner('pre-flight — every BranchStaffST row must already exist in BranchStaff');
  const missing = (await client.query(`
    SELECT bs2.id, bs2."employeeId", bs2.name
    FROM public."BranchStaffST" bs2
    LEFT JOIN public."BranchStaff" bs ON bs."employeeId" = bs2."employeeId"
    WHERE bs."employeeId" IS NULL
    ORDER BY bs2.id
  `)).rows;
  if (missing.length > 0) {
    console.table(missing);
    throw new Error(`${missing.length} BranchStaffST row(s) not yet in BranchStaff — run "backfill --apply" first`);
  }
  log('all BranchStaffST rows already mirrored into BranchStaff ✅');

  banner('pre-flight — any FK constraints pointing AT BranchStaffST?');
  const fks = (await client.query(`
    SELECT conrelid::regclass AS from_table, conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE contype='f'
      AND confrelid = (SELECT oid FROM pg_class WHERE relname='BranchStaffST'
                                                  AND relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public'))
  `)).rows;
  if (fks.length > 0) {
    console.table(fks);
    throw new Error('foreign keys reference BranchStaffST — refusing to drop');
  }
  log('no FKs reference BranchStaffST ✅');

  banner(`executing DROP TABLE public."BranchStaffST" ${isDry ? '(will be rolled back)' : ''}`);
  await client.query(`DROP TABLE public."BranchStaffST"`);
  log('table dropped.');
}
