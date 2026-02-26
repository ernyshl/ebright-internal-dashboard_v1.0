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
const { pool } = require('./db');

const { requireAuth, requireRole } = require('./middleware/auth');
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

function sanitizeSearchTerm(term) {
  // Escape LIKE wildcards to prevent SQL injection via search
  return term.replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function createApp() {
  const app = express();

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
  app.use(express.json({ 
    limit: '1mb',
    verify: (req, res, buf) => {
      console.log('Raw body:', buf.toString());
    }
  }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

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

  // Leads Centre endpoint - with filtering, search, pagination
  app.get('/api/leads-centre', applyRoleBasedRateLimit, requireAuth, requireRole(['super_admin', 'ceo', 'marketing', 'od']), async (req, res) => {
    try {
      const {
        search = '',
        lead_source = '',
        region = '',
        branch = '',
        date_from = '',
        date_to = '',
        page = 1,
        limit = 50,
      } = req.query;

      const offset = (Number(page) - 1) * Number(limit);
      const conditions = [];
      const params = [];
      let paramIndex = 1;

      // Search filter (multiple fields)
      if (search) {
        const sanitizedSearch = sanitizeSearchTerm(search);
        conditions.push(`(
          LOWER(full_name) LIKE $${paramIndex} OR
          LOWER(email) LIKE $${paramIndex} OR
          LOWER(phone_number) LIKE $${paramIndex}
        )`);
        params.push(`%${sanitizedSearch.toLowerCase()}%`);
        paramIndex++;
      }

      // Lead source filter
      if (lead_source) {
        conditions.push(`lead_source = $${paramIndex}`);
        params.push(lead_source);
        paramIndex++;
      }

      // Region filter (using actual region field from database)
      if (region) {
        if (region === 'Region 2') {
          conditions.push(`(region = 'Region 2' OR region IS NULL OR TRIM(region) = '')`);
        } else if (region === 'Region 3') {
          conditions.push(`region = 'Region 3'`);
        } else {
          conditions.push(`region = $${paramIndex}`);
          params.push(region);
          paramIndex++;
        }
      }

      // Branch filter
      if (branch) {
        conditions.push(`clean_branch = $${paramIndex}`);
        params.push(branch);
        paramIndex++;
      }

      // Date range filters
      if (date_from) {
        conditions.push(`submitted_at >= $${paramIndex}`);
        params.push(date_from);
        paramIndex++;
      }
      if (date_to) {
        conditions.push(`submitted_at <= $${paramIndex}`);
        params.push(`${date_to} 23:59:59`);
        paramIndex++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Get total count
      const countResult = await pool.query(
        `SELECT COUNT(*) FROM master_leads_powerbi ${whereClause}`,
        params
      );
      const total = parseInt(countResult.rows[0].count, 10);

      // Get filtered data — use actual columns from the table
      const dataResult = await pool.query(
        `SELECT lead_source, full_name, phone_number, email, submitted_at, raw_branch_text, clean_branch, region
         FROM master_leads_powerbi ${whereClause}
         ORDER BY submitted_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, Number(limit), offset]
      );

      // Get filter options
      // Filter branches based on selected region using actual region field
      let branchWhere = "clean_branch IS NOT NULL AND TRIM(clean_branch) != '' AND clean_branch NOT ILIKE 'Unspecified' AND clean_branch NOT ILIKE 'Unknown Branch'";
      if (region) {
        // Filter branches by the selected region
        branchWhere = `(region = $1 OR (region IS NULL OR TRIM(region) = '') AND clean_branch NOT ILIKE 'Unspecified' AND clean_branch NOT ILIKE 'Unknown Branch')`;
      }

      const [sourcesResult, regionsResult, branchesResult] = await Promise.all([
        pool.query('SELECT DISTINCT lead_source FROM master_leads_powerbi WHERE lead_source IS NOT NULL AND TRIM(lead_source) != \'\' ORDER BY lead_source'),
        pool.query('SELECT DISTINCT region FROM master_leads_powerbi WHERE region IS NOT NULL AND TRIM(region) != \'\' ORDER BY region'),
        region
          ? pool.query(`SELECT DISTINCT clean_branch FROM master_leads_powerbi WHERE region = $1 AND clean_branch NOT ILIKE 'Unspecified' AND clean_branch NOT ILIKE 'Unknown Branch' ORDER BY clean_branch`, [region])
          : pool.query('SELECT DISTINCT clean_branch FROM master_leads_powerbi WHERE clean_branch IS NOT NULL AND TRIM(clean_branch) != \'\' AND clean_branch NOT ILIKE \'Unspecified\' AND clean_branch NOT ILIKE \'Unknown Branch\' ORDER BY clean_branch'),
      ]);

      res.json({
        leads: dataResult.rows,
        total,
        page: Number(page),
        totalPages: Math.ceil(total / Number(limit)),
        filters: {
          lead_sources: sourcesResult.rows.map(r => r.lead_source),
          regions: regionsResult.rows.map(r => r.region),
          branches: branchesResult.rows.map(r => r.clean_branch),
        },
      });
    } catch (error) {
      console.error('Error fetching leads:', error);
      res.status(500).json({ error: 'Failed to fetch leads. Please try again later.' });
    }
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

    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };

