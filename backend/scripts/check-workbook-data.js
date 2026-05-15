require('dotenv').config();
const { Pool } = require('pg');

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    // Column existence on all 4 tables
    for (const t of ['studentrecords','studentrecords_testing','archived_students','archived_students_testing']) {
      const r = await pool.query(
        `SELECT column_name, data_type FROM information_schema.columns
          WHERE table_name = $1 AND column_name IN ('workbook_progress_json','total_workbook')
          ORDER BY column_name`,
        [t]
      );
      console.log(`${t.padEnd(28)} -> ${r.rows.map(x => `${x.column_name}(${x.data_type})`).join(', ') || 'NOT FOUND'}`);
    }
    console.log('');

    // Sample data from testing table
    const r = await pool.query(
      `SELECT id, name, grade_chapter, workbook_progress_json, total_workbook
         FROM studentrecords_testing ORDER BY name`
    );
    console.log('Sample rows in studentrecords_testing:');
    console.table(r.rows);
  } catch (err) {
    console.error('Failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
