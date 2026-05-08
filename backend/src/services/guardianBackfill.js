const { pool } = require('../db');
const { getTableNames } = require('../utils/tableNames');

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

async function backfillGuardianInfo(rows, branch) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('rows must be a non-empty array');
  }
  if (!branch || typeof branch !== 'string' || !branch.trim()) {
    throw new Error('branch is required');
  }

  const { students: studentsTbl } = getTableNames();

  const updatedNames = [];
  const alreadyFilledNames = [];
  const notFoundNames = [];
  let skipped = 0;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const row of rows) {
      const excelName = isBlank(row?.name) ? '' : String(row.name).trim();
      const excelGuardianName = isBlank(row?.guardianName) ? '' : String(row.guardianName).trim();
      const excelGuardianMobile = isBlank(row?.guardianMobile) ? '' : String(row.guardianMobile).trim();

      if (!excelName) { skipped++; continue; }
      if (!excelGuardianName && !excelGuardianMobile) { skipped++; continue; }

      const sel = await client.query(
        `SELECT id, guardian_name, guardian_mobile
           FROM ${studentsTbl}
          WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
            AND LOWER(TRIM(branch)) = LOWER(TRIM($2))
          LIMIT 1`,
        [excelName, branch]
      );

      if (sel.rows.length === 0) {
        notFoundNames.push(excelName);
        continue;
      }

      const dbRow = sel.rows[0];
      const needsName = isBlank(dbRow.guardian_name) && !!excelGuardianName;
      const needsMobile = isBlank(dbRow.guardian_mobile) && !!excelGuardianMobile;

      if (!needsName && !needsMobile) {
        alreadyFilledNames.push(excelName);
        continue;
      }

      if (needsName && needsMobile) {
        await client.query(
          `UPDATE ${studentsTbl} SET guardian_name = $1, guardian_mobile = $2 WHERE id = $3`,
          [excelGuardianName, excelGuardianMobile, dbRow.id]
        );
      } else if (needsName) {
        await client.query(
          `UPDATE ${studentsTbl} SET guardian_name = $1 WHERE id = $2`,
          [excelGuardianName, dbRow.id]
        );
      } else {
        await client.query(
          `UPDATE ${studentsTbl} SET guardian_mobile = $1 WHERE id = $2`,
          [excelGuardianMobile, dbRow.id]
        );
      }

      updatedNames.push(excelName);
    }

    await client.query('COMMIT');

    return {
      success: true,
      totalRows: rows.length,
      updated: updatedNames.length,
      alreadyFilled: alreadyFilledNames.length,
      notFound: notFoundNames.length,
      skipped,
      details: { updatedNames, alreadyFilledNames, notFoundNames },
    };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    const msg = err && err.message ? err.message : 'Guardian backfill failed';
    throw new Error(`Guardian backfill transaction rolled back: ${msg}`);
  } finally {
    client.release();
  }
}

module.exports = { backfillGuardianInfo };
