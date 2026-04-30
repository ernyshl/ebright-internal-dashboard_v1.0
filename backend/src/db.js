const { Pool } = require('pg');
const { env } = require('./env');

// Main Leads Database Pool
const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// NEW: Inventory Database Pool
// Ensure you add INV_DATABASE_URL to your backend/.env file!
const invPool = new Pool({
  connectionString: env.INV_DATABASE_URL, 
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL Leads DB error', err);
});

invPool.on('error', (err) => {
  console.error('Unexpected PostgreSQL Inventory DB error', err);
});

// Export both pools
module.exports = { pool, invPool };