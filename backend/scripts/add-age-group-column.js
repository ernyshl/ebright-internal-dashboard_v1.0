// One-shot migration: add age_group VARCHAR(10) to 4 tables and backfill from dob.
// Idempotent — safe to re-run.
require('dotenv').config();
const { Pool } = require('pg');

const TABLES = [
  'studentrecords',
  'studentrecords_testing',
  'archived_students',
  'archived_students_testing',
];

// Choose the DOB column per table — archived tables use date_of_birth historically,
// active tables use dob. (Active tables also have dob; we wrote it earlier.)
const dobColForTable = (t) => (t.startsWith('archived_') ? 'date_of_birth' : 'dob');

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    for (const t of TABLES) {
      await pool.query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS age_group VARCHAR(10)`);

      const dobCol = dobColForTable(t);
      // Backfill from current date — same buckets as the frontend:
      //   4–9 JUNIOR, 10–12 MIDDLER, 13–20 SENIOR, else NULL
      const upd = await pool.query(
        `UPDATE ${t} SET age_group = CASE
            WHEN ${dobCol} IS NULL THEN NULL
            WHEN date_part('year', age(${dobCol}))::int BETWEEN 4  AND 9  THEN 'JUNIOR'
            WHEN date_part('year', age(${dobCol}))::int BETWEEN 10 AND 12 THEN 'MIDDLER'
            WHEN date_part('year', age(${dobCol}))::int BETWEEN 13 AND 20 THEN 'SENIOR'
            ELSE NULL
          END`
      );

      const counts = await pool.query(
        `SELECT age_group, COUNT(*)::int AS n FROM ${t} GROUP BY age_group ORDER BY age_group NULLS LAST`
      );
      const breakdown = counts.rows.map(r => `${r.age_group ?? 'NULL'}=${r.n}`).join(', ');
      console.log(`  ${t.padEnd(28)} -> updated ${upd.rowCount.toString().padStart(5)} | ${breakdown}`);
    }
    console.log('Done.');
  } catch (err) {
    console.error('Failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
