require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.query('UPDATE users SET is_active = true WHERE email = $1', ['admin@company.com'])
  .then(() => {
    console.log('User activated!');
    return pool.end();
  })
  .catch((err) => {
    console.error(err.message);
    pool.end();
  });