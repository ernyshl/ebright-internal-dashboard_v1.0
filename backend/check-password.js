const { pool } = require('./src/db');
const bcrypt = require('bcryptjs');

async function checkPassword() {
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', ['admin@company.com']);
    if (result.rows.length === 0) {
      console.log('User not found');
      process.exit(1);
    }
    const user = result.rows[0];
    console.log('User:', user.email);
    console.log('Hash in DB:', user.password_hash);
    
    // Test with admin123
    const match = await bcrypt.compare('admin123', user.password_hash);
    console.log('Password "admin123" matches:', match);
    
    // Try other common passwords
    const passwords = ['password', 'admin', '123456', 'admin@123'];
    for (const pwd of passwords) {
      const m = await bcrypt.compare(pwd, user.password_hash);
      if (m) console.log('Password is:', pwd);
    }
    
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

checkPassword();
