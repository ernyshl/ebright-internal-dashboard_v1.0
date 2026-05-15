const express = require('express');
const { z } = require('zod');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getTableNames } = require('../utils/tableNames');
const { computeAgeGroup } = require('../utils/ageGroup');

const router = express.Router();

const REVERTABLE_ACTIONS = new Set(['edit', 'tick', 'untick']);

// Map camelCase field names from frontend → DB columns
const SCALAR_FIELD_MAP = {
  name:             'name',
  gender:           'gender',
  status:           'status',
  branch:           'branch',
  enrollmentDate:   'enrollment_date',
  dob:              'dob',
  coachName:        'coach_name',
  guardianName:     'guardian_name',
  guardianMobile:   'guardian_mobile',
};

function parseTickField(field) {
  // "FA G1" / "PCM G2" / "Workbook G3" → { prefix, index }
  const m = String(field || '').match(/^(FA|PCM|Workbook)\s+G(\d+)$/);
  if (!m) return null;
  return { prefix: m[1], index: parseInt(m[2], 10) - 1 };
}

function arrCols(prefix) {
  if (prefix === 'FA')       return { jsonCol: 'fa_progress_json',       totalCol: 'total_fa'       };
  if (prefix === 'PCM')      return { jsonCol: 'pcm_progress_json',      totalCol: 'total_pcm'      };
  if (prefix === 'Workbook') return { jsonCol: 'workbook_progress_json', totalCol: 'total_workbook' };
  return null;
}

// GET /api/student-change-log — list with filters + pagination.
// Optional query params: branch, action, search (student name), date_from, date_to, page, limit
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { branch = '', action = '', search = '', date_from = '', date_to = '', page = 1, limit = 50 } = req.query;
    const conditions = [];
    const params = [];
    let idx = 1;

    if (branch && branch !== 'All') { conditions.push(`branch = $${idx++}`); params.push(branch); }
    if (action)                     { conditions.push(`action = $${idx++}`); params.push(action); }
    if (search) {
      conditions.push(`student_name ILIKE $${idx}`);
      params.push(`%${search}%`);
      idx++;
    }
    if (date_from) { conditions.push(`(changed_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date >= $${idx++}::date`); params.push(date_from); }
    if (date_to)   { conditions.push(`(changed_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date <= $${idx++}::date`); params.push(date_to); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const lim = Math.min(Math.max(Number(limit) || 50, 1), 500);
    const pg  = Math.max(Number(page) || 1, 1);
    const offset = (pg - 1) * lim;

    const [countResult, dataResult, branchesResult, actionsResult] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS n FROM student_change_log ${where}`, params),
      pool.query(
        `SELECT id, student_id, student_name, branch, action, field, old_value, new_value,
                user_email, note,
                (changed_at AT TIME ZONE 'Asia/Kuala_Lumpur')::text AS changed_at_local
         FROM student_change_log ${where}
         ORDER BY changed_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, lim, offset]
      ),
      pool.query(`SELECT DISTINCT branch FROM student_change_log ORDER BY branch`),
      pool.query(`SELECT DISTINCT action FROM student_change_log ORDER BY action`),
    ]);

    return res.json({
      records:    dataResult.rows,
      total:      countResult.rows[0].n,
      page:       pg,
      limit:      lim,
      totalPages: Math.max(1, Math.ceil(countResult.rows[0].n / lim)),
      branches:   branchesResult.rows.map(r => r.branch),
      actions:    actionsResult.rows.map(r => r.action),
    });
  } catch (err) {
    return next(err);
  }
});

// PUT /api/student-change-log/:id — update note only (audit integrity: cannot modify the change itself).
const noteSchema = z.object({ note: z.string().max(1000).optional() });
router.put('/:id', requireAuth, requireRole(['super_admin']), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
    const { note } = noteSchema.parse(req.body);
    const r = await pool.query(
      `UPDATE student_change_log SET note = $1 WHERE id = $2 RETURNING id, note`,
      [note ?? null, id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Log entry not found' });
    return res.json({ ok: true, ...r.rows[0] });
  } catch (err) {
    if (err instanceof z.ZodError) return next(err);
    return next(err);
  }
});

// DELETE /api/student-change-log/:id — super_admin only.
router.delete('/:id', requireAuth, requireRole(['super_admin']), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
    const r = await pool.query(`DELETE FROM student_change_log WHERE id = $1`, [id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Log entry not found' });
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

// POST /api/student-change-log/:id/revert — undo the change recorded in this log entry.
// Only edit / tick / untick are revertable. create / delete / archive / restore are NOT.
// Logs a NEW 'revert' entry for audit trail.
router.post('/:id/revert', requireAuth, async (req, res, next) => {
  try {
    const logId = parseInt(req.params.id, 10);
    if (!Number.isInteger(logId) || logId <= 0) return res.status(400).json({ error: 'Invalid id' });

    const logRes = await pool.query(`SELECT * FROM student_change_log WHERE id = $1`, [logId]);
    if (logRes.rows.length === 0) return res.status(404).json({ error: 'Log entry not found' });
    const log = logRes.rows[0];

    if (!REVERTABLE_ACTIONS.has(log.action)) {
      return res.status(400).json({ error: `Cannot revert "${log.action}" actions. Only edit / tick / untick are reversible.` });
    }
    if (!log.student_id) {
      return res.status(400).json({ error: 'Cannot revert: log has no student reference (student may have been deleted).' });
    }

    const { students: tbl } = getTableNames();
    const stRes = await pool.query(`SELECT * FROM ${tbl} WHERE id = $1`, [log.student_id]);
    if (stRes.rows.length === 0) {
      return res.status(404).json({ error: 'Student no longer exists. Cannot revert.' });
    }
    const student = stRes.rows[0];
    const oldVal = log.old_value;
    const userEmail = req.user?.email || req.user?.deviceName || 'anonymous';

    // === TICK / UNTICK revert ===
    if (log.action === 'tick' || log.action === 'untick') {
      const parsed = parseTickField(log.field);
      if (!parsed) return res.status(400).json({ error: `Cannot parse tick field "${log.field}".` });
      const cols = arrCols(parsed.prefix);
      if (!cols) return res.status(400).json({ error: `Unknown tick prefix "${parsed.prefix}".` });
      const arr = Array.isArray(student[cols.jsonCol]) ? [...student[cols.jsonCol]] : [];
      if (parsed.index < 0 || parsed.index >= arr.length) {
        return res.status(400).json({ error: `Tickbox index ${parsed.index + 1} out of range (array length ${arr.length}).` });
      }
      const revertedValue = oldVal === 'true' || oldVal === true;
      arr[parsed.index] = revertedValue;
      const attended = arr.filter(Boolean).length;
      await pool.query(
        `UPDATE ${tbl} SET ${cols.jsonCol} = $1::jsonb, ${cols.totalCol} = $2 WHERE id = $3`,
        [JSON.stringify(arr), `${attended}/${arr.length}`, log.student_id]
      );
    }
    // === EDIT revert ===
    else if (log.action === 'edit') {
      const field = log.field;
      // Grade / chapter need special handling — they share the grade_chapter column.
      if (field === 'grade' || field === 'chapter') {
        const [curGrade = 'G1', curChapter = 'C1'] = String(student.grade_chapter || 'G1 — C1').split(' — ');
        const newGrade   = field === 'grade'   ? (oldVal || curGrade)   : curGrade;
        const newChapter = field === 'chapter' ? (oldVal || curChapter) : curChapter;
        await pool.query(`UPDATE ${tbl} SET grade_chapter = $1 WHERE id = $2`,
          [`${newGrade} — ${newChapter}`, log.student_id]);
      } else if (field === 'dob') {
        const dobVal = oldVal && /^\d{4}-\d{2}-\d{2}$/.test(oldVal) ? oldVal : null;
        await pool.query(`UPDATE ${tbl} SET dob = $1::date, age_group = $2 WHERE id = $3`,
          [dobVal, computeAgeGroup(dobVal), log.student_id]);
      } else if (field === 'enrollmentDate') {
        const dateVal = oldVal && /^\d{4}-\d{2}-\d{2}$/.test(oldVal) ? oldVal : null;
        await pool.query(`UPDATE ${tbl} SET enrollment_date = $1::date WHERE id = $2`,
          [dateVal, log.student_id]);
      } else if (SCALAR_FIELD_MAP[field]) {
        await pool.query(`UPDATE ${tbl} SET ${SCALAR_FIELD_MAP[field]} = $1 WHERE id = $2`,
          [oldVal ?? '', log.student_id]);
      } else {
        return res.status(400).json({ error: `Cannot revert field "${field}" — not supported.` });
      }
    }

    // Log the revert itself as a NEW history entry
    await pool.query(
      `INSERT INTO student_change_log
         (student_id, student_name, branch, action, field, old_value, new_value, user_email, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        log.student_id,
        log.student_name,
        log.branch,
        'revert',
        log.field,
        log.new_value,
        log.old_value,
        userEmail,
        `Reverted change #${log.id}`,
      ]
    );

    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

module.exports = { studentChangeLogRouter: router };
