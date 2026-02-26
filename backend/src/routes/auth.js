const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const { pool } = require('../db');
const { env } = require('../env');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Rate limiting store (in-memory)
const loginAttempts = new Map();
const MAX_ATTEMPTS = 1000; // Increased to 1000 attempts per window
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes window

function checkRateLimit(email) {
  const now = Date.now();
  const record = loginAttempts.get(email) || { count: 0, resetTime: now + WINDOW_MS };

  if (now > record.resetTime) {
    record.count = 0;
    record.resetTime = now + WINDOW_MS;
  }

  record.count++;
  loginAttempts.set(email, record);

  if (record.count > MAX_ATTEMPTS) {
    const waitTime = Math.ceil((record.resetTime - now) / 1000);
    return { blocked: true, waitTime };
  }

  return { blocked: false, remaining: MAX_ATTEMPTS - record.count };
}

// Valid roles for the company
const VALID_ROLES = [
  'super_admin',
  'ceo',
  'rm',
  'marketing',
  'od',
  'hr',
  'academy',
  'finance'
];

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/login', async (req, res, next) => {
  try {
    console.log('Login request body:', JSON.stringify(req.body));
    console.log('Login request headers:', JSON.stringify(req.headers));
    const { email, password } = LoginSchema.parse(req.body);

    // Check rate limit
    const rateLimit = checkRateLimit(email);
    if (rateLimit.blocked) {
      return res.status(429).json({
        error: 'Too many login attempts. Please try again later.',
        waitTime: rateLimit.waitTime
      });
    }

    const { rows } = await pool.query(
      `
      select id, email, full_name, role, password_hash, is_active
      from users
      where lower(email) = lower($1)
      limit 1
      `,
      [email],
    );

    const user = rows[0];
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        fullName: user.full_name,
      },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN },
    );

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
      },
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/me', requireAuth, async (req, res) => {
  return res.json({ user: req.user });
});

// GET /api/auth/profile — get current user's profile
router.get('/profile', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, email, full_name, role FROM users WHERE id = $1',
      [req.user.sub]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.json({
      user: {
        id: rows[0].id,
        email: rows[0].email,
        fullName: rows[0].full_name,
        role: rows[0].role,
      },
    });
  } catch (err) {
    return next(err);
  }
});

const UpdateProfileSchema = z.object({
  fullName: z.string().min(1, 'Name is required'),
  currentPassword: z.string().optional(),
  newPassword: z.string().optional(),
});

// PUT /api/auth/profile — update current user's profile
router.put('/profile', requireAuth, async (req, res, next) => {
  try {
    const { fullName, currentPassword, newPassword } = UpdateProfileSchema.parse(req.body);

    // Get current user
    const { rows: userRows } = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.user.sub]
    );
    if (userRows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // If changing password, verify current password
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Current password required' });
      }

      const isPasswordValid = await bcrypt.compare(currentPassword, userRows[0].password_hash);
      if (!isPasswordValid) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      // Validate new password strength
      const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
      if (!passwordRegex.test(newPassword)) {
        return res.status(400).json({
          error: 'Password must contain: uppercase, lowercase, number, and special character'
        });
      }
    }

    // Update user
    if (newPassword) {
      const hash = await bcrypt.hash(newPassword, 12);
      await pool.query(
        'UPDATE users SET full_name = $1, password_hash = $2, updated_at = now() WHERE id = $3',
        [fullName, hash, req.user.sub]
      );
    } else {
      await pool.query(
        'UPDATE users SET full_name = $1, updated_at = now() WHERE id = $2',
        [fullName, req.user.sub]
      );
    }

    // Get updated user
    const { rows: updatedRows } = await pool.query(
      'SELECT id, email, full_name, role FROM users WHERE id = $1',
      [req.user.sub]
    );

    return res.json({
      message: 'Profile updated successfully',
      user: {
        id: updatedRows[0].id,
        email: updatedRows[0].email,
        fullName: updatedRows[0].full_name,
        role: updatedRows[0].role,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: err.errors });
    }
    return next(err);
  }
});

module.exports = { authRouter: router };

