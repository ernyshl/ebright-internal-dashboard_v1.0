// Age-group helper, matching frontend/src/lib/ageGroup.ts.
// Buckets:  4–9 JUNIOR | 10–12 MIDDLER | 13–20 SENIOR | else NULL

function computeAgeGroup(dob) {
  if (!dob) return null;
  // Accept ISO date string OR Date object.
  const d = typeof dob === 'string'
    ? (/^\d{4}-\d{2}-\d{2}$/.test(dob) ? new Date(dob + 'T00:00:00Z') : new Date(dob))
    : (dob instanceof Date ? dob : null);
  if (!d || isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age -= 1;
  if (age >= 4  && age <= 9)  return 'JUNIOR';
  if (age >= 10 && age <= 12) return 'MIDDLER';
  if (age >= 13 && age <= 20) return 'SENIOR';
  return null;
}

module.exports = { computeAgeGroup };
