const { pool } = require('./src/db');
const bcrypt = require('bcryptjs');

async function testLogin() {
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', ['admin@company.com']);
    if (result.rows.length > 0) {
      const user = result.rows[0];
      console.log('User found:', user.email);
      console.log('Active:', user.is_active);
      console.log('Password hash exists:', !!user.password_hash);
      // Test password
      const valid = await bcrypt.compare('admin123', user.password_hash);
      console.log('Password valid:', valid);
    }
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

testLogin();