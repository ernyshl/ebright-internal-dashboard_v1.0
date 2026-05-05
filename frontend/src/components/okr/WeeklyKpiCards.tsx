import { useState } from 'react';
import { DAYS } from '../../lib/okr/constants';
import { n, weekRange } from '../../lib/okr/utils';
import { AllBranchesStudentModal } from './AllBranchesStudentModal';

interface Props {
  weekRecords: any[];
  prevWeekRecords: any[];
  dashWeek?: string;
}

const DAY_LABEL: Record<string, string> = {
  wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};

function sumField(records: any[], field: string): number {
  return records.reduce((s, r) => s + n(r[field]), 0);
}

function sumDayCategory(records: any[], day: string, cats: string[]): number {
  return cats.reduce((s, c) => s + sumField(records, `${day}_${c}`), 0);
}

export function WeeklyKpiCards({ weekRecords, prevWeekRecords, dashWeek }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [openStatus, setOpenStatus] = useState<null | 'frozen' | 'replaced' | 'absent' | 'attended'>(null);

  // Total Active Students
  const totalActive = sumField(weekRecords, 'active_students');
  const prevActive  = sumField(prevWeekRecords, 'active_students');
  const activeDiff  = totalActive - prevActive;
  const activePct   = prevActive > 0 ? (activeDiff / prevActive) * 100 : 0;

  // Per-day total = attended + absent (matches Excel "Wednesday Total Attendance" etc.)
  const dailyTotal = DAYS.reduce<Record<string, number>>((acc, d) => {
    acc[d.key] = sumField(weekRecords, `${d.key}_attended`) + sumField(weekRecords, `${d.key}_absent`);
    return acc;
  }, {});

  // Component sums across all days
  const totalAttended = DAYS.reduce((s, d) => s + sumField(weekRecords, `${d.key}_attended`), 0);
  const totalAbsent   = DAYS.reduce((s, d) => s + sumField(weekRecords, `${d.key}_absent`),   0);
  const totalFrozen   = DAYS.reduce((s, d) => s + sumField(weekRecords, `${d.key}_frozen`),   0);
  const totalReplaced = DAYS.reduce((s, d) => s + sumField(weekRecords, `${d.key}_replaced`), 0);

  // Total Weekly Attendance = attended + absent + frozen + replaced (matches Excel)
  const totalAttendance = totalAttended + totalAbsent + totalFrozen + totalReplaced;
  const prevAttendance =
    DAYS.reduce((s, d) => s + sumField(prevWeekRecords, `${d.key}_attended`), 0) +
    DAYS.reduce((s, d) => s + sumField(prevWeekRecords, `${d.key}_absent`),   0) +
    DAYS.reduce((s, d) => s + sumField(prevWeekRecords, `${d.key}_frozen`),   0) +
    DAYS.reduce((s, d) => s + sumField(prevWeekRecords, `${d.key}_replaced`), 0);
  const attDiff = totalAttendance - prevAttendance;
  const attPct  = prevAttendance > 0 ? (attDiff / prevAttendance) * 100 : 0;

  const branchCount = weekRecords.length;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginBottom: 18 }}>

      {/* ── Card 1: Total Active Students ── */}
      <div style={{ background: '#fff', border: '1.5px solid var(--border)', borderRadius: 12, padding: '16px 18px', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: '1.1rem' }}>👥</span>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--textSecondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Total Active Students
          </span>
        </div>
        <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1.1 }}>
          {totalActive.toLocaleString()}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: '0.78rem', fontWeight: 600 }}>
          {prevActive === 0 ? (
            <span style={{ color: 'var(--textSecondary)' }}>No prev-week data</span>
          ) : (
            <>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: activeDiff >= 0 ? '#15803d' : '#b91c1c' }}>
                <span style={{ fontSize: '0.95rem' }}>{activeDiff >= 0 ? '▲' : '▼'}</span>
                {activeDiff >= 0 ? '+' : ''}{activeDiff.toLocaleString()}
                {' '}({activePct >= 0 ? '+' : ''}{activePct.toFixed(1)}%)
              </span>
              <span style={{ color: 'var(--textSecondary)', fontWeight: 500 }}>vs last week</span>
            </>
          )}
        </div>
      </div>

      {/* ── Card 2: Total Student Attendance (clickable) ── */}
      <div
        onClick={() => setExpanded(v => !v)}
        style={{
          background: '#fff', border: '1.5px solid var(--border)', borderRadius: 12,
          padding: '16px 18px', boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
          cursor: 'pointer', transition: 'border-color 0.15s',
          gridColumn: expanded ? '1 / -1' : 'auto',
        }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = '#6366f1')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '1.1rem' }}>📊</span>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--textSecondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Total Student Attendance
            </span>
          </div>
          <span style={{ fontSize: '0.7rem', color: 'var(--textSecondary)', fontWeight: 600 }}>
            {expanded ? '▲ Hide breakdown' : '▼ Click for breakdown'}
          </span>
        </div>
        <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1.1 }}>
          {totalAttendance.toLocaleString()}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: '0.78rem', fontWeight: 600 }}>
          {prevAttendance === 0 ? (
            <span style={{ color: 'var(--textSecondary)' }}>{branchCount} branches uploaded</span>
          ) : (
            <>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: attDiff >= 0 ? '#15803d' : '#b91c1c' }}>
                <span style={{ fontSize: '0.95rem' }}>{attDiff >= 0 ? '▲' : '▼'}</span>
                {attDiff >= 0 ? '+' : ''}{attDiff.toLocaleString()}
                {' '}({attPct >= 0 ? '+' : ''}{attPct.toFixed(1)}%)
              </span>
              <span style={{ color: 'var(--textSecondary)', fontWeight: 500 }}>vs last week</span>
            </>
          )}
        </div>

        {/* Breakdown */}
        {expanded && (
          <div
            onClick={e => e.stopPropagation()}
            style={{ marginTop: 16, paddingTop: 16, borderTop: '1.5px dashed var(--border)' }}
          >
            {/* Row 1: Daily Attendance Wed→Sun (5 fixed columns, matching Absent layout below) */}
            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--textSecondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
              📅 Daily Attendance
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 10 }}>
              {DAYS.map(d => {
                const dayTotal = dailyTotal[d.key];
                return (
                  <div key={d.key} style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--textSecondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {DAY_LABEL[d.key]} Attendance
                    </div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>
                      {dayTotal.toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Row 2: Absent Wed→Sun (matches the Daily Attendance row above) */}
            <div style={{ marginTop: 14, fontSize: '0.7rem', fontWeight: 800, color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
              ⛔ Absent (Daily Breakdown)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 10 }}>
              {DAYS.map(d => {
                const dayAbsent = sumField(weekRecords, `${d.key}_absent`);
                return (
                  <div key={d.key} style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {DAY_LABEL[d.key]} Absent
                    </div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#991b1b', marginTop: 4 }}>
                      {dayAbsent.toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Row 3: Replaced + Frozen + Total Weekly Attendance (3 wide tiles) */}
            <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
              <div
                onClick={(e) => { e.stopPropagation(); setOpenStatus('replaced'); }}
                style={{
                  background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: '10px 14px',
                  cursor: 'pointer', transition: 'transform 0.12s, box-shadow 0.12s',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 10px rgba(146,64,14,0.2)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    🔁 Replaced
                  </div>
                  <span style={{ fontSize: '0.62rem', color: '#92400e', fontWeight: 600 }}>👥 click</span>
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#92400e', marginTop: 4 }}>
                  {totalReplaced.toLocaleString()}
                </div>
              </div>

              <div
                onClick={(e) => { e.stopPropagation(); setOpenStatus('frozen'); }}
                style={{
                  background: '#dbeafe', border: '1px solid #93c5fd', borderRadius: 8, padding: '10px 14px',
                  cursor: 'pointer', transition: 'transform 0.12s, box-shadow 0.12s',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 10px rgba(30,64,175,0.2)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    ❄️ Frozen
                  </div>
                  <span style={{ fontSize: '0.62rem', color: '#1e40af', fontWeight: 600 }}>👥 click</span>
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1e40af', marginTop: 4 }}>
                  {totalFrozen.toLocaleString()}
                </div>
              </div>

              <div style={{ background: '#dcfce7', border: '1.5px solid #86efac', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  ✅ Total Weekly Attendance
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#15803d', marginTop: 4 }}>
                  {totalAttendance.toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <AllBranchesStudentModal
        open={openStatus !== null}
        onClose={() => setOpenStatus(null)}
        status={openStatus ?? 'frozen'}
        weekRangeLabel={dashWeek ? weekRange(dashWeek) : ''}
        weekRecords={weekRecords}
      />
    </div>
  );
}
