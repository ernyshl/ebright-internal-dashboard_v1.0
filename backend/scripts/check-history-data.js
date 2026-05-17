require('dotenv').config();
const { Pool } = require('pg');

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    // Column existence
    const cols = await pool.query(
      `SELECT column_name, data_type FROM information_schema.columns
        WHERE table_name = 'student_change_log' ORDER BY ordinal_position`
    );
    console.log('student_change_log columns:');
    cols.rows.forEach(r => console.log(`  - ${r.column_name} (${r.data_type})`));

    // Row counts by action
    const counts = await pool.query(
      `SELECT action, COUNT(*)::int AS n FROM student_change_log GROUP BY action ORDER BY n DESC`
    );
    console.log('\nRow counts by action:');
    console.table(counts.rows);

    // Latest 10 entries
    const recent = await pool.query(
      `SELECT id, student_name, branch, action, field,
              LEFT(COALESCE(old_value,''), 30) AS old_v,
              LEFT(COALESCE(new_value,''), 30) AS new_v,
              user_email,
              (changed_at AT TIME ZONE 'Asia/Kuala_Lumpur')::text AS when_my
         FROM student_change_log
         ORDER BY changed_at DESC LIMIT 10`
    );
    console.log('\nLatest 10 entries:');
    console.table(recent.rows);
  } catch (err) {
    console.error('Failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
