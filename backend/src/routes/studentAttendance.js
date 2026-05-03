const express = require('express');
const { z } = require('zod');
const { pool } = require('../db');
const { normalizeName } = require('../utils/normalizeName');
const { getTableNames } = require('../utils/tableNames');
const {
  processAttendanceBatch,
  processAttendanceRow,
  reverseAttendanceEffect,
} = require('../services/attendancePromotion');

const router = express.Router();

const STATUS_ENUM = z.enum(['attended', 'absent']);

async function lookupStudent(client, name, branch) {
  const { students: tbl } = getTableNames();
  const r = await client.query(
    `SELECT id, name, branch, grade_chapter, fa_progress_json
       FROM ${tbl}
      WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
        AND LOWER(TRIM(branch)) = LOWER(TRIM($2))
      LIMIT 1`,
    [name ?? '', branch ?? '']
  );
  return r.rows[0] || null;
}

async function applyToStudent(client, studentId, newGradeChapter, newFaProgressJson) {
  const { students: tbl } = getTableNames();
  await client.query(
    `UPDATE ${tbl}
        SET grade_chapter   = COALESCE($1, grade_chapter),
            fa_progress_json = COALESCE($2::jsonb, fa_progress_json)
      WHERE id = $3`,
    [
      newGradeChapter,
      newFaProgressJson ? JSON.stringify(newFaProgressJson) : null,
      studentId,
    ]
  );
  const { rows } = await client.query(
    `SELECT grade_chapter FROM ${tbl} WHERE id = $1`,
    [studentId]
  );
  return rows[0]?.grade_chapter ?? null;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtDateOnly(val) {
  if (val === null || val === undefined || val === '') return '';
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '';
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  // Already a string — strip any trailing time portion so "2026-04-25T..." → "2026-04-25"
  const s = String(val).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : s;
}

function rowToCamel(r) {
  return {
    id:               r.id,
    studentName:      r.student_name      || '',
    branch:           r.branch            || '',
    attendanceStatus: r.attendance_status || '',
    lessonName:       r.lesson_name       || '',
    lessonTeachers:   r.lesson_teachers   || '',
    lessonDate:       fmtDateOnly(r.lesson_date),
    day:              r.day               || '',
    attendanceBy:     r.attendance_by     || '',
  };
}

function nullIfEmpty(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

const RowSchema = z.object({
  studentName:      z.string().min(1, 'studentName is required'),
  branch:           z.string().optional().default(''),
  attendanceStatus: z.string().optional().default(''),
  lessonName:       z.string().optional().default(''),
  lessonTeachers:   z.string().optional().default(''),
  lessonDate:       z.string().optional().default(''),
  day:              z.string().optional().default(''),
  attendanceBy:     z.string().optional().default(''),
}).passthrough();

const ImportSchema = z.object({
  rows: z.array(RowSchema).min(1, 'rows array required'),
});

// ── GET /api/student-attendance ─────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const { branch } = req.query;
    const result = (branch && branch !== 'All')
      ? await pool.query(`SELECT * FROM student_attendance WHERE branch = $1 ORDER BY id ASC`, [branch])
      : await pool.query(`SELECT * FROM student_attendance ORDER BY id ASC`);
    return res.json({ data: result.rows.map(rowToCamel) });
  } catch (err) {
    return next(err);
  }
});

// ── POST /api/student-attendance/import (bulk upload + auto-promote) ───────

router.post('/import', async (req, res, next) => {
  try {
    const { rows } = ImportSchema.parse(req.body);
    const branch = (req.body?.branch || rows[0]?.branch || '').toString().trim();
    if (!branch) return res.status(400).json({ error: 'branch is required (top-level field or rows[0].branch)' });

    const summary = await processAttendanceBatch(rows, branch);
    const result = await pool.query(`SELECT * FROM student_attendance ORDER BY id ASC`);

    return res.json({
      success: true,
      totalRows: summary.totalRows,
      inserted: summary.inserted,
      duplicates: summary.duplicates,
      promotionsByAction: summary.promotionsByAction,
      warnings: summary.warnings,
      data: result.rows.map(rowToCamel),
    });
  } catch (err) {
    if (err instanceof z.ZodError) return next(err);
    // eslint-disable-next-line no-console
    console.error('[student-attendance/import] failed:', err);
    return res.status(500).json({ error: err?.message || 'Import failed' });
  }
});

// ── POST /api/student-attendance/manual-entry (single row + auto-promote) ─

const ManualEntrySchema = z.object({
  studentName:      z.string().min(1, 'studentName is required'),
  branch:           z.string().min(1, 'branch is required'),
  attendanceStatus: STATUS_ENUM,
  lessonName:       z.string().min(1, 'lessonName is required'),
  lessonTeachers:   z.string().optional().default(''),
  lessonDate:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'lessonDate must be YYYY-MM-DD'),
  day:              z.string().optional().default(''),
  attendanceBy:     z.string().optional().default(''),
});

router.post('/manual-entry', async (req, res, next) => {
  try {
    const row = ManualEntrySchema.parse(req.body);
    const summary = await processAttendanceBatch([row], row.branch);
    const result = await pool.query(`SELECT * FROM student_attendance ORDER BY id ASC`);

    return res.json({
      success: true,
      totalRows: summary.totalRows,
      inserted: summary.inserted,
      duplicates: summary.duplicates,
      promotionsByAction: summary.promotionsByAction,
      warnings: summary.warnings,
      data: result.rows.map(rowToCamel),
    });
  } catch (err) {
    if (err instanceof z.ZodError) return next(err);
    // eslint-disable-next-line no-console
    console.error('[student-attendance/manual-entry] failed:', err);
    return res.status(500).json({ error: err?.message || 'Manual entry failed' });
  }
});

// ── PUT /api/student-attendance/:id (manual edit, no promotion) ────────────

const EditSchema = z.object({
  studentName:      z.string().min(1),
  branch:           z.string().min(1),
  attendanceStatus: STATUS_ENUM,
  lessonName:       z.string().optional().default(''),
  lessonTeachers:   z.string().optional().default(''),
  lessonDate:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'lessonDate must be YYYY-MM-DD'),
  day:              z.string().optional().default(''),
  attendanceBy:     z.string().optional().default(''),
});

router.put('/:id', async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });

  let client;
  try {
    const body = EditSchema.parse(req.body);
    const newStatus = body.attendanceStatus.toLowerCase();

    client = await pool.connect();
    await client.query('BEGIN');

    const existing = await client.query(`SELECT * FROM student_attendance WHERE id = $1`, [id]);
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Attendance row not found' });
    }
    const oldRow = existing.rows[0];
    const oldStatus = String(oldRow.attendance_status || '').toLowerCase();

    await client.query(
      `UPDATE student_attendance
          SET student_name      = $1,
              branch            = $2,
              attendance_status = $3,
              lesson_name       = $4,
              lesson_teachers   = $5,
              lesson_date       = $6::date,
              day               = $7,
              attendance_by     = $8
        WHERE id = $9`,
      [
        body.studentName,
        body.branch,
        body.attendanceStatus,
        nullIfEmpty(body.lessonName),
        nullIfEmpty(body.lessonTeachers),
        body.lessonDate,
        nullIfEmpty(body.day),
        nullIfEmpty(body.attendanceBy),
        id,
      ]
    );

    let studentAffected = false;
    let studentName     = null;
    let oldGradeChapter = null;
    let newGradeChapter = null;
    let reverseAction   = null;

    if (oldStatus !== newStatus) {
      if (oldStatus === 'attended' && newStatus === 'absent') {
        // Reverse the OLD row's effect on the OLD student
        const student = await lookupStudent(client, oldRow.student_name, oldRow.branch);
        if (student) {
          studentName     = student.name;
          oldGradeChapter = student.grade_chapter;
          const r = reverseAttendanceEffect(oldRow, student);
          reverseAction = r.action;
          if (r.newGradeChapter || r.newFaProgressJson) {
            newGradeChapter = await applyToStudent(client, student.id, r.newGradeChapter, r.newFaProgressJson);
            studentAffected = true;
          } else {
            newGradeChapter = oldGradeChapter;
          }
        }
      } else if (oldStatus === 'absent' && newStatus === 'attended') {
        // Apply forward effect of the NEW row on the NEW student
        const student = await lookupStudent(client, body.studentName, body.branch);
        if (student) {
          studentName     = student.name;
          oldGradeChapter = student.grade_chapter;
          const map = new Map();
          map.set(`${normalizeName(student.name)}::${body.branch.trim()}`, student);
          const fwd = await processAttendanceRow({
            studentName: body.studentName,
            branch: body.branch,
            attendanceStatus: 'attended',
            lessonName: body.lessonName,
          }, map);
          reverseAction = fwd.action;
          if (fwd.newGradeChapter || fwd.newFaProgressJson) {
            newGradeChapter = await applyToStudent(client, student.id, fwd.newGradeChapter, fwd.newFaProgressJson);
            studentAffected = true;
          } else {
            newGradeChapter = oldGradeChapter;
          }
        }
      }
    }

    await client.query('COMMIT');

    const updated = await pool.query(`SELECT * FROM student_attendance WHERE id = $1`, [id]);
    const message = studentAffected
      ? `Row updated. Student grade auto-adjusted (${reverseAction}): ${oldGradeChapter} → ${newGradeChapter}`
      : 'Row updated.';

    return res.json({
      success: true,
      row:  rowToCamel(updated.rows[0]),
      data: rowToCamel(updated.rows[0]),
      studentAffected,
      studentName,
      oldGradeChapter,
      newGradeChapter,
      reverseAction,
      message,
    });
  } catch (err) {
    if (client) { try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ } }
    if (err instanceof z.ZodError) return next(err);
    // eslint-disable-next-line no-console
    console.error('[student-attendance PUT] failed:', err);
    return res.status(500).json({ error: err?.message || 'Update failed' });
  } finally {
    if (client) client.release();
  }
});

// ── DELETE /api/student-attendance (all or by branch) ──────────────────────

router.delete('/', async (req, res, next) => {
  try {
    const { branch } = req.query;
    if (branch && branch !== 'All') {
      await pool.query(`DELETE FROM student_attendance WHERE branch = $1`, [branch]);
    } else {
      await pool.query(`DELETE FROM student_attendance`);
    }
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

// ── DELETE /api/student-attendance/:id (single row, with auto-reverse) ────

router.delete('/:id', async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const existing = await client.query(`SELECT * FROM student_attendance WHERE id = $1`, [id]);
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Attendance row not found' });
    }
    const oldRow = existing.rows[0];
    const wasAttended = String(oldRow.attendance_status || '').trim().toLowerCase() === 'attended';

    let studentAffected = false;
    let studentName     = oldRow.student_name || null;
    let oldGradeChapter = null;
    let newGradeChapter = null;
    let reverseAction   = null;

    if (wasAttended) {
      const student = await lookupStudent(client, oldRow.student_name, oldRow.branch);
      if (student) {
        studentName     = student.name;
        oldGradeChapter = student.grade_chapter;
        const r = reverseAttendanceEffect(oldRow, student);
        reverseAction = r.action;
        if (r.newGradeChapter || r.newFaProgressJson) {
          newGradeChapter = await applyToStudent(client, student.id, r.newGradeChapter, r.newFaProgressJson);
          studentAffected = true;
        } else {
          newGradeChapter = oldGradeChapter;
        }
      }
    }

    await client.query(`DELETE FROM student_attendance WHERE id = $1`, [id]);
    await client.query('COMMIT');

    const message = studentAffected
      ? `Row deleted. Student grade auto-adjusted (${reverseAction}): ${oldGradeChapter} → ${newGradeChapter}`
      : 'Row deleted.';

    return res.json({
      success: true,
      mayHaveAffectedPromotion: wasAttended, // backward-compat with prior shape
      studentAffected,
      studentName,
      oldGradeChapter,
      newGradeChapter,
      reverseAction,
      message,
    });
  } catch (err) {
    if (client) { try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ } }
    return next(err);
  } finally {
    if (client) client.release();
  }
});

module.exports = { studentAttendanceRouter: router };
