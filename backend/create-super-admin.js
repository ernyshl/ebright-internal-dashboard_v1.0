const { pool } = require('./src/db');
const bcrypt = require('bcryptjs');

async function createSuperAdmin() {
  try {
    const hash = await bcrypt.hash('admin123', 10);
    
    // Delete existing admin if exists
    await pool.query('DELETE FROM users WHERE email = $1', ['admin@company.com']);
    
    // Create new super admin
    const result = await pool.query(`
      INSERT INTO users (email, password_hash, full_name, role, is_active)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, email, full_name, role, is_active
    `, ['admin@company.com', hash, 'Super Admin', 'super_admin', true]);
    
    console.log('Super admin created:');
    console.log('Email:', result.rows[0].email);
    console.log('Password: admin123');
    console.log('Role:', result.rows[0].role);
    console.log('Active:', result.rows[0].is_active);
    
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

createSuperAdmin();