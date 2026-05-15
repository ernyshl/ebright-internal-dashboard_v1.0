// Age-group helpers. DOB is expected as ISO date "YYYY-MM-DD" or empty string.
// Age groups:
//   JUNIOR  — 4 to 9 years
//   MIDDLER — 10 to 12 years
//   SENIOR  — 13 to 20 years
//   ''      — no DOB / outside 4–20 range

export function computeAge(dob: string): number | null {
  if (!dob || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  const birth = new Date(dob + 'T00:00:00Z');
  if (isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const m = now.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

export function getAgeGroup(dob: string): '' | 'JUNIOR' | 'MIDDLER' | 'SENIOR' {
  const age = computeAge(dob);
  if (age === null) return '';
  if (age >= 4  && age <= 9)  return 'JUNIOR';
  if (age >= 10 && age <= 12) return 'MIDDLER';
  if (age >= 13 && age <= 20) return 'SENIOR';
  return '';
}

export function getAgeGroupColor(group: ReturnType<typeof getAgeGroup>): { fg: string; bg: string } {
  switch (group) {
    case 'JUNIOR':  return { fg: '#16a34a', bg: 'rgba(34,197,94,0.15)'   }; // green
    case 'MIDDLER': return { fg: '#2563eb', bg: 'rgba(59,130,246,0.15)'  }; // blue
    case 'SENIOR':  return { fg: '#7c3aed', bg: 'rgba(124,58,237,0.15)'  }; // purple
    default:        return { fg: '#64748b', bg: 'transparent'             }; // muted
  }
}
