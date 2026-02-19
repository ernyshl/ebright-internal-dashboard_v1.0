const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Valid roles
const VALID_ROLES = ['super_admin', 'ceo', 'rm', 'marketing', 'od', 'hr'];

// Strong password validation regex
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

// GET /api/users — list all users (super_admin only)
router.get('/', requireAuth, requireRole(['super_admin']), async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, email, full_name, role, is_active, created_at, updated_at
       FROM users
       ORDER BY created_at DESC`
    );
    return res.json({ users: rows });
  } catch (err) {
    return next(err);
  }
});

const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters').regex(
    passwordRegex,
    'Password must contain: uppercase, lowercase, number, and special character'
  ),
  fullName: z.string().min(1, 'Name is required'),
  role: z.enum(VALID_ROLES),
});

// POST /api/users — create a new user (super_admin only)
router.post('/', requireAuth, requireRole(['super_admin']), async (req, res, next) => {
  try {
    const { email, password, fullName, role } = CreateUserSchema.parse(req.body);

    // Check if email already exists
    const existing = await pool.query('SELECT id FROM users WHERE lower(email) = lower($1)', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }

    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      `INSERT INTO users (email, full_name, role, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, full_name, role, is_active, created_at`,
      [email, fullName, role, hash]
    );

    return res.status(201).json({ user: rows[0] });
  } catch (err) {
    return next(err);
  }
});

// PATCH /api/users/:id/toggle — toggle active/inactive (super_admin only)
router.patch('/:id/toggle', requireAuth, requireRole(['super_admin']), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE users SET is_active = NOT is_active, updated_at = now()
       WHERE id = $1
       RETURNING id, email, full_name, role, is_active`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({ user: rows[0] });
  } catch (err) {
    return next(err);
  }
});

// PUT /api/users/:id — update user details (super_admin only)
const UpdateUserSchema = z.object({
  email: z.string().email().optional(),
  fullName: z.string().min(1, 'Name cannot be empty').optional(),
  role: z.enum(VALID_ROLES).optional(),
  password: z.string().optional(),
}).refine((data) => {
  // If password is provided, it must be at least 6 characters
  if (data.password && data.password.length < 6) {
    return false;
  }
  return true;
}, {
  message: 'Password must be at least 6 characters',
  path: ['password'],
});

router.put('/:id', requireAuth, requireRole(['super_admin']), async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = UpdateUserSchema.parse(req.body);

    // Check if user exists
    const existing = await pool.query('SELECT id, email FROM users WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Build dynamic update query
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (data.email) {
      // Check if email is already taken by another user
      const emailCheck = await pool.query(
        'SELECT id FROM users WHERE lower(email) = lower($1) AND id != $2',
        [data.email, id]
      );
      if (emailCheck.rows.length > 0) {
        return res.status(409).json({ error: 'A user with this email already exists' });
      }
      updates.push(`email = $${paramIndex++}`);
      values.push(data.email);
    }

    if (data.fullName) {
      updates.push(`full_name = $${paramIndex++}`);
      values.push(data.fullName);
    }

    if (data.role) {
      updates.push(`role = $${paramIndex++}`);
      values.push(data.role);
    }

    if (data.password) {
      const hash = await bcrypt.hash(data.password, 12);
      updates.push(`password_hash = $${paramIndex++}`);
      values.push(hash);
    }

    if (updates.length === 0) {
      return res.json({ message: 'No changes to update' });
    }

    updates.push('updated_at = now()');
    values.push(id);

    const { rows } = await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING id, email, full_name, role, is_active`,
      values
    );

    return res.json({ user: rows[0] });
  } catch (err) {
    return next(err);
  }
});

module.exports = { usersRouter: router };
