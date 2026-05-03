const { Pool } = require('pg');
const { env } = require('./env');

let _pool = null;

function getPool() {
  if (!_pool) {
    if (!env.ARCHIVED_STUDENTS_DB_URL) {
      throw new Error('ARCHIVED_STUDENTS_DB_URL is not set in .env');
    }
    _pool = new Pool({
      connectionString: env.ARCHIVED_STUDENTS_DB_URL,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    _pool.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error('Archived students DB error', err);
    });
  }
  return _pool;
}

module.exports = { getPool };
