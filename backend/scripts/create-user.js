const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { pool } = require('../src/db');
const { VALID_ROLES } = require('../src/constants');
require('../src/env'); // loads/validates env

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const value = argv[i + 1];
    out[key] = value;
    i += 1;
  }
  return out;
}

// Strong password validation regex
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

const ArgsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).regex(
    passwordRegex,
    'Password must contain: uppercase, lowercase, number, and special character'
  ),
  role: z.string().refine(val => VALID_ROLES.includes(val), {
    message: `Role must be one of: ${VALID_ROLES.join(', ')}`,
  }),
  name: z.string().optional(),
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const parsed = ArgsSchema.safeParse(args);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('Usage: npm run create-user -- --email you@company.com --password "..." --role <role> --name "Full Name"');
    // eslint-disable-next-line no-console
    console.error('Valid roles:', VALID_ROLES.join(', '));
    // eslint-disable-next-line no-console
    console.error(parsed.error.issues);
    process.exit(1);
  }

  const { email, password, role, name } = parsed.data;

  const passwordHash = await bcrypt.hash(password, 12);

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
    [email, name || null, role, passwordHash],
  );

  // eslint-disable-next-line no-console
  console.log(`User upserted: ${email} (${role})`);
  await pool.end();
}

main().catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  try {
    await pool.end();
  } catch {
    // ignore
  }
  process.exit(1);
});

