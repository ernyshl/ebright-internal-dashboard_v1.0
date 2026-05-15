require('dotenv').config();
const { Pool } = require('pg');

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    for (const t of ['studentrecords', 'studentrecords_testing', 'archived_students', 'archived_students_testing']) {
      const r = await pool.query(
        `SELECT column_name, data_type
           FROM information_schema.columns
          WHERE table_name = $1
            AND column_name IN ('dob', 'date_of_birth')`,
        [t]
      );
      const cols = r.rows.length
        ? r.rows.map(x => `${x.column_name} (${x.data_type})`).join(', ')
        : 'NOT FOUND';
      console.log(`${t.padEnd(28)} -> ${cols}`);
    }
  } catch (err) {
    console.error('Failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
