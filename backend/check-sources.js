const { pool } = require('./src/db');
pool.query("SELECT DISTINCT TRIM(lead_source) as lead_source, COUNT(*) as total FROM master_leads_powerbi GROUP BY lead_source ORDER BY total DESC")
  .then(r => { console.log(JSON.stringify(r.rows, null, 2)); process.exit(0); })
  .catch(e => { console.error(e.message); process.exit(1); });
