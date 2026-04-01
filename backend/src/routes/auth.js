const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const { pool } = require('../db');
const { env } = require('../env');
const { requireAuth } = require('../middleware/auth');
const { VALID_ROLES } = require('../constants');

const router = express.Router();

// Rate limiting store (in-memory)
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5; // Maximum 5 failed attempts per window
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes window
const LOCKOUT_DURATION = 30 * 60 * 1000; // 30 minute lockout after max attempts

function isRateLimited(email) {
  const now = Date.now();
  const record = loginAttempts.get(email);
  if (!record) return { blocked: false };

  // Check if account is locked
  if (record.lockedUntil && now < record.lockedUntil) {
    const waitTime = Math.ceil((record.lockedUntil - now) / 1000);
    return { blocked: true, waitTime };
  }

  // Reset if window has passed
  if (now > record.resetTime) {
    loginAttempts.delete(email);
    return { blocked: false };
  }

  return { blocked: false };
}

function recordLoginFailure(email) {
  const now = Date.now();
  const record = loginAttempts.get(email) || { count: 0, resetTime: now + WINDOW_MS, lockedUntil: 0 };

  // Reset if window has passed
  if (now > record.resetTime) {
    record.count = 0;
    record.resetTime = now + WINDOW_MS;
    record.lockedUntil = 0;
  }

  record.count++;

  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_DURATION;
  }

  loginAttempts.set(email, record);
}

function clearLoginAttempts(email) {
  loginAttempts.delete(email);
}

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

// Password complexity requirements
const PasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = LoginSchema.parse(req.body);

    // Check rate limit (passive check)
    const rateLimit = isRateLimited(email);
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
      recordLoginFailure(email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const ok = await bcrypt.compare(password, user.password_hash);

    if (!ok) {
      recordLoginFailure(email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Success! Clear any existing failure records
    clearLoginAttempts(email);

    const token = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        fullName: user.full_name,
        iat: Math.floor(Date.now() / 1000),
      },
      env.JWT_SECRET,
      {
        expiresIn: env.JWT_EXPIRES_IN,
        issuer: 'ebright-dashboard',
        audience: 'ebright-users'
      },
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

      // Prevent reuse of current password
      if (await bcrypt.compare(newPassword, userRows[0].password_hash)) {
        return res.status(400).json({
          error: 'Cannot reuse any of your last 5 passwords'
        });
      }

      // Prevent reuse of last 5 historical passwords
      const { rows: passwordHistory } = await pool.query(
        'SELECT password_hash FROM password_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5',
        [req.user.sub]
      );

      for (const oldHash of passwordHistory) {
        if (await bcrypt.compare(newPassword, oldHash.password_hash)) {
          return res.status(400).json({
            error: 'Cannot reuse any of your last 5 passwords'
          });
        }
      }

      // Validate new password strength
      const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
      if (!passwordRegex.test(newPassword)) {
        return res.status(400).json({
          error: 'Password must contain: uppercase, lowercase, number, and special character'
        });
      }

      // Store old password in history before updating
      await pool.query(
        'INSERT INTO password_history (user_id, password_hash) VALUES ($1, $2)',
        [req.user.sub, userRows[0].password_hash]
      );
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

