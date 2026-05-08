const express = require('express');
const { pool, leadsPool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const ALLOWED_ROLES = ['super_admin', 'ceo', 'hr', 'tv'];

// GET /api/hr-staff-movements/dashboard — dashboard view (-2 weeks to +2 months)
//
// Source: ebrightleads_db.hrfs."BranchStaff" (HR system of record), reached
// via leadsPool. Aliased into the shape the frontend already consumes
// (name, position, department_branch, start_date, end_date).
//
// Quirks of this table:
//   • start_date and "endDate" are TEXT, not DATE — and the casing is mixed
//     (snake on the start side, camel on the end side) by the upstream HR
//     system. We filter on a strict ISO regex before casting so empty strings
//     / malformed values don't blow up the cast.
//   • position can be NULL; role is reliably populated with values like
//     'PT - Coach', 'INT', so we fall back to role when position is missing.
//   • department can be sparse. We fall back to branch (always present).
const ISO_DATE = String.raw`^\d{4}-\d{2}-\d{2}$`;

const SELECT_COLS = `
  id,
  name,
  COALESCE(NULLIF(TRIM(position), ''), NULLIF(TRIM(role), ''))  AS position,
  COALESCE(NULLIF(TRIM(department), ''), branch)                 AS department_branch,
  NULLIF(TRIM(start_date), '')  AS start_date,
  NULLIF(TRIM("endDate"),  '')  AS end_date
`;

router.get('/dashboard', requireAuth, requireRole(ALLOWED_ROLES), async (req, res, next) => {
  try {
    // Optional ?month=YYYY-MM lets the frontend page through historical months
    // for the "signed this month" counts. Strict regex so we can safely use
    // a parameterized cast without surprises. Falls back to CURRENT_DATE.
    const monthParam = String(req.query.month || '').trim();
    const useExplicitMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam);
    const monthExpr = useExplicitMonth ? '$1::date' : 'CURRENT_DATE';
    const monthArgs = useExplicitMonth ? [`${monthParam}-01`] : [];
    // Onboarding: hide resigned staff so a historical row whose start_date
    // happens to fall in the window doesn't pollute the list.
    const { rows: onboarding } = await leadsPool.query(
      `SELECT ${SELECT_COLS}
       FROM hrfs."BranchStaff"
       WHERE start_date ~ $1
         AND start_date::date >= CURRENT_DATE - INTERVAL '1 month'
         AND start_date::date <= CURRENT_DATE + INTERVAL '6 months'
         AND COALESCE(NULLIF(TRIM(status), ''), 'Active') ILIKE 'Active'
       ORDER BY start_date::date ASC`,
      [ISO_DATE]
    );

    // Offboarding: no status filter — once someone is offboarded their status
    // flips to Inactive, and we still want them in the past-1-week portion
    // of the window.
    const { rows: offboarding } = await leadsPool.query(
      `SELECT ${SELECT_COLS}
       FROM hrfs."BranchStaff"
       WHERE "endDate" ~ $1
         AND "endDate"::date >= CURRENT_DATE - INTERVAL '1 week'
         AND "endDate"::date <= CURRENT_DATE + INTERVAL '2 months'
       ORDER BY "endDate"::date ASC`,
      [ISO_DATE]
    );

    // Active staff who signed THIS calendar month, bucketed by role for the
    // header counts and returned as a list so the frontend can show detail
    // when a count is clicked.
    //
    // signed_date is free-text and the upstream HR system writes it in three
    // different shapes — '2025-05-08', '5-May-25', '15th November 2025' /
    // '1ST OCTOBER 2025'. We parse each shape via to_date and COALESCE; rows
    // whose value matches none of these are excluded. Roles map to three
    // buckets ('PT - Coach', 'INT', 'FT EXEC', 'BM', ...).
    const BUCKET_SQL = `
      CASE
        WHEN role ILIKE 'PT%' OR role ILIKE '%Part Time%'                THEN 'partTime'
        WHEN role ILIKE 'INT%' OR role ILIKE '%Intern%'                  THEN 'intern'
        WHEN role ILIKE 'FT%' OR role ILIKE '%Full Time%'
          OR role IN ('BM','CEO','Executive/Coach')                       THEN 'fullTime'
        ELSE 'other'
      END
    `;
    const SIGNED_DATE_PARSED = `
      COALESCE(
        CASE WHEN signed_date ~ '^\\d{4}-\\d{2}-\\d{2}$'
             THEN to_date(signed_date, 'YYYY-MM-DD') END,
        CASE WHEN signed_date ~ '^\\d{1,2}-[A-Za-z]{3}-\\d{2}$'
             THEN to_date(signed_date, 'FMDD-Mon-YY') END,
        CASE WHEN signed_date ~* '^\\d{1,2}(st|nd|rd|th)?\\s+[A-Za-z]+\\s+\\d{4}$'
             THEN to_date(regexp_replace(signed_date, '(?i)(\\d+)(st|nd|rd|th)', '\\1'),
                          'FMDD FMMonth YYYY') END
      )
    `;
    const SIGNED_IN_MONTH = `
      date_trunc('month', ${SIGNED_DATE_PARSED}) = date_trunc('month', ${monthExpr})
        AND COALESCE(NULLIF(TRIM(status), ''), 'Active') ILIKE 'Active'
    `;

    const { rows: bucketRows } = await leadsPool.query(
      `SELECT ${BUCKET_SQL} AS bucket, COUNT(*)::int AS n
       FROM hrfs."BranchStaff"
       WHERE ${SIGNED_IN_MONTH}
       GROUP BY 1`,
      monthArgs
    );
    const signedCounts = { partTime: 0, fullTime: 0, intern: 0 };
    for (const r of bucketRows) {
      if (r.bucket in signedCounts) signedCounts[r.bucket] = r.n;
    }

    const { rows: signedStaff } = await leadsPool.query(
      `SELECT id, name,
              COALESCE(NULLIF(TRIM(position), ''), NULLIF(TRIM(role), '')) AS position,
              COALESCE(NULLIF(TRIM(department), ''), branch)                AS department_branch,
              ${SIGNED_DATE_PARSED}::text AS signed_date,
              NULLIF(TRIM(start_date),  '') AS start_date,
              ${BUCKET_SQL} AS bucket
       FROM hrfs."BranchStaff"
       WHERE ${SIGNED_IN_MONTH}
       ORDER BY ${SIGNED_DATE_PARSED} DESC, name ASC`,
      monthArgs
    );

    return res.json({
      onboarding,
      offboarding,
      signedCounts,
      signedStaff,
      signedMonth: useExplicitMonth ? monthParam : new Date().toISOString().slice(0, 7),
    });
  } catch (err) {
    return next(err);
  }
});

// GET /api/hr-staff-movements — list with filters (paginated)
router.get('/', requireAuth, requireRole(ALLOWED_ROLES), async (req, res, next) => {
  try {
    const {
      search = '', position = '', department_branch = '',
      date_from = '', date_to = '',
      page = 1, limit = 50,
    } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (search) {
      conditions.push(`(name ILIKE $${idx} OR position ILIKE $${idx} OR department_branch ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }
    if (position) { conditions.push(`position = $${idx++}`); params.push(position); }
    if (department_branch) { conditions.push(`department_branch = $${idx++}`); params.push(department_branch); }
    if (date_from) { conditions.push(`(start_date >= $${idx}::date OR end_date >= $${idx}::date)`); params.push(date_from); idx++; }
    if (date_to) { conditions.push(`(start_date <= $${idx}::date OR end_date <= $${idx}::date)`); params.push(date_to); idx++; }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (Number(page) - 1) * Number(limit);

    const [countResult, dataResult] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM hr_staff_movements ${where}`, params),
      pool.query(
        `SELECT id, name, position, department_branch, start_date, end_date, created_at
         FROM hr_staff_movements ${where}
         ORDER BY start_date DESC, created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, Number(limit), offset]
      ),
    ]);

    return res.json({
      records: dataResult.rows,
      total: parseInt(countResult.rows[0].count, 10),
      page: Number(page),
      totalPages: Math.ceil(parseInt(countResult.rows[0].count, 10) / Number(limit)),
    });
  } catch (err) {
    return next(err);
  }
});

// POST /api/hr-staff-movements — create
router.post('/', requireAuth, requireRole(ALLOWED_ROLES), async (req, res, next) => {
  try {
    const { name, position, department_branch, start_date, end_date } = req.body;

    if (!name || !position || !department_branch) {
      return res.status(400).json({ error: 'Name, position, and department/branch are required' });
    }
    if (!start_date && !end_date) {
      return res.status(400).json({ error: 'At least one of start date or end date is required' });
    }

    const { rows } = await pool.query(
      `INSERT INTO hr_staff_movements (name, position, department_branch, start_date, end_date)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [name.trim(), position.trim(), department_branch.trim(), start_date || null, end_date || null]
    );

    return res.status(201).json({ id: rows[0].id });
  } catch (err) {
    return next(err);
  }
});

// PUT /api/hr-staff-movements/:id — update
router.put('/:id', requireAuth, requireRole(ALLOWED_ROLES), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, position, department_branch, start_date, end_date } = req.body;

    const sets = [];
    const params = [];
    let idx = 1;

    if (name !== undefined) { sets.push(`name = $${idx++}`); params.push(name.trim()); }
    if (position !== undefined) { sets.push(`position = $${idx++}`); params.push(position.trim()); }
    if (department_branch !== undefined) { sets.push(`department_branch = $${idx++}`); params.push(department_branch.trim()); }
    if (start_date !== undefined) { sets.push(`start_date = $${idx++}`); params.push(start_date || null); }
    if (end_date !== undefined) { sets.push(`end_date = $${idx++}`); params.push(end_date || null); }

    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });

    params.push(id);
    const { rowCount } = await pool.query(
      `UPDATE hr_staff_movements SET ${sets.join(', ')} WHERE id = $${idx}`,
      params
    );

    if (rowCount === 0) return res.status(404).json({ error: 'Record not found' });
    return res.json({ message: 'Updated' });
  } catch (err) {
    return next(err);
  }
});

// DELETE /api/hr-staff-movements/:id — delete
router.delete('/:id', requireAuth, requireRole(ALLOWED_ROLES), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rowCount } = await pool.query('DELETE FROM hr_staff_movements WHERE id = $1', [id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Record not found' });
    return res.json({ message: 'Deleted' });
  } catch (err) {
    return next(err);
  }
});

// POST /api/hr-staff-movements/bulk — bulk import
router.post('/bulk', requireAuth, requireRole(['super_admin', 'hr']), async (req, res, next) => {
  try {
    const { records, clearFirst } = req.body;
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: 'records must be a non-empty array' });
    }

    if (clearFirst) {
      await pool.query('DELETE FROM hr_staff_movements');
    }

    let inserted = 0;
    let skipped = 0;

    for (const r of records) {
      const name = (r.name || '').trim();
      const position = (r.position || '').trim();
      const dept = (r.department_branch || '').trim();
      const startDate = r.start_date || null;
      const endDate = r.end_date || null;

      if (!name || !position || !dept) { skipped++; continue; }
      if (!startDate && !endDate) { skipped++; continue; }

      await pool.query(
        `INSERT INTO hr_staff_movements (name, position, department_branch, start_date, end_date)
         VALUES ($1, $2, $3, $4, $5)`,
        [name, position, dept, startDate, endDate]
      );
      inserted++;
    }

    return res.json({ inserted, skipped, total: records.length });
  } catch (err) {
    return next(err);
  }
});

module.exports = { hrStaffMovementsRouter: router };
