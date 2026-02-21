const fs = require('fs');
require('dotenv').config();
const { pool } = require('./src/db');
pool.query("SELECT * FROM master_leads_powerbi LIMIT 1")
    .then(res => {
        fs.writeFileSync('cols.json', JSON.stringify(Object.keys(res.rows[0] || {})));
    })
    .catch(console.error)
    .finally(() => process.exit(0));
