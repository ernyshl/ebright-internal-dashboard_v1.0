const express = require('express');
const { pool } = require('../db');

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
    const { branch } = req.query;
    const result = branch
      ? await pool.query(`SELECT * FROM archived_students WHERE branch = $1 ORDER BY name ASC`, [branch])
      : await pool.query(`SELECT * FROM archived_students ORDER BY name ASC`);
    return res.json({ data: result.rows.map(rowToStudent) });
  } catch (err) {
    return next(err);
  }
});

// ── GET /api/archived-students/stats ────────────────────────────────────────

router.get('/stats', async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*)                                   AS total,
        COUNT(*) FILTER (WHERE gender = 'Male')    AS male,
        COUNT(*) FILTER (WHERE gender = 'Female')  AS female,
        COUNT(DISTINCT branch)                     AS branches
      FROM archived_students
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
    const result = await pool.query(
      `INSERT INTO archived_students
         (student_id, name, gender, branch, enrollment_date, date_of_birth,
          created_on, archived_on, guardian_name, guardian_mobile, guardian_email)
       VALUES ($1,$2,$3,$4,$5::date,$6::date,$7::date,$8::date,$9,$10,$11)
       ON CONFLICT (student_id) DO UPDATE SET
         name=$2, gender=$3, branch=$4,
         enrollment_date=COALESCE($5::date, archived_students.enrollment_date),
         date_of_birth=COALESCE($6::date, archived_students.date_of_birth),
         created_on=COALESCE($7::date, archived_students.created_on),
         archived_on=COALESCE($8::date, archived_students.archived_on),
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
    for (const s of students) {
      await pool.query(
        `INSERT INTO archived_students
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
    const result = await pool.query(`SELECT * FROM archived_students ORDER BY name ASC`);
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
    await pool.query(
      `UPDATE archived_students SET
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
    const result = await pool.query(`SELECT * FROM archived_students WHERE student_id=$1`, [student_id]);
    return res.json({ ok: true, data: rowToStudent(result.rows[0]) });
  } catch (err) {
    return next(err);
  }
});

// ── DELETE /api/archived-students  (delete ALL or by branch) ────────────────

router.delete('/', async (req, res, next) => {
  const { branch } = req.query;
  try {
    if (branch && branch !== 'All') {
      await pool.query(`DELETE FROM archived_students WHERE branch=$1`, [branch]);
    } else {
      await pool.query(`DELETE FROM archived_students`);
    }
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

// ── DELETE /api/archived-students/:student_id ────────────────────────────────

router.delete('/:student_id', async (req, res, next) => {
  const { student_id } = req.params;
  try {
    await pool.query(`DELETE FROM archived_students WHERE student_id=$1`, [student_id]);
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

module.exports = { archivedStudentsRouter: router };
