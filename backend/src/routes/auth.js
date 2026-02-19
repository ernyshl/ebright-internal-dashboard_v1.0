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
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

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
  'hr'
];

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/login', async (req, res, next) => {
  try {
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

module.exports = { authRouter: router };

