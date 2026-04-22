import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ALL_BRANCHES, BRANCH_META, DAYS } from '../../lib/okr/constants';
import { weekRange } from '../../lib/okr/utils';
import { USE_MOCK, MOCK_WEEK, MOCK_RECORDS } from '../../lib/okr/mock';
import { apiFetch } from '../../lib/api';

function toWednesday(dateStr: string) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  d.setDate(d.getDate() - (d.getDay() - 3 + 7) % 7);
  return d.toISOString().slice(0, 10);
}

function thisWeekWed() {
  return toWednesday(new Date().toISOString().slice(0, 10));
}

export function DailyAttendanceView() {
  const [weekDate, setWeekDate] = useState(USE_MOCK ? MOCK_WEEK : thisWeekWed());
  const [day, setDay] = useState('thu');

  const { data, isLoading } = useQuery({
    queryKey: ['okr-week', weekDate],
    queryFn: () => USE_MOCK
      ? { records: MOCK_RECORDS }
      : apiFetch(`/api/okr-attendance?week_date=${weekDate}&limit=100`),
    enabled: !!weekDate,
  });
  const weekRecords: any[] = data?.records ?? [];

  // Auto-select first day that has any data
  useEffect(() => {
    if (!weekRecords.length) return;
    for (const { key } of DAYS) {
      const hasData = weekRecords.some(r =>
        (r[`${key}_attended`] || 0) + (r[`${key}_absent`] || 0) > 0
      );
      if (hasData) { setDay(key); return; }
    }
  }, [weekRecords.length]);

  const totals = DAYS.reduce((acc, { key }) => {
    acc[key] = weekRecords.reduce((s, r) => ({
      absent:   s.absent   + (r[`${key}_absent`]   || 0),
      attended: s.attended + (r[`${key}_attended`] || 0),
      frozen:   s.frozen   + (r[`${key}_frozen`]   || 0),
      replaced: s.replaced + (r[`${key}_replaced`] || 0),
    }), { absent: 0, attended: 0, frozen: 0, replaced: 0 });
    return acc;
  }, {} as Record<string, { absent: number; attended: number; frozen: number; replaced: number }>);

  const dayTotal = totals[day] ?? { absent: 0, attended: 0, frozen: 0, replaced: 0 };
  const attendanceRate = dayTotal.attended + dayTotal.absent > 0
    ? (dayTotal.attended / (dayTotal.attended + dayTotal.absent) * 100).toFixed(1)
    : '—';

  return (
    <div className="okrDailyBulk">

      {/* Controls */}
      <div className="okrDailyBulkControls">
        <div className="formGroup">
          <label>Week</label>
          <input type="date" value={weekDate}
            onChange={e => setWeekDate(toWednesday(e.target.value))} />
          {weekDate && <div className="okrWeekRangePill">{weekRange(weekDate)} (Wed)</div>}
        </div>
        <div className="formGroup">
          <label>View Day</label>
          <div className="okrDayTabs">
            {DAYS.map(d => (
              <button key={d.key} type="button"
                className={`okrDayTab${day === d.key ? ' okrDayTabActive' : ''}`}
                onClick={() => setDay(d.key)}>
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary pills */}
      {weekRecords.length > 0 && (
        <div className="okrLivePills" style={{ marginBottom: 16 }}>
          <div className="okrLivePill">
            <span>Attended</span>
            <strong style={{ color: 'var(--success, #00a859)' }}>{dayTotal.attended}</strong>
          </div>
          <div className="okrLivePill">
            <span>Absent</span>
            <strong style={{ color: 'var(--brand, #e1251b)' }}>{dayTotal.absent}</strong>
          </div>
          <div className="okrLivePill">
            <span>Frozen</span>
            <strong style={{ color: '#0ea5e9' }}>{dayTotal.frozen}</strong>
          </div>
          <div className="okrLivePill">
            <span>Replaced</span>
            <strong style={{ color: '#f59e0b' }}>{dayTotal.replaced}</strong>
          </div>
          <div className="okrLivePill">
            <span>Attendance Rate</span>
            <strong>{attendanceRate}{attendanceRate !== '—' ? '%' : ''}</strong>
          </div>
        </div>
      )}

      {/* Read-only table */}
      {isLoading ? (
        <p className="okrHistLoading">Loading...</p>
      ) : weekRecords.length === 0 ? (
        <div className="okrEmptyHero okrEmptySmall">
          <div className="okrEmptyIcon">📭</div>
          <h3>No data for this week</h3>
          <p>Daily data is entered via the Data Entry tab</p>
        </div>
      ) : (
        <div className="okrBulkTableWrap">
          <div className="okrBulkTable">
            <div className="okrBulkHead">
              <span>Branch</span>
              <span>Region</span>
              <span>Absent</span>
              <span>Attended</span>
              <span>Frozen</span>
              <span>Replaced</span>
            </div>
            {ALL_BRANCHES.map((b, i) => {
              const rec = weekRecords.find(r => r.branch === b);
              const meta = BRANCH_META[b];
              const absent   = rec?.[`${day}_absent`]   ?? 0;
              const attended = rec?.[`${day}_attended`] ?? 0;
              const frozen   = rec?.[`${day}_frozen`]   ?? 0;
              const replaced = rec?.[`${day}_replaced`] ?? 0;
              const hasData  = absent + attended + frozen + replaced > 0;
              return (
                <div key={b} className={`okrBulkRow${i % 2 === 0 ? ' okrBulkRowAlt' : ''}`}
                  style={{ opacity: hasData ? 1 : 0.45 }}>
                  <span className="okrBulkBranch">{b}</span>
                  <span>
                    <span className={`okrRegionPill okrRegion${meta?.region}`}>R{meta?.region}</span>
                  </span>
                  <span style={{ color: absent > 0 ? 'var(--brand, #e1251b)' : undefined, fontWeight: absent > 0 ? 600 : undefined }}>
                    {absent || '—'}
                  </span>
                  <span style={{ color: attended > 0 ? 'var(--success, #00a859)' : undefined, fontWeight: attended > 0 ? 600 : undefined }}>
                    {attended || '—'}
                  </span>
                  <span style={{ color: frozen > 0 ? '#0ea5e9' : undefined }}>
                    {frozen || '—'}
                  </span>
                  <span style={{ color: replaced > 0 ? '#f59e0b' : undefined }}>
                    {replaced || '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
