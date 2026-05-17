// Daily 00:05 Asia/Kuala_Lumpur — recompute age_group for every row.
// Required because age_group depends on current date (e.g. when a student
// turns 13 they roll from MIDDLER to SENIOR overnight).
const cron = require('node-cron');
const { pool } = require('../db');

const TABLES = [
  { name: 'studentrecords',             dobCol: 'dob' },
  { name: 'studentrecords_testing',     dobCol: 'dob' },
  { name: 'archived_students',          dobCol: 'date_of_birth' },
  { name: 'archived_students_testing',  dobCol: 'date_of_birth' },
];

async function refreshAgeGroups() {
  const start = Date.now();
  console.log('[age-group-refresh] starting at', new Date().toISOString());
  let totalUpdated = 0;

  for (const { name, dobCol } of TABLES) {
    try {
      const r = await pool.query(
        `UPDATE ${name} SET age_group = CASE
            WHEN ${dobCol} IS NULL THEN NULL
            WHEN date_part('year', age(${dobCol}))::int BETWEEN 4  AND 9  THEN 'JUNIOR'
            WHEN date_part('year', age(${dobCol}))::int BETWEEN 10 AND 12 THEN 'MIDDLER'
            WHEN date_part('year', age(${dobCol}))::int BETWEEN 13 AND 20 THEN 'SENIOR'
            ELSE NULL
          END
          WHERE age_group IS DISTINCT FROM CASE
            WHEN ${dobCol} IS NULL THEN NULL
            WHEN date_part('year', age(${dobCol}))::int BETWEEN 4  AND 9  THEN 'JUNIOR'
            WHEN date_part('year', age(${dobCol}))::int BETWEEN 10 AND 12 THEN 'MIDDLER'
            WHEN date_part('year', age(${dobCol}))::int BETWEEN 13 AND 20 THEN 'SENIOR'
            ELSE NULL
          END`
      );
      totalUpdated += r.rowCount;
      console.log(`[age-group-refresh] ${name}: ${r.rowCount} row(s) updated`);
    } catch (err) {
      console.error(`[age-group-refresh] ${name} FAILED:`, err.message);
    }
  }

  console.log(`[age-group-refresh] done — ${totalUpdated} total updates in ${Date.now() - start}ms`);
}

function startAgeGroupRefreshJob() {
  // 00:05 every day, Asia/Kuala_Lumpur — just after midnight so birthdays are caught immediately.
  cron.schedule('5 0 * * *', refreshAgeGroups, {
    timezone: 'Asia/Kuala_Lumpur',
  });
  console.log('[age-group-refresh] scheduled for 00:05 Asia/Kuala_Lumpur');
}

module.exports = { startAgeGroupRefreshJob, refreshAgeGroups };
