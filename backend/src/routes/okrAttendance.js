const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
const ALLOWED_ROLES = ['super_admin', 'ceo', 'od', 'rm', 'academy', 'hr'];

// GET /api/okr-attendance/branches — distinct branch list
router.get('/branches', requireAuth, requireRole(ALLOWED_ROLES), async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT branch FROM branch_okr_attendance ORDER BY branch`
    );
    return res.json({ branches: result.rows.map(r => r.branch) });
  } catch (err) { return next(err); }
});

// Snap any date string to the Monday of its Mon–Sun week
function toWednesday(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

// GET /api/okr-attendance — list with optional filters
router.get('/', requireAuth, requireRole(ALLOWED_ROLES), async (req, res, next) => {
  try {
    const { branch = '', week_date = '', limit = 50 } = req.query;
    const conditions = [];
    const params = [];
    let idx = 1;

    if (branch) { conditions.push(`branch = $${idx++}`); params.push(branch); }
    if (week_date) {
      // Match any record whose week_date falls within the same Mon–Sun week as the queried date
      const wed = toWednesday(week_date);
      conditions.push(`week_date >= $${idx++}::date AND week_date <= $${idx++}::date + INTERVAL '6 days'`);
      params.push(wed, wed);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT * FROM branch_okr_attendance ${where} ORDER BY week_date DESC, branch ASC LIMIT $${idx}`,
      [...params, Number(limit)]
    );
    return res.json({ records: result.rows });
  } catch (err) { return next(err); }
});

// POST /api/okr-attendance — upsert (insert or update by branch + week_date)
router.post('/', requireAuth, requireRole(ALLOWED_ROLES), async (req, res, next) => {
  try {
    const b = { ...req.body, week_date: toWednesday(req.body.week_date) };

    const result = await pool.query(
      `INSERT INTO branch_okr_attendance (
        branch, week_date,
        total_online_attendance, online_conversion_rate, avg_online_trial_pax, total_onl_attendance,
        wed_absent, wed_attended, wed_frozen, wed_replaced,
        thu_absent, thu_attended, thu_frozen, thu_replaced,
        fri_absent, fri_attended, fri_frozen, fri_replaced,
        sat_absent, sat_attended, sat_frozen, sat_replaced,
        sun_absent, sun_attended, sun_frozen, sun_replaced,
        not_enrolled, outstanding_invoice_disc, expired_package, newly_enrolled,
        pc_meetup_invited, pc_meetup_showup,
        outstanding_invoice_pct, partially_paid_unpaid, active_students,
        updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
        $19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,NOW()
      )
      ON CONFLICT (branch, week_date) DO UPDATE SET
        total_online_attendance  = EXCLUDED.total_online_attendance,
        online_conversion_rate   = EXCLUDED.online_conversion_rate,
        avg_online_trial_pax     = EXCLUDED.avg_online_trial_pax,
        total_onl_attendance     = EXCLUDED.total_onl_attendance,
        wed_absent = EXCLUDED.wed_absent, wed_attended = EXCLUDED.wed_attended,
        wed_frozen = EXCLUDED.wed_frozen, wed_replaced = EXCLUDED.wed_replaced,
        thu_absent = EXCLUDED.thu_absent, thu_attended = EXCLUDED.thu_attended,
        thu_frozen = EXCLUDED.thu_frozen, thu_replaced = EXCLUDED.thu_replaced,
        fri_absent = EXCLUDED.fri_absent, fri_attended = EXCLUDED.fri_attended,
        fri_frozen = EXCLUDED.fri_frozen, fri_replaced = EXCLUDED.fri_replaced,
        sat_absent = EXCLUDED.sat_absent, sat_attended = EXCLUDED.sat_attended,
        sat_frozen = EXCLUDED.sat_frozen, sat_replaced = EXCLUDED.sat_replaced,
        sun_absent = EXCLUDED.sun_absent, sun_attended = EXCLUDED.sun_attended,
        sun_frozen = EXCLUDED.sun_frozen, sun_replaced = EXCLUDED.sun_replaced,
        not_enrolled             = EXCLUDED.not_enrolled,
        outstanding_invoice_disc = EXCLUDED.outstanding_invoice_disc,
        expired_package          = EXCLUDED.expired_package,
        newly_enrolled           = EXCLUDED.newly_enrolled,
        pc_meetup_invited        = EXCLUDED.pc_meetup_invited,
        pc_meetup_showup         = EXCLUDED.pc_meetup_showup,
        outstanding_invoice_pct  = EXCLUDED.outstanding_invoice_pct,
        partially_paid_unpaid    = EXCLUDED.partially_paid_unpaid,
        active_students          = EXCLUDED.active_students,
        updated_at               = NOW()
      RETURNING *`,
      [
        b.branch,                                           // $1
        b.week_date,                                        // $2
        n(b.total_online_attendance),                       // $3
        n(b.online_conversion_rate),                        // $4
        n(b.avg_online_trial_pax),                          // $5
        n(b.total_onl_attendance),                          // $6
        n(b.wed_absent),   n(b.wed_attended),               // $7–8
        n(b.wed_frozen),   n(b.wed_replaced),               // $9–10
        n(b.thu_absent),   n(b.thu_attended),               // $11–12
        n(b.thu_frozen),   n(b.thu_replaced),               // $13–14
        n(b.fri_absent),   n(b.fri_attended),               // $15–16
        n(b.fri_frozen),   n(b.fri_replaced),               // $17–18
        n(b.sat_absent),   n(b.sat_attended),               // $19–20
        n(b.sat_frozen),   n(b.sat_replaced),               // $21–22
        n(b.sun_absent),   n(b.sun_attended),               // $23–24
        n(b.sun_frozen),   n(b.sun_replaced),               // $25–26
        n(b.not_enrolled),                                  // $27
        n(b.outstanding_invoice_disc),                      // $28
        n(b.expired_package),                               // $29
        n(b.newly_enrolled),                                // $30
        n(b.pc_meetup_invited),                             // $31
        n(b.pc_meetup_showup),                              // $32
        n(b.outstanding_invoice_pct),                       // $33
        n(b.partially_paid_unpaid),                         // $34
        n(b.active_students),                               // $35
      ]
    );

    return res.json({ ok: true, record: result.rows[0] });
  } catch (err) { return next(err); }
});

// DELETE /api/okr-attendance/:id
router.delete('/:id', requireAuth, requireRole(['super_admin', 'ceo', 'od']), async (req, res, next) => {
  try {
    const { id } = req.params;
    await pool.query(`DELETE FROM branch_okr_attendance WHERE id = $1`, [Number(id)]);
    return res.json({ ok: true });
  } catch (err) { return next(err); }
});

// Helper: parse to number, default 0
function n(val) {
  const v = parseFloat(val);
  return isNaN(v) ? 0 : v;
}

module.exports = { okrAttendanceRouter: router };
