const { Pool } = require('pg');
const { env } = require('./env');

// Main Leads Database Pool
const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,                        // max connections in the pool
  idleTimeoutMillis: 30000,       // close idle clients after 30s
  // 15s, not 5s: the remote DB (103.209.156.174:5433) needs TCP+TLS+PG
  // handshake on a cold connect, which routinely exceeded 5s after laptop
  // wake and crashed startup migrations. 15s comfortably covers that without
  // hiding a truly dead DB for too long.
  connectionTimeoutMillis: 15000,
});

// Inventory Database Pool
// Ensure you add INV_DATABASE_URL to your backend/.env file!
const invPool = new Pool({
  connectionString: env.INV_DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('Unexpected PostgreSQL Leads DB error', err);
});

invPool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('Unexpected PostgreSQL Inventory DB error', err);
});

// Secondary pool for ebrightleads_db — that's where the HR system of record
// lives (schemas hrfs / crm). When LEADS_DATABASE_URL is unset we derive the
// connection from DATABASE_URL by swapping the database name, so the typical
// dev setup (same Postgres server, same credentials) needs zero extra config.
function deriveLeadsUrl() {
  if (env.LEADS_DATABASE_URL) return env.LEADS_DATABASE_URL;
  const u = new URL(env.DATABASE_URL);
  u.pathname = '/ebrightleads_db';
  return u.toString();
}

const leadsPool = new Pool({
  connectionString: deriveLeadsUrl(),
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
});

leadsPool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('Unexpected leadsPool idle client error', err);
});

module.exports = { pool, invPool, leadsPool };
