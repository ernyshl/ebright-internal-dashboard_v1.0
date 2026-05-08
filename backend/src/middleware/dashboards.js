const { pool } = require('../db');
const { ROLE_DEFAULTS } = require('../lib/dashboardDefaults');

// Permission gate that mirrors the frontend <RequirePermission dashboard="X">
// component:
//   1. user_permissions row exists for (user, dashboard) → use its can_view flag
//   2. otherwise fall back to ROLE_DEFAULTS[user.role]
//
// Use this on routes whose audience is "users who can see card X on the
// home page" rather than "users with role Y" — the dashboard registry
// supports per-user custom grants, requireRole does not.
function requireDashboard(dashboardId) {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (req.user.role === 'super_admin') return next();

    try {
      const { rows } = await pool.query(
        'SELECT can_view FROM user_permissions WHERE user_id = $1 AND dashboard = $2',
        [req.user.sub, dashboardId]
      );
      if (rows.length) {
        return rows[0].can_view ? next() : res.status(403).json({ error: 'Forbidden' });
      }

      const defaults = ROLE_DEFAULTS[req.user.role] || [];
      return defaults.includes(dashboardId)
        ? next()
        : res.status(403).json({ error: 'Forbidden' });
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { requireDashboard };
