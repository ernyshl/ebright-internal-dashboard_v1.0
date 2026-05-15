require('dotenv').config();
const { Pool } = require('pg');

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    // Show all 5 testing students with their dob + age_group
    const r = await pool.query(
      `SELECT id, name, dob, age_group, date_part('year', age(dob))::int AS computed_age
         FROM studentrecords_testing
        ORDER BY name`
    );
    console.log('studentrecords_testing rows:');
    console.table(r.rows);

    // Same for prod table
    const r2 = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(dob)::int AS with_dob,
              COUNT(age_group)::int AS with_age_group
         FROM studentrecords`
    );
    console.log('\nstudentrecords prod summary:', r2.rows[0]);
  } catch (err) {
    console.error('Failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
