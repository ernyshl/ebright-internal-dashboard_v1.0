const { pool } = require('./src/db');

pool.query('SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position', ['master_leads_powerbi'])
  .then(r => console.log('Columns:', r.rows.map(c => c.column_name).join(', ')))
  .catch(e => console.log('Error:', e.message));
