const express = require('express');
const { pool } = require('../db');
const { getTableNames } = require('../utils/tableNames');

const router = express.Router();

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtDate(val) {
  if (!val) return '';
  const d = new Date(val);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function safeDate(val) {
  if (!val) return null;
  const s = String(val).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function rowToStudent(r) {
  return {
    no:             r.no,
    studentId:      r.student_id    || '',
    name:           r.name          || '',
    gender:         r.gender        || '',
    branch:         r.branch        || '',
    enrollmentDate: fmtDate(r.enrollment_date),
    dateOfBirth:    fmtDate(r.date_of_birth),
    createdOn:      fmtDate(r.created_on),
    archivedOn:     fmtDate(r.archived_on),
    guardianName:   r.guardian_name   || '',
    guardianMobile: r.guardian_mobile || '',
    guardianEmail:  r.guardian_email  || '',
  };
}

// ── GET /api/archived-students ───────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const { archived: tbl } = getTableNames();
    const { branch } = req.query;
    const result = branch
      ? await pool.query(`SELECT * FROM ${tbl} WHERE branch = $1 ORDER BY name ASC`, [branch])
      : await pool.query(`SELECT * FROM ${tbl} ORDER BY name ASC`);
    return res.json({ data: result.rows.map(rowToStudent) });
  } catch (err) {
    return next(err);
  }
});

// ── GET /api/archived-students/stats ────────────────────────────────────────

router.get('/stats', async (req, res, next) => {
  try {
    const { archived: tbl } = getTableNames();
    const result = await pool.query(`
      SELECT
        COUNT(*)                                   AS total,
        COUNT(*) FILTER (WHERE gender = 'Male')    AS male,
        COUNT(*) FILTER (WHERE gender = 'Female')  AS female,
        COUNT(DISTINCT branch)                     AS branches
      FROM ${tbl}
    `);
    const row = result.rows[0];
    return res.json({
      total:    Number(row.total),
      male:     Number(row.male),
      female:   Number(row.female),
      branches: Number(row.branches),
    });
  } catch (err) {
    return next(err);
  }
});

// ── POST /api/archived-students ──────────────────────────────────────────────

router.post('/', async (req, res, next) => {
  const s = req.body;
  if (!s?.name) return res.status(400).json({ error: 'name is required' });
  try {
    const { archived: tbl } = getTableNames();
    const result = await pool.query(
      `INSERT INTO ${tbl}
         (student_id, name, gender, branch, enrollment_date, date_of_birth,
          created_on, archived_on, guardian_name, guardian_mobile, guardian_email)
       VALUES ($1,$2,$3,$4,$5::date,$6::date,$7::date,$8::date,$9,$10,$11)
       ON CONFLICT (student_id) DO UPDATE SET
         name=$2, gender=$3, branch=$4,
         enrollment_date=COALESCE($5::date, ${tbl}.enrollment_date),
         date_of_birth=COALESCE($6::date, ${tbl}.date_of_birth),
         created_on=COALESCE($7::date, ${tbl}.created_on),
         archived_on=COALESCE($8::date, ${tbl}.archived_on),
         guardian_name=$9, guardian_mobile=$10, guardian_email=$11
       RETURNING *`,
      [
        s.studentId    || null,
        s.name,
        s.gender       || 'Male',
        s.branch       || 'ONL',
        safeDate(s.enrollmentDate),
        safeDate(s.dateOfBirth),
        safeDate(s.createdOn),
        safeDate(s.archivedOn),
        s.guardianName   || '',
        s.guardianMobile || '',
        s.guardianEmail  || '',
      ]
    );
    return res.json({ ok: true, data: rowToStudent(result.rows[0]) });
  } catch (err) {
    return next(err);
  }
});

// ── POST /api/archived-students/import ──────────────────────────────────────

router.post('/import', async (req, res, next) => {
  const { students } = req.body;
  if (!Array.isArray(students) || students.length === 0)
    return res.status(400).json({ error: 'students array required' });

  try {
    const { archived: tbl } = getTableNames();
    for (const s of students) {
      await pool.query(
        `INSERT INTO ${tbl}
           (student_id, name, gender, branch, enrollment_date, date_of_birth,
            created_on, archived_on, guardian_name, guardian_mobile, guardian_email)
         VALUES ($1,$2,$3,$4,$5::date,$6::date,$7::date,$8::date,$9,$10,$11)
         ON CONFLICT (student_id) DO NOTHING`,
        [
          s.studentId    || null,
          s.name,
          s.gender       || 'Male',
          s.branch       || 'ONL',
          safeDate(s.enrollmentDate),
          safeDate(s.dateOfBirth),
          safeDate(s.createdOn),
          safeDate(s.archivedOn),
          s.guardianName   || '',
          s.guardianMobile || '',
          s.guardianEmail  || '',
        ]
      );
    }
    const result = await pool.query(`SELECT * FROM ${tbl} ORDER BY name ASC`);
    return res.json({ ok: true, data: result.rows.map(rowToStudent) });
  } catch (err) {
    return next(err);
  }
});

// ── PUT /api/archived-students/:student_id ───────────────────────────────────

router.put('/:student_id', async (req, res, next) => {
  const { student_id } = req.params;
  const s = req.body;
  try {
    const { archived: tbl } = getTableNames();
    await pool.query(
      `UPDATE ${tbl} SET
         name=$1, gender=$2, branch=$3,
         enrollment_date = COALESCE($4::date, enrollment_date),
         date_of_birth   = COALESCE($5::date, date_of_birth),
         created_on      = COALESCE($6::date, created_on),
         archived_on     = COALESCE($7::date, archived_on),
         guardian_name=$8, guardian_mobile=$9, guardian_email=$10
       WHERE student_id=$11`,
      [
        s.name,
        s.gender       || 'Male',
        s.branch       || 'ONL',
        safeDate(s.enrollmentDate),
        safeDate(s.dateOfBirth),
        safeDate(s.createdOn),
        safeDate(s.archivedOn),
        s.guardianName   || '',
        s.guardianMobile || '',
        s.guardianEmail  || '',
        student_id,
      ]
    );
    const result = await pool.query(`SELECT * FROM ${tbl} WHERE student_id=$1`, [student_id]);
    return res.json({ ok: true, data: rowToStudent(result.rows[0]) });
  } catch (err) {
    return next(err);
  }
});

// ── DELETE /api/archived-students  (delete ALL or by branch) ────────────────

router.delete('/', async (req, res, next) => {
  const { branch } = req.query;
  try {
    const { archived: tbl } = getTableNames();
    if (branch && branch !== 'All') {
      await pool.query(`DELETE FROM ${tbl} WHERE branch=$1`, [branch]);
    } else {
      await pool.query(`DELETE FROM ${tbl}`);
    }
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

// ── POST /api/archived-students/:no/restore ─────────────────────────────────

router.post('/:no/restore', async (req, res, next) => {
  const no = parseInt(req.params.no, 10);
  if (!Number.isInteger(no) || no <= 0) {
    return res.status(400).json({ error: 'Invalid archive id' });
  }

  const { students: studentsTbl, archived: archivedTbl } = getTableNames();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sel = await client.query(
      `SELECT name, gender, branch, enrollment_date, grade_chapter,
              fa_progress_json, total_fa, pcm_progress_json, total_pcm,
              guardian_name, guardian_mobile
         FROM ${archivedTbl} WHERE no = $1`,
      [no]
    );
    if (sel.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Archived student not found' });
    }
    const a = sel.rows[0];

    await client.query(
      `INSERT INTO ${studentsTbl}
         (name, status, gender, branch, enrollment_date, grade_chapter,
          fa_progress_json, total_fa, pcm_progress_json, total_pcm,
          guardian_name, guardian_mobile)
       VALUES ($1,$2,$3,$4,$5::date,$6,$7::jsonb,$8,$9::jsonb,$10,$11,$12)`,
      [
        a.name,
        'Active',
        a.gender || 'Male',
        a.branch || '',
        a.enrollment_date,
        a.grade_chapter || 'G1 — C1',
        JSON.stringify(Array.isArray(a.fa_progress_json) ? a.fa_progress_json : []),
        a.total_fa || '0/0',
        JSON.stringify(Array.isArray(a.pcm_progress_json) ? a.pcm_progress_json : []),
        a.total_pcm || '0/0',
        a.guardian_name   || '',
        a.guardian_mobile || '',
      ]
    );

    await client.query(`DELETE FROM ${archivedTbl} WHERE no = $1`, [no]);

    await client.query('COMMIT');
    return res.json({ success: true, restored: a.name });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    return next(err);
  } finally {
    client.release();
  }
});

// ── DELETE /api/archived-students/:student_id ────────────────────────────────

router.delete('/:student_id', async (req, res, next) => {
  const { student_id } = req.params;
  try {
    const { archived: tbl } = getTableNames();
    await pool.query(`DELETE FROM ${tbl} WHERE student_id=$1`, [student_id]);
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

module.exports = { archivedStudentsRouter: router };
