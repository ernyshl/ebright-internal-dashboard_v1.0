const { pool } = require('./src/db');

async function resetPassword() {
  try {
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('admin123', 10);
    const result = await pool.query(
      'UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING email, role',
      [hash, 'admin@company.com']
    );
    console.log('Password reset for:', result.rows[0].email);
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

resetPassword();