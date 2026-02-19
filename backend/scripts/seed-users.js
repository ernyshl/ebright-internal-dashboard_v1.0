const bcrypt = require('bcryptjs');
const { pool } = require('../src/db');
require('../src/env'); // loads/validates env

// Initial users to seed
const USERS = [
  { email: 'admin@ebright.com', name: 'Admin User', role: 'super_admin', password: 'Admin@2024!' },
  { email: 'ceo@ebright.com', name: 'CEO', role: 'ceo', password: 'Ceo@2024!' },
  { email: 'rm@ebright.com', name: 'Regional Manager', role: 'rm', password: 'Rm@2024!' },
  { email: 'marketing@ebright.com', name: 'Marketing Team', role: 'marketing', password: 'Marketing@2024!' },
  { email: 'od@ebright.com', name: 'OD Team', role: 'od', password: 'Od@2024!' },
  { email: 'hr@ebright.com', name: 'HR Team', role: 'hr', password: 'Hr@2024!' },
];

async function main() {
  console.log('Seeding users...\n');

  for (const user of USERS) {
    const passwordHash = await bcrypt.hash(user.password, 12);

    await pool.query(
      `
      insert into users (email, full_name, role, password_hash)
      values ($1, $2, $3, $4)
      on conflict (email) do update
        set full_name = excluded.full_name,
            role = excluded.role,
            password_hash = excluded.password_hash,
            is_active = true,
            updated_at = now()
      `,
      [user.email, user.name, user.role, passwordHash],
    );

    console.log(`✓ Created: ${user.email} (${user.role})`);
  }

  console.log('\nAll users seeded successfully!');
  console.log('\nDefault passwords:');
  USERS.forEach(u => console.log(`  ${u.email}: ${u.password}`));

  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});