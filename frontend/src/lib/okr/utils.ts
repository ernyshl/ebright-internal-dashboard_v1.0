import { DAYS } from './constants';

export function n(val) {
  const v = parseFloat(val);
  return isNaN(v) ? 0 : v;
}

// Format a Wednesday date string into "D/M – D/M" week range (Wed to Tue)
export function weekRange(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const end = new Date(d);
  end.setDate(d.getDate() + 6);
  return `${d.getDate()}/${d.getMonth() + 1} – ${end.getDate()}/${end.getMonth() + 1}`;
}

// Subtract n weeks from a date string, return YYYY-MM-DD
export function prevWeekDate(dateStr, weeksBack = 1) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - weeksBack * 7);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function localYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Snap any date to the Monday of its Mon–Sun week
export function toMonday(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localYMD(d);
}

// Keep alias for any legacy callers
export const toWednesday = toMonday;

export function calcMetrics(r) {
  const totalAttended = DAYS.reduce((s, d) => s + n(r[`${d.key}_attended`]), 0);
  const totalAbsent   = DAYS.reduce((s, d) => s + n(r[`${d.key}_absent`]), 0);
  const totalFrozen   = DAYS.reduce((s, d) => s + n(r[`${d.key}_frozen`]), 0);
  const totalReplaced = DAYS.reduce((s, d) => s + n(r[`${d.key}_replaced`]), 0);

  // Total Attendance = absent + attended + frozen + replaced (all 5 days)
  const totalAttendance = totalAbsent + totalAttended + totalFrozen + totalReplaced;

  // Attendance Rate = attended / (attended + absent)
  const attendanceRate = (totalAttended + totalAbsent) > 0
    ? (totalAttended / (totalAttended + totalAbsent)) * 100 : 0;

  // Rate WITH FREEZE: Total Attended / Total Attendance
  // Matches Excel formula: =SUM(KD58:KD62)/SUM(KD53:KD64) — all attended ÷ all (absent+attended+frozen+replaced)
  const attendanceRateWithFreeze = totalAttendance > 0
    ? (totalAttended / totalAttendance) * 100 : 0;

  // Discrepancy = Active Students − Total Attendance
  const discrepancy = n(r.active_students) - totalAttendance;
  const totalDisc = n(r.not_enrolled) + n(r.outstanding_invoice_disc) + n(r.expired_package) + n(r.newly_enrolled);
  const remainingDisc = discrepancy - totalDisc;

  // Outstanding Invoice % = (Partially Paid + Unpaid) / Active Students × 100
  const outstandingInvoicePct = n(r.active_students) > 0
    ? parseFloat(((n(r.partially_paid_unpaid) / n(r.active_students)) * 100).toFixed(2))
    : 0;

  return {
    totalAttended, totalAbsent, totalFrozen, totalReplaced,
    totalAttendance, attendanceRate, attendanceRateWithFreeze,
    discrepancy, totalDisc, remainingDisc, outstandingInvoicePct,
  };
}

// Parse a pasted Excel roster (each line: "Name <tab/spaces> status") into
// per-status newline-separated name lists. Recognises attended / absent /
// frozen / replaced (case-insensitive). Lines without a recognisable status
// are ignored.
export function parseStudentRoster(raw: string): {
  attended: string;
  absent: string;
  frozen: string;
  replaced: string;
  unrecognised: string[];
} {
  const lines = (raw || '').split(/\r?\n/);
  const buckets: Record<string, string[]> = { attended: [], absent: [], frozen: [], replaced: [] };
  const unrecognised: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Split into columns on tabs first, then fall back to 2+ spaces. The
    // last non-empty column is treated as the status, everything before
    // it is the name.
    const cols = trimmed.includes('\t')
      ? trimmed.split('\t').map(s => s.trim()).filter(Boolean)
      : trimmed.split(/ {2,}/).map(s => s.trim()).filter(Boolean);

    if (cols.length < 2) { unrecognised.push(trimmed); continue; }

    const status = cols[cols.length - 1].toLowerCase();
    const name = cols.slice(0, -1).join(' ').trim();
    if (!name) { unrecognised.push(trimmed); continue; }

    if (status.startsWith('atten'))      buckets.attended.push(name);
    else if (status.startsWith('abs'))   buckets.absent.push(name);
    else if (status.startsWith('fr'))    buckets.frozen.push(name);
    else if (status.startsWith('rep'))   buckets.replaced.push(name);
    else                                  unrecognised.push(trimmed);
  }

  return {
    attended: buckets.attended.join('\n'),
    absent:   buckets.absent.join('\n'),
    frozen:   buckets.frozen.join('\n'),
    replaced: buckets.replaced.join('\n'),
    unrecognised,
  };
}

export function getRateColor(rate) {
  if (rate >= 85) return 'var(--success)';
  if (rate >= 75) return 'var(--warning)';
  return 'var(--brand)';
}

export function formatPct(v, d = 1) {
  return `${parseFloat(v || 0).toFixed(d)}%`;
}

// Parse tab-separated Excel paste (handles flexible headers)
export function parseExcelPaste(text) {
  const lines = text.trim().split(/\r?\n/).map(l => l.split('\t').map(c => c.trim()));
  const DAY_KEYS = { wed: 1, thu: 1, fri: 1, sat: 1, sun: 1 };
  const PATT = {
    absent:   /abs/i,
    attended: /att/i,
    replaced: /rep/i,
    frozen:   /fr(o|e)/i,
  };

  const headerIdx = lines.findIndex(row =>
    row.some(c => c && Object.values(PATT).some(p => p.test(c)))
  );

  const fields = {};
  let totals = null;

  if (headerIdx !== -1) {
    const headers = lines[headerIdx];
    const col = {
      absent:   headers.findIndex(h => PATT.absent.test(h)),
      attended: headers.findIndex(h => PATT.attended.test(h)),
      replaced: headers.findIndex(h => PATT.replaced.test(h)),
      frozen:   headers.findIndex(h => PATT.frozen.test(h)),
    };

    // Compute offset: if the header has no blank cell before the data columns,
    // data rows will have an extra day-name column that shifts all indices by 1.
    const minCol = Math.min(...Object.values(col).filter(v => v >= 0));
    let colOff = 0; // determined on first data row found

    for (let i = headerIdx + 1; i < lines.length; i++) {
      const row = lines[i];
      let dayKey = null;
      let dayColIdx = -1;
      for (let c = 0; c < Math.min(8, row.length); c++) {
        const candidate = row[c].toLowerCase().slice(0, 3);
        if (DAY_KEYS[candidate]) { dayKey = candidate; dayColIdx = c; break; }
      }
      if (dayKey) {
        // On first data row, decide offset: if the day name sits at or after
        // where the header thinks column data starts, the header is missing the day column.
        if (colOff === 0 && dayColIdx >= minCol) colOff = dayColIdx + 1 - minCol;
        const o = colOff;
        if (col.absent   >= 0) fields[`${dayKey}_absent`]   = row[col.absent   + o] || '0';
        if (col.attended >= 0) fields[`${dayKey}_attended`] = row[col.attended + o] || '0';
        if (col.replaced >= 0) fields[`${dayKey}_replaced`] = row[col.replaced + o] || '0';
        if (col.frozen   >= 0) fields[`${dayKey}_frozen`]   = row[col.frozen   + o] || '0';
      } else {
        const o = colOff;
        const hasNums = Object.values(col).some(ci => ci >= 0 && row[ci + o] && !isNaN(+row[ci + o]));
        if (hasNums) {
          totals = {
            absent:   col.absent   >= 0 ? (+row[col.absent   + o] || 0) : 0,
            attended: col.attended >= 0 ? (+row[col.attended + o] || 0) : 0,
            replaced: col.replaced >= 0 ? (+row[col.replaced + o] || 0) : 0,
            frozen:   col.frozen   >= 0 ? (+row[col.frozen   + o] || 0) : 0,
          };
          const nums = row.filter(c => c !== '' && !isNaN(+c)).map(Number);
          totals.grand = nums.length ? nums[nums.length - 1] : null;
        }
      }
    }
  } else {
    // Positional fallback — no header row
    for (const row of lines) {
      let dayKey = null;
      let dayColIdx = -1;
      for (let c = 0; c < Math.min(8, row.length); c++) {
        const candidate = row[c].toLowerCase().slice(0, 3);
        if (DAY_KEYS[candidate]) { dayKey = candidate; dayColIdx = c; break; }
      }
      if (!dayKey) continue;
      const nums = [];
      for (let c = dayColIdx + 1; c < row.length; c++) {
        if (row[c] !== '' && !isNaN(+row[c])) nums.push(+row[c]);
      }
      if (nums.length >= 2) {
        fields[`${dayKey}_absent`]   = String(nums[0]);
        fields[`${dayKey}_attended`] = String(nums[1]);
        fields[`${dayKey}_replaced`] = String(nums[2] ?? 0);
        fields[`${dayKey}_frozen`]   = String(nums[3] ?? 0);
      }
    }
  }

  return Object.keys(fields).length > 0 ? { fields, totals } : null;
}
