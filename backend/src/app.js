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
const { hrEventRouter } = require('./routes/hrEvent');
const { auditLogRouter, writeLog } = require('./routes/auditLog');
const { hrAttendanceRouter } = require('./routes/hrAttendance');
const { hrHiringRouter } = require('./routes/hrHiring');
const { hrAnnualLeaveRouter } = require('./routes/hrAnnualLeave');
const { faDashboardRouter } = require('./routes/faDashboard');
const { faSnapshotsRouter } = require('./routes/faSnapshots');
const { pcmSnapshotsRouter } = require('./routes/pcmSnapshots');
const { hrfsRouter } = require('./routes/hrfs');
const { stAttendanceRouter } = require('./routes/stAttendance');
const { stStaffRouter } = require('./routes/stStaff');
const { okrAttendanceRouter } = require('./routes/okrAttendance');
const { studentRecordsRouter } = require('./routes/studentRecords');
const { archivedStudentsRouter } = require('./routes/archivedStudents');
const { studentUploadRouter } = require('./routes/studentUpload');
const { studentAttendanceRouter } = require('./routes/studentAttendance');
const { guardianBackfillRouter } = require('./routes/guardianBackfill');
const { branchPerformanceRouter } = require('./routes/branchPerformance');
const { coachBmPerformanceRouter } = require('./routes/coachBmPerformance');
const { salestrailRouter } = require('./routes/salestrail');
const { hikEventsRouter } = require('./routes/hikEvents');

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
  default: { windowMs: 15 * 60 * 1000, max: 100 },
};

function createRoleBasedRateLimiter() {
  const limiters = {};
  for (const [role, config] of Object.entries(roleRateLimits)) {
    limiters[role] = rateLimit({
      windowMs: config.windowMs,
      max: config.max,
      keyGenerator: (req) => `${req.ip}-${role}`,
      message: { error: 'Too many requests, please try again later.' },
      standardHeaders: true,
      legacyHeaders: false,
    });
  }

  return (req, res, next) => {
    let userRole = 'default';
    try {
      const header = req.headers.authorization || '';
      const [type, token] = header.split(' ');
      if (type === 'Bearer' && token) {
        const payload = jwt.verify(token, env.JWT_SECRET);
        userRole = payload.role || 'default';
      }
    } catch {
      userRole = 'default';
    }
    const limiter = limiters[userRole] || limiters.default;
    limiter(req, res, next);
  };
}

function createApp() {
  const app = express();

  app.set('trust proxy', 1);

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

  app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));
  // Hikvision device event push — mounted BEFORE express.json so the raw XML
  // body isn't consumed. No JWT auth (the scanner can't carry one); uses HTTP
  // Basic via env HIK_PUSH_USER / HIK_PUSH_PASS.
  app.use('/api/hik-events', hikEventsRouter);

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  app.get('/health', (_req, res) => res.json({ ok: true }));

  // Audit logging middleware — must be before routes so res.end is patched first
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

  // Apply stricter rate limiting to auth routes
  app.use('/api/auth', authRouter);

  const applyRoleBasedRateLimit = createRoleBasedRateLimiter();

  app.use('/api/marketing', applyRoleBasedRateLimit, marketingRouter);
  app.use('/api/leads', applyRoleBasedRateLimit, leadsRouter);
  app.use('/api/users', applyRoleBasedRateLimit, usersRouter);
  app.use('/api/permissions', applyRoleBasedRateLimit, permissionsRouter);
  app.use('/api/academy', applyRoleBasedRateLimit, academyRouter);
  app.use('/api/events', applyRoleBasedRateLimit, eventsRouter);
  app.use('/api/finance', applyRoleBasedRateLimit, financeRouter);
  app.use('/api/leads-centre', applyRoleBasedRateLimit, leadsCentreRouter);
  app.use('/api/devices', applyRoleBasedRateLimit, devicesRouter);
  app.use('/api/ghl-stages', applyRoleBasedRateLimit, ghlStagesRouter);
  app.use('/api/telegram', telegramBotRouter);
  app.use('/api/hr-staff-movements', applyRoleBasedRateLimit, hrStaffMovementsRouter);
  app.use('/api/hr-mc', applyRoleBasedRateLimit, hrMcRouter);
  app.use('/api/hr-annual-leave', applyRoleBasedRateLimit, hrAnnualLeaveRouter);
  app.use('/api/event-mkt', applyRoleBasedRateLimit, eventMktRouter);
  app.use('/api/hr-event', applyRoleBasedRateLimit, hrEventRouter);
  app.use('/api/audit-log', applyRoleBasedRateLimit, auditLogRouter);
  app.use('/api/hr-attendance', applyRoleBasedRateLimit, hrAttendanceRouter);
  app.use('/api/hr-hiring', applyRoleBasedRateLimit, hrHiringRouter);
  app.use('/api/fa-dashboard', applyRoleBasedRateLimit, faDashboardRouter);
  app.use('/api/fa-snapshots', applyRoleBasedRateLimit, faSnapshotsRouter);
  app.use('/api/pcm-snapshots', applyRoleBasedRateLimit, pcmSnapshotsRouter);
  app.use('/api/hrfs', applyRoleBasedRateLimit, hrfsRouter);
  app.use('/api/st-attendance', applyRoleBasedRateLimit, stAttendanceRouter);
  app.use('/api/st-staff', applyRoleBasedRateLimit, stStaffRouter);
  app.use('/api/okr-attendance', applyRoleBasedRateLimit, okrAttendanceRouter);
  app.use('/api/student-records', applyRoleBasedRateLimit, studentRecordsRouter);
  app.use('/api/archived-students', applyRoleBasedRateLimit, archivedStudentsRouter);
  app.use('/api/student-upload', applyRoleBasedRateLimit, studentUploadRouter);
  app.use('/api/student-attendance', applyRoleBasedRateLimit, studentAttendanceRouter);
  app.use('/api/coach-bm-performance', applyRoleBasedRateLimit, coachBmPerformanceRouter);
  app.use('/api/guardian-backfill', applyRoleBasedRateLimit, guardianBackfillRouter);
  app.use('/api/branch-performance', applyRoleBasedRateLimit, branchPerformanceRouter);
  app.use('/api/salestrail', applyRoleBasedRateLimit, salestrailRouter);

  // Error handler
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid request',
        details: err.issues,
      });
    }

    writeLog({
      log_type: 'error',
      message: err.message || 'Internal server error',
      user_email: req.user?.email || 'system',
      details: err.stack ? err.stack.slice(0, 1000) : '',
      endpoint: req.path,
      method: req.method,
    });

    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
