const { pool } = require('./src/db');

async function testLogin() {
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', ['admin@company.com']);
    console.log('User found:', result.rows.length > 0);
    if (result.rows.length > 0) {
      console.log('Email:', result.rows[0].email);
      console.log('Role:', result.rows[0].role);
      console.log('Active:', result.rows[0].is_active);
    } else {
      console.log('No user found with email: admin@company.com');
    }
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

testLogin();