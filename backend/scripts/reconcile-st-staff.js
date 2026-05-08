#!/usr/bin/env node
/**
 * reconcile-st-staff.js
 *
 * One-shot reconciliation:
 *   • UPDATE 2 HR rows to scanner-format employeeIds
 *   • DELETE 10 duplicate sync-artifact rows
 *   • UPDATE AttendanceLogST.empNo to remap 9 old codes → new codes
 *
 * All inside one BEGIN…COMMIT.  --dry-run by default; pass --apply to commit.
 */

require('dotenv').config();
const { Pool } = require('pg');

const apply = process.argv.includes('--apply');
const isDry = !apply;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ID_REMAP = [
  ['02020002', '55020076', 'Qistina'],
  ['03020003', '66020085', 'Lee Ann'],
  ['04020004', '77020086', 'Anna'],
  ['04020005', '77020087', 'Haytham'],
  ['04020006', '77020088', 'Negeeta'],
  ['04020007', '77020089', 'Yahya'],
  ['04020008', '77020090', 'Alyssa'],
  ['04020009', '77020091', 'Mikkel'],
  ['01010001', '11010001', 'Kevin Khoo'],
];

const DELETE_IDS = [307, 324, 309, 310, 311, 312, 313, 314, 323, 325];

(async () => {
  const c = await pool.connect();
  const counts = {};
  try {
    console.log('mode:', isDry ? 'DRY-RUN' : 'APPLY');
    await c.query('BEGIN');

    // 1) UPDATE 2 HR rows to scanner-format employeeIds
    const u32 = await c.query(`UPDATE public."BranchStaff" SET "employeeId"='55020076', "updatedAt"=NOW() WHERE id=32 RETURNING id`);
    counts.update_qistina_id32 = u32.rowCount;
    const u218 = await c.query(`UPDATE public."BranchStaff" SET "employeeId"='77020087', "updatedAt"=NOW() WHERE id=218 RETURNING id`);
    counts.update_haytham_id218 = u218.rowCount;

    // 2) DELETE 10 duplicate rows
    const del = await c.query(
      `DELETE FROM public."BranchStaff" WHERE id = ANY($1::int[]) RETURNING id`,
      [DELETE_IDS]
    );
    counts.delete_duplicates = del.rowCount;
    counts.deleted_ids = del.rows.map(r => r.id).sort((a, b) => a - b);

    // 3) Heal morning scans: remap empNo old → new.
    // Naive UPDATE collides with UNIQUE(date, empNo) when both old and new
    // rows exist on the same date (e.g. today: morning row at empNo=02020002
    // + afternoon row at empNo=55020076 for Qistina). Strategy per pair:
    //   (a) find twin rows (same date, old empNo + new empNo both exist)
    //   (b) MERGE them into the new row: keep the earliest clockIn /
    //       earliest clockInSerialNo, the latest clockOut / latest
    //       clockOutSerialNo. Drop the old row.
    //   (c) UPDATE remaining old rows (no twin) to use new empNo.
    counts.heal_attendance = {};
    for (const [oldNo, newNo, label] of ID_REMAP) {
      const stats = { merged: 0, simple_update: 0 };

      const twins = await c.query(`
        SELECT a.id AS old_id,
               a."clockInTime"      AS old_in,
               a."clockInSerialNo"  AS old_in_serial,
               a."clockOutTime"     AS old_out,
               a."clockOutSerialNo" AS old_out_serial,
               b.id AS new_id,
               b."clockInTime"      AS new_in,
               b."clockOutTime"     AS new_out
        FROM public."AttendanceLogST" a
        JOIN public."AttendanceLogST" b ON b.date = a.date AND b."empNo" = $1
        WHERE a."empNo" = $2
      `, [newNo, oldNo]);

      for (const row of twins.rows) {
        // earliest clockIn wins
        const useOldIn = row.old_in && (!row.new_in || String(row.old_in) < String(row.new_in));
        // latest clockOut wins
        const useOldOut = row.old_out && (!row.new_out || String(row.old_out) > String(row.new_out));

        if (useOldIn || useOldOut) {
          await c.query(
            `UPDATE public."AttendanceLogST" SET
               "clockInTime"      = COALESCE($1, "clockInTime"),
               "clockInSerialNo"  = COALESCE($2, "clockInSerialNo"),
               "clockOutTime"     = COALESCE($3, "clockOutTime"),
               "clockOutSerialNo" = COALESCE($4, "clockOutSerialNo"),
               "updatedAt"        = NOW()
             WHERE id = $5`,
            [
              useOldIn  ? row.old_in        : null,
              useOldIn  ? row.old_in_serial : null,
              useOldOut ? row.old_out        : null,
              useOldOut ? row.old_out_serial : null,
              row.new_id,
            ]
          );
        }
        await c.query(`DELETE FROM public."AttendanceLogST" WHERE id=$1`, [row.old_id]);
        stats.merged++;
      }

      const u = await c.query(
        `UPDATE public."AttendanceLogST" SET "empNo"=$1, "updatedAt"=NOW() WHERE "empNo"=$2 RETURNING id`,
        [newNo, oldNo]
      );
      stats.simple_update = u.rowCount;

      counts.heal_attendance[`${oldNo}->${newNo} (${label})`] = stats;
    }

    // Pre-commit verification
    const stCount = await c.query(`SELECT COUNT(*)::int AS n FROM public."BranchStaff" WHERE branch='ST'`);
    counts.branchstaff_ST_after = stCount.rows[0].n;

    const stRows = await c.query(`SELECT id, name, "employeeId", role FROM public."BranchStaff" WHERE branch='ST' ORDER BY id`);
    counts.branchstaff_ST_rows = stRows.rows;

    if (isDry) {
      await c.query('ROLLBACK');
      console.log('\nDRY-RUN — rolled back. Run with --apply to commit.');
    } else {
      await c.query('COMMIT');
      console.log('\nCOMMITTED.');
    }

    console.log('\n=== summary ===');
    console.log(JSON.stringify(counts, null, 2));
  } catch (err) {
    await c.query('ROLLBACK').catch(()=>{});
    console.error('\nFAILED — rolled back.\n', err.message);
    process.exitCode = 1;
  } finally {
    c.release();
    await pool.end();
  }
})();
