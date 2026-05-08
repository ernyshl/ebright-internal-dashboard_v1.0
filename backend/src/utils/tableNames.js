const ALLOWED_STUDENT_TABLES      = new Set(['studentrecords', 'studentrecords_testing']);
const ALLOWED_ARCHIVED_TABLES     = new Set(['archived_students', 'archived_students_testing']);
const ALLOWED_FA_SNAPSHOT_TABLES  = new Set(['fa_backlog_snapshots', 'fa_backlog_snapshots_testing']);
const ALLOWED_PCM_SNAPSHOT_TABLES = new Set(['pcm_backlog_snapshots', 'pcm_backlog_snapshots_testing']);

function pick(envValue, fallback, allowed, varName) {
  const value = (envValue && String(envValue).trim()) || fallback;
  if (!allowed.has(value)) {
    throw new Error(
      `Invalid ${varName}="${value}". Allowed values: ${[...allowed].join(', ')}`
    );
  }
  return value;
}

function getTableNames() {
  return {
    students:     pick(process.env.STUDENT_TABLE,      'studentrecords',         ALLOWED_STUDENT_TABLES,      'STUDENT_TABLE'),
    archived:     pick(process.env.ARCHIVED_TABLE,     'archived_students',      ALLOWED_ARCHIVED_TABLES,     'ARCHIVED_TABLE'),
    faSnapshots:  pick(process.env.FA_SNAPSHOT_TABLE,  'fa_backlog_snapshots',   ALLOWED_FA_SNAPSHOT_TABLES,  'FA_SNAPSHOT_TABLE'),
    pcmSnapshots: pick(process.env.PCM_SNAPSHOT_TABLE, 'pcm_backlog_snapshots',  ALLOWED_PCM_SNAPSHOT_TABLES, 'PCM_SNAPSHOT_TABLE'),
  };
}

module.exports = { getTableNames };
