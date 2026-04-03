const jwt = require('jsonwebtoken');
const { env } = require('../env');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [type, token] = header.split(' ');

  if (type !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing Bearer token' });
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET, {
      issuer: 'ebright-dashboard',
      audience: 'ebright-users',
      algorithms: ['HS256'],
      complete: true,
    });
    
    // Additional security checks (TV tokens have no email — only sub + role required)
    if (!payload.payload.sub || !payload.payload.role) {
      return res.status(401).json({ error: 'Invalid token payload' });
    }
    
    req.user = payload.payload;
    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (allowed.length === 0) return next();
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return next();
  };
}

module.exports = { requireAuth, requireRole };

