// Lightweight audit logger for student database changes.
// Best-effort: NEVER throws — if logging fails the parent operation still succeeds.
const { pool } = require('../db');

function isBool(v) { return v === true || v === false; }
function safeStr(v) {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v) || typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

async function writeOne(row) {
  try {
    await pool.query(
      `INSERT INTO student_change_log
         (student_id, student_name, branch, action, field, old_value, new_value, user_email)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        row.student_id ?? null,
        safeStr(row.student_name).slice(0, 200),
        safeStr(row.branch).slice(0, 50),
        safeStr(row.action).slice(0, 20),
        row.field ? safeStr(row.field).slice(0, 100) : null,
        row.old_value !== undefined ? safeStr(row.old_value).slice(0, 500) : null,
        row.new_value !== undefined ? safeStr(row.new_value).slice(0, 500) : null,
        safeStr(row.user_email).slice(0, 200),
      ]
    );
  } catch (_) { /* swallow */ }
}

async function logCreate({ student, userEmail }) {
  await writeOne({
    student_id:   student.id,
    student_name: student.name,
    branch:       student.branch,
    action:       'create',
    user_email:   userEmail,
  });
}

async function logDelete({ studentId, name, branch, userEmail }) {
  await writeOne({
    student_id:   studentId,
    student_name: name,
    branch:       branch,
    action:       'delete',
    user_email:   userEmail,
  });
}

async function logArchive({ studentId, name, branch, userEmail }) {
  await writeOne({
    student_id:   studentId,
    student_name: name,
    branch:       branch,
    action:       'archive',
    user_email:   userEmail,
  });
}

async function logRestore({ studentId, name, branch, userEmail }) {
  await writeOne({
    student_id:   studentId,
    student_name: name,
    branch:       branch,
    action:       'restore',
    user_email:   userEmail,
  });
}

// Diff helper: compares two student objects and writes one log row per field that actually changed.
// Tickbox arrays (faAttended / pcmAttended / workbookAttended) emit per-index `tick`/`untick` rows.
async function logEdit({ before, after, branch, userEmail }) {
  if (!before || !after) return;
  const sid  = after.id ?? before.id;
  const name = after.name || before.name;
  const br   = branch || after.branch || before.branch;

  // Plain scalar fields to compare
  const scalarFields = [
    'name','gender','status','branch','enrollmentDate','dob','grade','chapter',
    'coachName','guardianName','guardianMobile',
  ];
  for (const f of scalarFields) {
    const oldV = before[f] ?? '';
    const newV = after[f] ?? '';
    if (String(oldV) === String(newV)) continue;
    await writeOne({
      student_id: sid, student_name: name, branch: br,
      action: 'edit', field: f, old_value: oldV, new_value: newV, user_email: userEmail,
    });
  }

  // Tickbox arrays — per-index diff. Tick → action='tick', Untick → action='untick'.
  const arrayFields = [
    { key: 'faAttended',       label: 'FA'       },
    { key: 'pcmAttended',      label: 'PCM'      },
    { key: 'workbookAttended', label: 'Workbook' },
  ];
  for (const { key, label } of arrayFields) {
    const oldArr = Array.isArray(before[key]) ? before[key] : [];
    const newArr = Array.isArray(after[key])  ? after[key]  : [];
    const len = Math.max(oldArr.length, newArr.length);
    for (let i = 0; i < len; i++) {
      const o = isBool(oldArr[i]) ? oldArr[i] : false;
      const n = isBool(newArr[i]) ? newArr[i] : false;
      if (o === n) continue;
      await writeOne({
        student_id: sid, student_name: name, branch: br,
        action: n ? 'tick' : 'untick',
        field: `${label} G${i + 1}`,
        old_value: o, new_value: n,
        user_email: userEmail,
      });
    }
  }
}

// Single-field write used by upload backfill paths.
async function logField({ studentId, name, branch, field, oldValue, newValue, userEmail }) {
  if (String(oldValue ?? '') === String(newValue ?? '')) return;
  await writeOne({
    student_id: studentId, student_name: name, branch,
    action: 'edit', field, old_value: oldValue, new_value: newValue, user_email: userEmail,
  });
}

module.exports = {
  logCreate, logDelete, logArchive, logRestore, logEdit, logField,
};
