const ALLOWED_STUDENT_TABLES  = new Set(['studentrecords', 'studentrecords_testing']);
const ALLOWED_ARCHIVED_TABLES = new Set(['archived_students', 'archived_students_testing']);

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
    students: pick(process.env.STUDENT_TABLE,  'studentrecords',   ALLOWED_STUDENT_TABLES,  'STUDENT_TABLE'),
    archived: pick(process.env.ARCHIVED_TABLE, 'archived_students', ALLOWED_ARCHIVED_TABLES, 'ARCHIVED_TABLE'),
  };
}

module.exports = { getTableNames };
