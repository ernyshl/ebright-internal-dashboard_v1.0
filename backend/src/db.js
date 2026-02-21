const { Pool } = require('pg');
const { env } = require('./env');

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,                       // max connections in the pool
  idleTimeoutMillis: 30000,      // close idle clients after 30s
  connectionTimeoutMillis: 5000, // fail if a connection isn't available within 5s
});

pool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('Unexpected PostgreSQL idle client error', err);
});

module.exports = { pool };

