const express = require('express');
const { z } = require('zod');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Available dashboards — one entry per CARD on the home page so admins can
// toggle visibility per card. Card IDs match DashboardHomePage's departmentData
// entries; the home page filters each card's links by `link.dashboard` against
// these keys.
const DASHBOARDS = [
  { id: 'operations_dept', name: 'Operations Department',           icon: '⚙️' },
  { id: 'academy',         name: 'Academy',                         icon: '🎓' },
  { id: 'fa_testing',      name: 'FA Dashboard Testing',            icon: '🧪' },
  { id: 'event_mkt',       name: 'Event MKT',                       icon: '🎪' },
  { id: 'finance',         name: 'Finance',                         icon: '💰' },
  { id: 'operations',      name: 'Optimisation',                    icon: '⚙️' },
  { id: 'marketing',       name: 'Marketing',                       icon: '📈' },
  { id: 'department',      name: 'Department',                      icon: '✅' },
  { id: 'hr',              name: 'HR',                              icon: '👥' },
  { id: 'hr_db',           name: 'HR Database',                     icon: '🗄️' },
  { id: 'hr_crud',         name: 'CRUD HR Data',                    icon: '📋' },
  { id: 'hr_testing',      name: 'HR Testing Data',                 icon: '🧪' },
  { id: 'student_db',      name: 'Student Database',                icon: '📚' },
  { id: 'admin',           name: 'Admin',                           icon: '🔧' },
  { id: 'testing',         name: 'Testing (dnft)',                  icon: '🧪' },
  { id: 'manjeet',         name: 'For Manjeet',                     icon: '🎯' },
  { id: 'rm_dashboard',    name: 'For Regional Manager',            icon: '📊' },
  { id: 'events',          name: 'Events',                          icon: '🎪' },
];

// Role-based default permissions — by card. Adjust here to grant new cards
// to existing roles without forcing a per-user custom override.
const ROLE_DEFAULTS = {
  super_admin: DASHBOARDS.map(d => d.id),
  ceo:         DASHBOARDS.map(d => d.id).filter(id => id !== 'admin'),
  rm:          ['operations_dept', 'operations', 'academy', 'rm_dashboard'],
  marketing:   ['marketing', 'academy', 'event_mkt'],
  od:          ['operations_dept', 'operations', 'academy'],
  hr:          ['department', 'hr', 'hr_db', 'hr_crud', 'hr_testing'],
  academy:     ['academy', 'fa_testing', 'events', 'event_mkt'],
  finance:     ['finance'],
};

// GET /api/permissions — get current user's permissions
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.sub;

    // Get user-specific permissions
    const { rows: customPerms } = await pool.query(
      'SELECT dashboard, can_view FROM user_permissions WHERE user_id = $1',
      [userId]
    );

    // Build permission object
    const permissions = {};
    DASHBOARDS.forEach(d => {
      permissions[d.id] = { allowed: true, custom: false };
    });

    // Apply custom permissions
    customPerms.forEach(perm => {
      permissions[perm.dashboard] = {
        allowed: perm.can_view,
        custom: true
      };
    });

    // Apply role defaults for dashboards not in custom permissions
    const role = req.user.role;
    const defaults = ROLE_DEFAULTS[role] || [];
    DASHBOARDS.forEach(d => {
      if (!permissions[d.id].custom) {
        permissions[d.id] = {
          allowed: defaults.includes(d.id),
          custom: false,
          fromRole: true
        };
      }
    });

    return res.json({ permissions, dashboards: DASHBOARDS });
  } catch (err) {
    return next(err);
  }
});

// GET /api/permissions/all — get all users' permissions (super_admin only)
router.get('/all', requireAuth, requireRole(['super_admin']), async (req, res, next) => {
  try {
    // Get all users with their custom permissions
    const { rows: users } = await pool.query(
      `SELECT id, email, full_name, role FROM users ORDER BY created_at DESC`
    );

    // Get all custom permissions
    const { rows: allPerms } = await pool.query(
      'SELECT user_id, dashboard, can_view FROM user_permissions'
    );

    // Build user permissions map
    const permMap = {};
    allPerms.forEach(p => {
      if (!permMap[p.user_id]) permMap[p.user_id] = {};
      permMap[p.user_id][p.dashboard] = p.can_view;
    });

    // Combine with role defaults
    const result = users.map(user => {
      const defaults = ROLE_DEFAULTS[user.role] || [];
      const custom = permMap[user.id] || {};

      const permissions = {};
      DASHBOARDS.forEach(d => {
        if (custom.hasOwnProperty(d.id)) {
          permissions[d.id] = { allowed: custom[d.id], custom: true };
        } else {
          permissions[d.id] = { allowed: defaults.includes(d.id), custom: false, fromRole: true };
        }
      });

      return {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        permissions
      };
    });

    return res.json({ users: result, dashboards: DASHBOARDS });
  } catch (err) {
    return next(err);
  }
});

// PUT /api/permissions/:userId — set user permissions (super_admin only)
const SetPermissionsSchema = z.object({
  dashboard: z.string(),
  allowed: z.boolean(),
});

router.put('/:userId', requireAuth, requireRole(['super_admin']), async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { dashboard, allowed } = SetPermissionsSchema.parse(req.body);

    // Check if user exists
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if dashboard is valid
    const validDashboards = DASHBOARDS.map(d => d.id);
    if (!validDashboards.includes(dashboard)) {
      return res.status(400).json({ error: 'Invalid dashboard' });
    }

    // Upsert permission
    await pool.query(
      `INSERT INTO user_permissions (user_id, dashboard, can_view)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, dashboard) DO UPDATE SET can_view = $3, updated_at = now()`,
      [userId, dashboard, allowed]
    );

    return res.json({ message: 'Permission updated successfully' });
  } catch (err) {
    return next(err);
  }
});

// DELETE /api/permissions/:userId/:dashboard — reset permission to role default (super_admin only)
router.delete('/:userId/:dashboard', requireAuth, requireRole(['super_admin']), async (req, res, next) => {
  try {
    const { userId, dashboard } = req.params;

    await pool.query(
      'DELETE FROM user_permissions WHERE user_id = $1 AND dashboard = $2',
      [userId, dashboard]
    );

    return res.json({ message: 'Permission reset to role default' });
  } catch (err) {
    return next(err);
  }
});

module.exports = { permissionsRouter: router, DASHBOARDS, ROLE_DEFAULTS };
