#!/usr/bin/env node
// Standalone runner for amfSync. Default mode is --dry-run (no DB writes,
// just print what would happen). Pass --commit to actually write.
//
// Usage:
//   node scripts/amf-sync-test.js --dry-run     # default
//   node scripts/amf-sync-test.js --commit
//
// Reads AMF_* and DATABASE_URL from .env, same as the running backend.

require('dotenv').config();
const { runAmfSync } = require('../src/services/amfSync');
const { pool } = require('../src/db');

const dryRun = !process.argv.includes('--commit');

(async () => {
  const result = await runAmfSync({ dryRun });
  // eslint-disable-next-line no-console
  console.log('\nresult:', JSON.stringify(result, null, 2));
  await pool.end().catch(() => {});
  process.exit(result && result.error ? 1 : 0);
})().catch(e => {
  // eslint-disable-next-line no-console
  console.error('fatal:', e);
  process.exit(1);
});
