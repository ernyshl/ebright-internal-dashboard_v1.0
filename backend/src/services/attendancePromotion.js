const { pool } = require('../db');
const { normalizeName } = require('../utils/normalizeName');
const { parseGradeChapter, formatGradeChapter, chapterNum, GRADES } = require('../utils/gradeChapter');
const { isFoundationLesson } = require('../utils/lessonKeywords');
const { bumpChapter } = require('../utils/chapterBump');
const { getTableNames } = require('../utils/tableNames');

const VALID_STATUSES = new Set(['attended', 'absent']);

function tickFaAt(faProgress, index) {
  const arr = Array.isArray(faProgress) ? faProgress.slice() : [];
  while (arr.length < index + 1) arr.push(false);
  arr[index] = true;
  return arr;
}

async function processAttendanceRow(attendanceRow, studentMap) {
  const result = {
    studentId: null,
    action: '',
    newGradeChapter: null,
    newFaProgressJson: null,
    warning: null,
  };

  // Step 1: Validate input
  const name = (attendanceRow?.studentName ?? '').toString().trim();
  if (!name) {
    result.action = 'SKIP_INVALID';
    result.warning = 'Missing student name';
    return result;
  }
  const rawStatus = (attendanceRow?.attendanceStatus ?? '').toString().trim();
  const status = rawStatus.toLowerCase();
  if (!VALID_STATUSES.has(status)) {
    result.action = 'SKIP_INVALID';
    result.warning = `Invalid status: ${rawStatus}`;
    return result;
  }
  const branch = (attendanceRow?.branch ?? '').toString().trim();

  // Step 2: Find student
  const key = `${normalizeName(name)}::${branch}`;
  const student = studentMap?.get?.(key);
  if (!student) {
    result.action = 'SKIP_NOT_FOUND';
    result.warning = `Student '${name}' not found in branch '${branch}'`;
    return result;
  }
  result.studentId = student.id ?? null;

  // Step 3: Parse current grade & chapter
  const parsed = parseGradeChapter(student.grade_chapter);
  if (!parsed) {
    result.action = 'SKIP_INVALID';
    result.warning = `Invalid grade_chapter format: ${student.grade_chapter}`;
    return result;
  }
  const { grade, chapter } = parsed;
  const cnum = chapterNum(chapter);
  const isAttended = status === 'attended';
  const isFoundation = isFoundationLesson(attendanceRow?.lessonName);

  // Step 5: Apply rules
  if (!isFoundation) {
    // CASE A: NORMAL lesson
    if (!isAttended) {
      result.action = 'NO_CHANGE';
      return result;
    }
    if (cnum === 12) {
      const next = bumpChapter(grade, chapter);
      if (next.grade === grade && next.chapter === chapter) {
        // At GB4-C12, can't go higher — leave unchanged
        result.action = 'NO_CHANGE';
        return result;
      }
      result.action = 'PROMOTE_GRADE';
      result.newGradeChapter = formatGradeChapter(next.grade, next.chapter);
      return result;
    }
    const next = bumpChapter(grade, chapter);
    result.action = 'PROMOTE_CHAPTER';
    result.newGradeChapter = formatGradeChapter(next.grade, next.chapter);
    return result;
  }

  // CASE B: FOUNDATION lesson
  if (cnum === 11) {
    const next = bumpChapter(grade, chapter); // C11 → C12 within same grade
    result.action = 'PROMOTE_CHAPTER';
    result.newGradeChapter = formatGradeChapter(next.grade, next.chapter);
    if (isAttended) {
      const faIndex = GRADES.indexOf(grade);
      if (faIndex >= 0) {
        result.newFaProgressJson = tickFaAt(student.fa_progress_json, faIndex);
      }
    }
    return result;
  }

  if (cnum === 12) {
    if (!isAttended) {
      result.action = 'NO_CHANGE';
      return result;
    }
    const faIndex = GRADES.indexOf(grade);
    if (faIndex < 0) {
      // Defensive — parseGradeChapter already validated grade
      result.action = 'NO_CHANGE';
      return result;
    }
    result.action = 'TICK_FA';
    result.newFaProgressJson = tickFaAt(student.fa_progress_json, faIndex);
    return result;
  }

  // C1-C10 with a Foundation lesson — not eligible
  result.action = 'SKIP_NOT_ELIGIBLE';
  result.warning = `Student '${name}' is at ${formatGradeChapter(grade, chapter)} but attended a Foundation lesson — likely a teacher data entry error`;
  return result;
}

// ── Batch processor ────────────────────────────────────────────────────────

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function nullIfEmpty(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

function dateScore(value) {
  if (!value) return Infinity;
  const s = String(value).trim();
  if (!s || !ISO_DATE_RE.test(s)) return Infinity;
  const t = Date.parse(s);
  return Number.isNaN(t) ? Infinity : t;
}

function emptySummary(total) {
  return {
    success: true,
    totalRows: total,
    inserted: 0,
    duplicates: 0,
    promotionsByAction: {
      PROMOTE_CHAPTER: 0,
      PROMOTE_GRADE: 0,
      TICK_FA: 0,
      NO_CHANGE: 0,
      SKIP_NOT_ELIGIBLE: 0,
      SKIP_NOT_FOUND: 0,
      SKIP_INVALID: 0,
    },
    warnings: [],
    details: [],
  };
}

async function processAttendanceBatch(attendanceRows, branch) {
  if (branch === null || branch === undefined || String(branch).trim() === '') {
    throw new Error('branch is required');
  }
  const trimmedBranch = String(branch).trim();
  const total = Array.isArray(attendanceRows) ? attendanceRows.length : 0;
  const summary = emptySummary(total);

  if (total === 0) {
    summary.warnings.push({ row: null, message: 'No rows to process' });
    return summary;
  }

  const { students: studentsTbl } = getTableNames();

  // Step 2: branch-scoped student lookup
  const studentRes = await pool.query(
    `SELECT id, name, branch, grade_chapter, fa_progress_json
       FROM ${studentsTbl}
      WHERE LOWER(TRIM(branch)) = LOWER(TRIM($1))`,
    [trimmedBranch]
  );
  const studentMap = new Map();
  for (const s of studentRes.rows) {
    const key = `${normalizeName(s.name)}::${trimmedBranch}`;
    if (!studentMap.has(key)) studentMap.set(key, s);
  }

  // Step 3: chronological sort, invalid dates pushed to end, original order preserved within ties
  const indexed = attendanceRows.map((row, idx) => ({ row, idx, score: dateScore(row?.lessonDate) }));
  indexed.sort((a, b) => (a.score === b.score ? a.idx - b.idx : a.score - b.score));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const { row } of indexed) {
      const hasName = row && row.studentName && String(row.studentName).trim() !== '';

      // Step 4: dedupe check (only if we have the key fields to compare)
      let duplicate = false;
      if (hasName && row.lessonName && row.lessonDate && ISO_DATE_RE.test(String(row.lessonDate).trim())) {
        const dup = await client.query(
          `SELECT 1 FROM student_attendance
            WHERE LOWER(TRIM(student_name)) = LOWER(TRIM($1))
              AND lesson_name = $2
              AND lesson_date = $3::date
              AND LOWER(TRIM(branch)) = LOWER(TRIM($4))
            LIMIT 1`,
          [row.studentName, row.lessonName, row.lessonDate, trimmedBranch]
        );
        duplicate = dup.rows.length > 0;
      }

      if (duplicate) {
        summary.duplicates++;
        summary.details.push({ row, result: null, duplicate: true, inserted: false });
        continue;
      }

      // Step 5a: compute promotion plan with current studentMap state
      const normalizedRow = { ...row, branch: trimmedBranch };
      const result = await processAttendanceRow(normalizedRow, studentMap);
      summary.promotionsByAction[result.action] = (summary.promotionsByAction[result.action] || 0) + 1;
      if (result.warning) summary.warnings.push({ row, message: result.warning });

      // Step 5b: insert into student_attendance (skip only SKIP_INVALID)
      let inserted = false;
      if (result.action !== 'SKIP_INVALID') {
        await client.query(
          `INSERT INTO student_attendance
             (student_name, branch, attendance_status, lesson_name, lesson_teachers, lesson_date, day, attendance_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            row.studentName,
            trimmedBranch,
            nullIfEmpty(row.attendanceStatus),
            nullIfEmpty(row.lessonName),
            nullIfEmpty(row.lessonTeachers),
            nullIfEmpty(row.lessonDate),
            nullIfEmpty(row.day),
            nullIfEmpty(row.attendanceBy),
          ]
        );
        inserted = true;
        summary.inserted++;
      }

      // Step 5c: apply promotion to studentrecords if applicable
      const isMutating =
        result.action === 'PROMOTE_CHAPTER' ||
        result.action === 'PROMOTE_GRADE' ||
        result.action === 'TICK_FA';

      if (isMutating && result.studentId) {
        await client.query(
          `UPDATE ${studentsTbl}
              SET grade_chapter   = COALESCE($1, grade_chapter),
                  fa_progress_json = COALESCE($2::jsonb, fa_progress_json)
            WHERE id = $3`,
          [
            result.newGradeChapter,
            result.newFaProgressJson ? JSON.stringify(result.newFaProgressJson) : null,
            result.studentId,
          ]
        );

        // Mutate map so chronological subsequent rows see fresh state
        const key = `${normalizeName(row.studentName)}::${trimmedBranch}`;
        const cached = studentMap.get(key);
        if (cached) {
          if (result.newGradeChapter)   cached.grade_chapter    = result.newGradeChapter;
          if (result.newFaProgressJson) cached.fa_progress_json = result.newFaProgressJson;
        }
      }

      summary.details.push({ row, result, duplicate: false, inserted });
    }

    await client.query('COMMIT');
    return summary;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

// ── Reverse helper ─────────────────────────────────────────────────────────

function untickFaAt(faProgress, index) {
  const arr = Array.isArray(faProgress) ? faProgress.slice() : [];
  if (index < 0) return arr;
  while (arr.length < index + 1) arr.push(false);
  arr[index] = false;
  return arr;
}

/**
 * Compute how to reverse the effect of an attendance row on a student.
 *
 * Returns { newGradeChapter, newFaProgressJson, action } where:
 *   - REVERSE_CHAPTER  : chapter goes down by 1 within the same grade
 *   - REVERSE_GRADE    : student moves back to previous grade's C12
 *   - UNTICK_FA        : FA box for current grade is un-ticked (chapter unchanged)
 *   - NO_REVERSE       : nothing to reverse (absent rows, G1-C1 floor, missing data)
 *
 * Pure function — no DB calls. Caller is responsible for applying the result.
 */
function reverseAttendanceEffect(row, student) {
  const result = { newGradeChapter: null, newFaProgressJson: null, action: 'NO_REVERSE' };
  if (!row || !student) return result;

  const status = String(row.attendance_status ?? row.attendanceStatus ?? '').trim().toLowerCase();
  if (status !== 'attended') return result;

  const lesson = row.lesson_name ?? row.lessonName ?? '';
  const isFoundation = isFoundationLesson(lesson);

  const parsed = parseGradeChapter(student.grade_chapter);
  if (!parsed) return result;
  const { grade, chapter } = parsed;

  if (isFoundation) {
    const faIndex = GRADES.indexOf(grade);
    if (faIndex < 0) return result;
    result.newFaProgressJson = untickFaAt(student.fa_progress_json, faIndex);
    result.action = 'UNTICK_FA';
    return result;
  }

  // Normal attended → reverse chapter / grade
  const cnum = chapterNum(chapter);
  if (cnum > 1) {
    result.newGradeChapter = formatGradeChapter(grade, `C${cnum - 1}`);
    result.action = 'REVERSE_CHAPTER';
    return result;
  }

  // chapter is C1 — try to step back a grade
  const idx = GRADES.indexOf(grade);
  if (idx > 0) {
    const prev = GRADES[idx - 1];
    result.newGradeChapter = formatGradeChapter(prev, 'C12');
    result.action = 'REVERSE_GRADE';
    return result;
  }

  // G1-C1: silent floor — nothing to reverse
  return result;
}

module.exports = { processAttendanceRow, processAttendanceBatch, reverseAttendanceEffect };
