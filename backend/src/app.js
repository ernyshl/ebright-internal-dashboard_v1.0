const express = require('express');
const cors = require('cors');
const { z } = require('zod');
const jwt = require('jsonwebtoken');
const { env } = require('./env');
const { authRouter } = require('./routes/auth');
const { marketingRouter } = require('./routes/marketing');
const { leadsRouter } = require('./routes/leads');
const { usersRouter } = require('./routes/users');
const { permissionsRouter } = require('./routes/permissions');
const { pool } = require('./db');

// Rate limiting store (in-memory for single instance, use Redis for production)
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

function sanitizeSearchTerm(term) {
  // Escape LIKE wildcards to prevent SQL injection via search
  return term.replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function createApp() {
  const app = express();

  // CORS configuration - allow localhost:* for development
  const corsOptions = {
    origin: (origin, callback) => {
      // Allow all localhost origins for development
      if (!origin || /^http:\/\/localhost:\d+$/.test(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  };

  app.use(cors(corsOptions));
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use('/api/auth', authRouter);
  app.use('/api/marketing', marketingRouter);
  app.use('/api/leads', leadsRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/permissions', permissionsRouter);

  // Leads Centre endpoint - with filtering, search, pagination
  app.get('/api/leads-centre', async (req, res) => {
    const header = req.headers.authorization || '';
    const [type, token] = header.split(' ');

    if (type !== 'Bearer' || !token) {
      return res.status(401).json({ error: 'Missing Bearer token' });
    }

    try {
      jwt.verify(token, env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

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
          LOWER(name) LIKE $${paramIndex} OR
          LOWER(email) LIKE $${paramIndex} OR
          LOWER(phone) LIKE $${paramIndex} OR
          LOWER(notes) LIKE $${paramIndex}
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

      // Region filter (with mapping logic)
      if (region) {
        if (region === 'Region 2') {
          conditions.push(`(
            clean_branch IS NULL OR TRIM(clean_branch) = '' OR
            clean_branch ILIKE 'Unspecified' OR
            clean_branch ILIKE 'Unknown Branch'
          )`);
        } else if (region === 'Region 3') {
          conditions.push(`clean_branch ILIKE '%Online%'`);
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

      // Get filtered data
      const dataResult = await pool.query(
        `SELECT * FROM master_leads_powerbi ${whereClause} ORDER BY submitted_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, Number(limit), offset]
      );

      // Get filter options
      const [sourcesResult, regionsResult, branchesResult] = await Promise.all([
        pool.query('SELECT DISTINCT lead_source FROM master_leads_powerbi WHERE lead_source IS NOT NULL AND TRIM(lead_source) != \'\' ORDER BY lead_source'),
        pool.query('SELECT DISTINCT region FROM master_leads_powerbi WHERE region IS NOT NULL AND TRIM(region) != \'\' AND region NOT ILIKE \'unknown\' ORDER BY region'),
        pool.query('SELECT DISTINCT clean_branch FROM master_leads_powerbi WHERE clean_branch IS NOT NULL AND TRIM(clean_branch) != \'\' AND clean_branch NOT ILIKE \'%Online%\' AND clean_branch NOT ILIKE \'Unspecified\' AND clean_branch NOT ILIKE \'Unknown Branch\' ORDER BY clean_branch'),
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
      console.error('Error fetching leads:', error.message);
      res.status(500).json({ error: 'Failed to fetch leads: ' + error.message });
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

