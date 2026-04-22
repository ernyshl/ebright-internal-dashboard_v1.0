const express = require('express');
const { prisma } = require('../prismaClient');

const router = express.Router();

// ── helpers ──────────────────────────────────────────────────────────────────

function rowToStudent(r) {
  const [grade = 'G1', chapter = 'C1'] = String(r.grade_chapter || 'G1 — C1').split(' — ');
  return {
    id:             r.id,
    name:           r.name,
    status:         r.status,
    gender:         r.gender,
    branch:         r.branch,
    enrollmentDate: r.enrollment_date ? new Date(r.enrollment_date).toISOString().slice(0, 10) : '',
    grade,
    chapter,
    faAttended:     Array.isArray(r.fa_progress_json)  ? r.fa_progress_json  : [],
    pcmAttended:    Array.isArray(r.pcm_progress_json) ? r.pcm_progress_json : [],
  };
}

function toTotalStr(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return '0/0';
  return `${arr.filter(Boolean).length}/${arr.length}`;
}

// ── GET /api/student-records ─────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const { branch } = req.query;
    const rows = await prisma.$queryRawUnsafe(
      branch
        ? `SELECT * FROM studentrecords WHERE branch = $1 ORDER BY name ASC`
        : `SELECT * FROM studentrecords ORDER BY name ASC`,
      ...(branch ? [branch] : [])
    );
    return res.json({ data: rows.map(rowToStudent) });
  } catch (err) {
    return next(err);
  }
});

// ── POST /api/student-records/bulk  (add many at once) ─────────────────────

router.post('/bulk', async (req, res, next) => {
  const { students } = req.body;
  if (!Array.isArray(students) || students.length === 0)
    return res.status(400).json({ error: 'students array required' });

  try {
    for (const s of students) {
      await prisma.$queryRawUnsafe(
        `INSERT INTO studentrecords
           (name, status, gender, branch, enrollment_date, grade_chapter,
            fa_progress_json, total_fa, pcm_progress_json, total_pcm)
         VALUES ($1,$2,$3,$4,$5::date,$6,$7::jsonb,$8,$9::jsonb,$10)`,
        s.name,
        s.status || 'Active',
        s.gender || 'Male',
        s.branch || 'ONL',
        s.enrollmentDate || null,
        `${s.grade || 'G1'} — ${s.chapter || 'C1'}`,
        JSON.stringify(s.faAttended  || []),
        toTotalStr(s.faAttended),
        JSON.stringify(s.pcmAttended || []),
        toTotalStr(s.pcmAttended),
      );
    }
    const rows = await prisma.$queryRawUnsafe(`SELECT * FROM studentrecords ORDER BY name ASC`);
    return res.json({ ok: true, data: rows.map(rowToStudent) });
  } catch (err) {
    return next(err);
  }
});

// ── PUT /api/student-records/:id ─────────────────────────────────────────────

router.put('/:id', async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  const s  = req.body;
  try {
    await prisma.$queryRawUnsafe(
      `UPDATE studentrecords SET
         name=$1, status=$2, gender=$3, branch=$4, enrollment_date=$5::date,
         grade_chapter=$6, fa_progress_json=$7::jsonb, total_fa=$8,
         pcm_progress_json=$9::jsonb, total_pcm=$10
       WHERE id=$11`,
      s.name,
      s.status,
      s.gender,
      s.branch,
      s.enrollmentDate || null,
      `${s.grade} — ${s.chapter}`,
      JSON.stringify(s.faAttended  || []),
      toTotalStr(s.faAttended),
      JSON.stringify(s.pcmAttended || []),
      toTotalStr(s.pcmAttended),
      id,
    );
    const rows = await prisma.$queryRawUnsafe(`SELECT * FROM studentrecords WHERE id=$1`, id);
    return res.json({ ok: true, data: rowToStudent(rows[0]) });
  } catch (err) {
    return next(err);
  }
});

// ── DELETE /api/student-records  (delete ALL) ────────────────────────────────

router.delete('/', async (req, res, next) => {
  try {
    await prisma.$queryRawUnsafe(`DELETE FROM studentrecords`);
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

// ── DELETE /api/student-records/:id ─────────────────────────────────────────

router.delete('/:id', async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  try {
    await prisma.$queryRawUnsafe(`DELETE FROM studentrecords WHERE id=$1`, id);
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

module.exports = { studentRecordsRouter: router };
