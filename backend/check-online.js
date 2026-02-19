const { pool } = require('./src/db');
pool.query("SELECT lead_source, COUNT(*) as total FROM master_leads_powerbi WHERE LOWER(lead_source) LIKE '%online%' GROUP BY lead_source ORDER BY total DESC")
  .then(r => { console.log(r.rows); process.exit(0); })
  .catch(e => { console.error(e.message); process.exit(1); });
