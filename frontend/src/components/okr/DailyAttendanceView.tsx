import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ALL_BRANCHES, BRANCH_META, DAYS } from '../../lib/okr/constants';
import { weekRange, getRateColor } from '../../lib/okr/utils';
import { USE_MOCK, MOCK_WEEK, MOCK_RECORDS } from '../../lib/okr/mock';
import { apiFetch } from '../../lib/api';
import { RateBar } from './RateBar';

function toWednesday(dateStr: string) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  d.setDate(d.getDate() - (d.getDay() - 3 + 7) % 7);
  return d.toISOString().slice(0, 10);
}
function thisWeekWed() {
  return toWednesday(new Date().toISOString().slice(0, 10));
}
const n = (v: any) => parseInt(v) || 0;

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

  // Auto-select first day that has data
  useEffect(() => {
    if (!weekRecords.length) return;
    for (const { key } of DAYS) {
      if (weekRecords.some(r => (n(r[`${key}_attended`]) + n(r[`${key}_absent`])) > 0)) {
        setDay(key); return;
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekRecords.length]);

  // Per-day company totals (for trend chart)
  const dayTotals = useMemo(() =>
    DAYS.map(({ key, label }) => {
      const attended = weekRecords.reduce((s, r) => s + n(r[`${key}_attended`]), 0);
      const absent   = weekRecords.reduce((s, r) => s + n(r[`${key}_absent`]),   0);
      const frozen   = weekRecords.reduce((s, r) => s + n(r[`${key}_frozen`]),   0);
      const replaced = weekRecords.reduce((s, r) => s + n(r[`${key}_replaced`]), 0);
      const rate     = (attended + absent) > 0 ? (attended / (attended + absent)) * 100 : 0;
      return { key, label, attended, absent, frozen, replaced, rate };
    }),
    [weekRecords]
  );

  const activeDayTotals = dayTotals.find(d => d.key === day)!;
  const maxTotal = Math.max(...dayTotals.map(d => d.attended + d.absent + d.frozen), 1);

  // Per-branch data for selected day, sorted by attendance rate desc
  const branchRows = useMemo(() =>
    ALL_BRANCHES
      .map(b => {
        const rec      = weekRecords.find(r => r.branch === b);
        const attended = n(rec?.[`${day}_attended`]);
        const absent   = n(rec?.[`${day}_absent`]);
        const frozen   = n(rec?.[`${day}_frozen`]);
        const replaced = n(rec?.[`${day}_replaced`]);
        const total    = attended + absent + frozen + replaced;
        const rate     = (attended + absent) > 0 ? (attended / (attended + absent)) * 100 : 0;
        return { branch: b, attended, absent, frozen, replaced, total, rate, hasData: total > 0 };
      })
      .sort((a, b) => {
        if (a.hasData && !b.hasData) return -1;
        if (!a.hasData && b.hasData) return 1;
        return b.rate - a.rate;
      }),
    [weekRecords, day]
  );

  const withData    = branchRows.filter(r => r.hasData);
  const withoutData = branchRows.filter(r => !r.hasData);

  return (
    <div>

      {/* ── Controls ── */}
      <div className="okrDailyBulkControls" style={{ marginBottom: 20 }}>
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

      {isLoading ? (
        <p className="okrHistLoading">Loading...</p>
      ) : weekRecords.length === 0 ? (
        <div className="okrEmptyHero okrEmptySmall">
          <div className="okrEmptyIcon">📭</div>
          <h3>No data for this week</h3>
          <p>Daily data is entered via the Data Entry tab</p>
        </div>
      ) : (
        <>
          {/* ── Summary stat cards ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Attended',   value: activeDayTotals?.attended,  color: '#00a859', bg: '#f0fdf4' },
              { label: 'Absent',     value: activeDayTotals?.absent,    color: '#e1251b', bg: '#fff5f5' },
              { label: 'Frozen',     value: activeDayTotals?.frozen,    color: '#0ea5e9', bg: '#f0f9ff' },
              { label: 'Replaced',   value: activeDayTotals?.replaced,  color: '#f59e0b', bg: '#fffbeb' },
            ].map(s => (
              <div key={s.label} style={{ background: s.bg, borderRadius: 12, padding: '14px 18px', borderLeft: `4px solid ${s.color}` }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value ?? 0}</div>
              </div>
            ))}
            <div style={{ background: '#f8fafc', borderRadius: 12, padding: '14px 18px', borderLeft: `4px solid ${getRateColor(activeDayTotals?.rate ?? 0)}` }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Attendance Rate</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: getRateColor(activeDayTotals?.rate ?? 0), lineHeight: 1 }}>
                {activeDayTotals && (activeDayTotals.attended + activeDayTotals.absent) > 0
                  ? `${activeDayTotals.rate.toFixed(1)}%` : '—'}
              </div>
            </div>
          </div>

          {/* ── Weekly trend bar chart ── */}
          <div className="okrRankCard" style={{ marginBottom: 20 }}>
            <div className="okrRankCardHeader">
              <span className="okrRankCardTitle">📊 Daily Trend — Week of {weekDate}</span>
              <span className="okrRankBadge">{weekRecords.length} branches reporting</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, padding: '8px 0 4px' }}>
              {dayTotals.map(dt => {
                const total  = dt.attended + dt.absent + dt.frozen;
                const attPct = total > 0 ? (dt.attended / maxTotal) * 100 : 0;
                const absPct = total > 0 ? (dt.absent   / maxTotal) * 100 : 0;
                const froPct = total > 0 ? (dt.frozen   / maxTotal) * 100 : 0;
                const isActive = dt.key === day;
                return (
                  <div key={dt.key}
                    onClick={() => setDay(dt.key)}
                    style={{ flex: 1, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: getRateColor(dt.rate) }}>
                      {(dt.attended + dt.absent) > 0 ? `${dt.rate.toFixed(0)}%` : '—'}
                    </div>
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', borderRadius: 6, overflow: 'hidden', border: isActive ? '2px solid var(--brand,#e1251b)' : '2px solid transparent' }}>
                      <div style={{ height: `${attPct * 0.9}px`, minHeight: attPct > 0 ? 4 : 0, background: '#00a859' }} />
                      <div style={{ height: `${absPct * 0.9}px`, minHeight: absPct > 0 ? 4 : 0, background: '#e1251b' }} />
                      <div style={{ height: `${froPct * 0.9}px`, minHeight: froPct > 0 ? 4 : 0, background: '#0ea5e9' }} />
                    </div>
                    <div style={{ fontSize: 12, fontWeight: isActive ? 700 : 400, color: isActive ? 'var(--brand,#e1251b)' : '#374151' }}>{dt.label}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11, color: '#6b7280' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: '#00a859', display: 'inline-block' }} /> Attended</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: '#e1251b', display: 'inline-block' }} /> Absent</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: '#0ea5e9', display: 'inline-block' }} /> Frozen</span>
            </div>
          </div>

          {/* ── Branch rankings ── */}
          {withData.length > 0 && (
            <div className="okrRankCard">
              <div className="okrRankCardHeader">
                <span className="okrRankCardTitle">
                  🏢 Branch Attendance — {DAYS.find(d => d.key === day)?.label}
                </span>
                <span className="okrRankBadge">{withData.length} / {ALL_BRANCHES.length} reported</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {withData.map((r, i) => {
                  const meta  = BRANCH_META[r.branch];
                  const total = r.attended + r.absent;
                  const attW  = total > 0 ? (r.attended / total) * 100 : 0;
                  const absW  = total > 0 ? (r.absent   / total) * 100 : 0;
                  return (
                    <div key={r.branch} className={`okrRankRow`} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6, padding: '10px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="okrRankPos okrRankPosTop">{i + 1}</span>
                        <span className="okrRankBranch">{r.branch}</span>
                        <span className="okrRankCode">{meta?.code}</span>
                        <span className={`okrRegionPill okrRegion${meta?.region}`}>R{meta?.region}</span>
                        <span style={{ marginLeft: 'auto', display: 'flex', gap: 10, fontSize: 12, color: '#6b7280' }}>
                          <span style={{ color: '#00a859', fontWeight: 600 }}>✓ {r.attended}</span>
                          <span style={{ color: '#e1251b', fontWeight: 600 }}>✗ {r.absent}</span>
                          {r.frozen   > 0 && <span style={{ color: '#0ea5e9' }}>❄ {r.frozen}</span>}
                          {r.replaced > 0 && <span style={{ color: '#f59e0b' }}>↩ {r.replaced}</span>}
                        </span>
                        <span className="okrRankPct" style={{ color: getRateColor(r.rate), minWidth: 50, textAlign: 'right' }}>
                          {r.rate.toFixed(1)}%
                        </span>
                      </div>
                      {/* Stacked bar */}
                      <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: '#f3f4f6' }}>
                        <div style={{ width: `${attW}%`, background: '#00a859', transition: 'width 0.4s' }} />
                        <div style={{ width: `${absW}%`, background: '#e1251b', transition: 'width 0.4s' }} />
                      </div>
                      <RateBar value={r.rate} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Not yet reported ── */}
          {withoutData.length > 0 && (
            <div style={{ marginTop: 16, padding: '12px 16px', background: '#f9fafb', borderRadius: 12, border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', marginBottom: 8 }}>
                Not yet reported ({withoutData.length})
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {withoutData.map(r => {
                  const meta = BRANCH_META[r.branch];
                  return (
                    <span key={r.branch} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: '#e5e7eb', color: '#6b7280' }}>
                      {r.branch} <span style={{ opacity: 0.6 }}>{meta?.code}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
