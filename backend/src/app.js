const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { env } = require('./env');
const { authRouter } = require('./routes/auth');
const { marketingRouter } = require('./routes/marketing');
const { leadsRouter } = require('./routes/leads');
const { usersRouter } = require('./routes/users');
const { permissionsRouter } = require('./routes/permissions');
const { academyRouter } = require('./routes/academy');
const { eventsRouter } = require('./routes/events');
const { financeRouter } = require('./routes/finance');
const { leadsCentreRouter } = require('./routes/leadsCentre');
const { devicesRouter } = require('./routes/devices');
const { ghlStagesRouter } = require('./routes/ghlStages');
const { telegramBotRouter } = require('./routes/telegramBot');
const { hrStaffMovementsRouter } = require('./routes/hrStaffMovements');
const { hrMcRouter } = require('./routes/hrMc');
const { eventMktRouter } = require('./routes/eventMkt');
const { auditLogRouter, writeLog } = require('./routes/auditLog');
const { hrAttendanceRouter } = require('./routes/hrAttendance');
const { hrHiringRouter } = require('./routes/hrHiring');
const { hrAnnualLeaveRouter } = require('./routes/hrAnnualLeave');
const { faDashboardRouter } = require('./routes/faDashboard');
const { hrfsRouter } = require('./routes/hrfs');

const jwt = require('jsonwebtoken');

// Role-based rate limit configuration
const roleRateLimits = {
  super_admin: { windowMs: 15 * 60 * 1000, max: 1000 },
  ceo: { windowMs: 15 * 60 * 1000, max: 500 },
  executive: { windowMs: 15 * 60 * 1000, max: 300 },
  marketing: { windowMs: 15 * 60 * 1000, max: 200 },
  sales: { windowMs: 15 * 60 * 1000, max: 200 },
  od: { windowMs: 15 * 60 * 1000, max: 200 },
  finance: { windowMs: 15 * 60 * 1000, max: 200 },
  hr: { windowMs: 15 * 60 * 1000, max: 200 },
  tv: { windowMs: 15 * 60 * 1000, max: 500 },
  // Default for unknown roles
  default: { windowMs: 15 * 60 * 1000, max: 100 },
};

// Custom rate limiter that checks user role from JWT token
function createRoleBasedRateLimiter() {
  return (req, res, next) => {
    let userRole = 'default';

    // Try to extract role from JWT token
    try {
      const header = req.headers.authorization || '';
      const [type, token] = header.split(' ');

      if (type === 'Bearer' && token) {
        const payload = jwt.verify(token, env.JWT_SECRET);
        userRole = payload.role || 'default';
      }
    } catch {
      // If token is invalid/expired, use default limits
      userRole = 'default';
    }

    const config = roleRateLimits[userRole] || roleRateLimits.default;

    const limiter = rateLimit({
      windowMs: config.windowMs,
      max: config.max,
      message: { error: 'Too many requests, please try again later.' },
      standardHeaders: true,
      legacyHeaders: false,
    });

    limiter(req, res, next);
  };
}

function createApp() {
  const app = express();

  // Trust proxy for rate limiting behind Nginx
  app.set('trust proxy', 1);

  // Security headers with Helmet
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", env.CORS_ORIGIN],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));

  // Rate limiting configuration
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // limit each IP to 20 login attempts per windowMs
    message: { error: 'Too many login attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // CORS configuration - strict origin check
  const corsOptions = {
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true);

      // Allow localhost for development
      if (/^http:\/\/localhost:\d+$/.test(origin)) {
        return callback(null, true);
      }

      // In production, only allow the configured origin
      if (env.NODE_ENV === 'production' && origin === env.CORS_ORIGIN) {
        return callback(null, true);
      }

      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  };

  app.use(cors(corsOptions));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  app.get('/health', (_req, res) => res.json({ ok: true }));

  // Apply stricter rate limiting to auth routes (before auth)
  app.use('/api/auth', authLimiter, authRouter);

  // Create role-based rate limiter function
  const applyRoleBasedRateLimit = createRoleBasedRateLimiter();

  // Apply role-based rate limiting to protected routes (after auth middleware)
  app.use('/api/marketing', applyRoleBasedRateLimit, marketingRouter);
  app.use('/api/leads', applyRoleBasedRateLimit, leadsRouter);
  app.use('/api/users', applyRoleBasedRateLimit, usersRouter);
  app.use('/api/permissions', applyRoleBasedRateLimit, permissionsRouter);
  app.use('/api/academy', applyRoleBasedRateLimit, academyRouter);
  app.use('/api/events', applyRoleBasedRateLimit, eventsRouter);
  app.use('/api/finance', applyRoleBasedRateLimit, financeRouter);
  app.use('/api/leads-centre', applyRoleBasedRateLimit, leadsCentreRouter);
  app.use('/api/devices', applyRoleBasedRateLimit, devicesRouter);
  // GHL webhook — public endpoint (no auth, secret via query param)
  app.use('/api/ghl-stages', applyRoleBasedRateLimit, ghlStagesRouter);
  // Telegram bot webhook — public endpoint
  app.use('/api/telegram', telegramBotRouter);
  // HR staff movements
  app.use('/api/hr-staff-movements', applyRoleBasedRateLimit, hrStaffMovementsRouter);
  app.use('/api/hr-mc', applyRoleBasedRateLimit, hrMcRouter);
  app.use('/api/hr-annual-leave', applyRoleBasedRateLimit, hrAnnualLeaveRouter);
  app.use('/api/event-mkt', applyRoleBasedRateLimit, eventMktRouter);
  app.use('/api/audit-log', applyRoleBasedRateLimit, auditLogRouter);
  app.use('/api/hr-attendance', applyRoleBasedRateLimit, hrAttendanceRouter);
  app.use('/api/hr-hiring', applyRoleBasedRateLimit, hrHiringRouter);
  app.use('/api/fa-dashboard', applyRoleBasedRateLimit, faDashboardRouter);
  app.use('/api/hrfs', applyRoleBasedRateLimit, hrfsRouter);

  // Audit logging middleware — log POST/PUT/DELETE operations
  app.use((req, res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.path.startsWith('/api/')) {
      const origEnd = res.end;
      res.end = function (...args) {
        const userEmail = req.user?.email || req.user?.deviceName || 'anonymous';
        const logType = res.statusCode >= 400 ? 'error' : 'change';
        writeLog({
          log_type: logType,
          message: `${req.method} ${req.path} → ${res.statusCode}`,
          user_email: userEmail,
          details: res.statusCode >= 400 ? JSON.stringify(req.body || {}).slice(0, 500) : '',
          endpoint: req.path,
          method: req.method,
        });
        origEnd.apply(res, args);
      };
    }
    next();
  });

  // Error handler
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid request',
        details: err.issues,
      });
    }

    // Log errors
    writeLog({
      log_type: 'error',
      message: err.message || 'Internal server error',
      user_email: _req.user?.email || 'system',
      details: err.stack ? err.stack.slice(0, 1000) : '',
      endpoint: _req.path,
      method: _req.method,
    });

    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };

