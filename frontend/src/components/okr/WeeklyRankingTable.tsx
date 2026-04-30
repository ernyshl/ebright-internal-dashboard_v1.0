import { useMemo } from 'react';
import { BRANCH_META } from '../../lib/okr/constants';
import { calcMetrics, getRateColor, weekRange, toWednesday } from '../../lib/okr/utils';

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

interface Props {
  weekRecords: any[];
  dashWeek: string;
  setDashWeek: (d: string) => void;
  branchFilter: string;
  setBranchFilter: (b: string) => void;
  branches: string[];
  onSelectBranch: (b: string) => void;
}

// Green→red gradient based on rank position (matches Finance Branch Ranking style)
function getBarColor(rank: number, total: number) {
  const t = total <= 1 ? 0 : rank / (total - 1);
  const hue = Math.round(142 * (1 - t));
  const sat = Math.round(71 + 13 * t);
  const lig = Math.round(45 + 10 * t);
  return `hsl(${hue}, ${sat}%, ${lig}%)`;
}

function localYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function thisWeekMonday(): string {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localYMD(d);
}

function lastWeekMonday(): string {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7);
  return localYMD(d);
}

export function WeeklyRankingTable({
  weekRecords, dashWeek, setDashWeek,
  branchFilter, setBranchFilter, branches, onSelectBranch,
}: Props) {

  // Parse current dashWeek into year/month for the dropdowns
  const dw = new Date((dashWeek || thisWeekMonday()) + 'T00:00:00');
  const selectedYear  = dw.getFullYear();
  const selectedMonth = dw.getMonth() + 1; // 1-12

  const years = useMemo(() => {
    const now = new Date().getFullYear();
    return [now - 1, now, now + 1];
  }, []);

  const handleMonthChange = (newMonth: number) => {
    // Snap to first Monday of the new month/year
    const firstOfMonth = new Date(selectedYear, newMonth - 1, 1);
    firstOfMonth.setDate(firstOfMonth.getDate() + ((8 - firstOfMonth.getDay()) % 7 || 7) - 7);
    if (firstOfMonth.getMonth() + 1 !== newMonth) firstOfMonth.setDate(firstOfMonth.getDate() + 7);
    setDashWeek(toWednesday(localYMD(firstOfMonth)));
  };

  const handleYearChange = (newYear: number) => {
    const d = new Date(newYear, selectedMonth - 1, dw.getDate());
    setDashWeek(toWednesday(localYMD(d)));
  };

  const thisMon = thisWeekMonday();
  const lastMon = lastWeekMonday();
  const isThisWeek = dashWeek === thisMon;
  const isLastWeek = dashWeek === lastMon;

  // Build ranked rows
  const rows = useMemo(() => {
    const ranked = weekRecords
      .map(r => ({ rec: r, m: calcMetrics(r) }))
      .sort((a, b) => b.m.attendanceRate - a.m.attendanceRate);
    return ranked;
  }, [weekRecords]);

  const filteredRows = branchFilter
    ? rows.filter(x => x.rec.branch === branchFilter)
    : rows;

  // Card container
  return (
    <div style={{ background: '#fff', border: '1.5px solid var(--border)', borderRadius: 12, padding: '16px 18px', marginBottom: 18, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>

      {/* Title */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text)' }}>
            🏆 Branch Rankings — Attendance Rate
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--textSecondary)', marginTop: 2 }}>
            Week of {weekRange(dashWeek)} · {filteredRows.length} {filteredRows.length === 1 ? 'branch' : 'branches'}
          </div>
        </div>
      </div>

      {/* Filter row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end', marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--textSecondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Month</label>
          <select
            value={selectedMonth}
            onChange={e => handleMonthChange(Number(e.target.value))}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1.5px solid var(--border)', fontSize: '0.85rem', fontWeight: 600, background: '#fff', cursor: 'pointer', minWidth: 90 }}
          >
            {MONTH_SHORT.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--textSecondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Year</label>
          <select
            value={selectedYear}
            onChange={e => handleYearChange(Number(e.target.value))}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1.5px solid var(--border)', fontSize: '0.85rem', fontWeight: 600, background: '#fff', cursor: 'pointer', minWidth: 90 }}
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--textSecondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pick Date</label>
          <input
            type="date"
            value={dashWeek}
            onChange={e => setDashWeek(toWednesday(e.target.value))}
            style={{ padding: '5px 10px', borderRadius: 6, border: '1.5px solid var(--border)', fontSize: '0.85rem', fontWeight: 600, background: '#fff', cursor: 'pointer', minWidth: 140 }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--textSecondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Branch</label>
          <select
            value={branchFilter}
            onChange={e => setBranchFilter(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1.5px solid var(--border)', fontSize: '0.85rem', fontWeight: 600, background: '#fff', cursor: 'pointer', minWidth: 160 }}
          >
            <option value="">All Branches</option>
            {branches.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--textSecondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Quick Select</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              onClick={() => setDashWeek(thisMon)}
              style={{
                padding: '6px 14px', borderRadius: 6, border: '1.5px solid',
                borderColor: isThisWeek ? 'var(--brand, #e1251b)' : 'var(--border)',
                background: isThisWeek ? 'var(--brand, #e1251b)' : '#fff',
                color: isThisWeek ? '#fff' : 'var(--text)',
                fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer',
              }}
            >
              This Week
            </button>
            <button
              type="button"
              onClick={() => setDashWeek(lastMon)}
              style={{
                padding: '6px 14px', borderRadius: 6, border: '1.5px solid',
                borderColor: isLastWeek ? 'var(--brand, #e1251b)' : 'var(--border)',
                background: isLastWeek ? 'var(--brand, #e1251b)' : '#fff',
                color: isLastWeek ? '#fff' : 'var(--text)',
                fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer',
              }}
            >
              Last Week
            </button>
          </div>
        </div>
      </div>

      {/* Ranking list */}
      {filteredRows.length === 0 ? (
        <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--textSecondary)', fontSize: '0.9rem' }}>
          No data for this week
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {filteredRows.map(({ rec, m }, i) => {
              const rank = i;
              const isTopRanked = !branchFilter; // always show absolute rank if no branch filter
              const globalRank = rows.findIndex(x => x.rec.branch === rec.branch);
              const displayRank = isTopRanked ? rank : globalRank;
              const meta = BRANCH_META[rec.branch] ?? {};
              const rate = m.attendanceRate;
              const barPct = Math.max(0, Math.min(rate, 100));
              const isTop3 = displayRank < 3;
              return (
                <tr
                  key={rec.id ?? rec.branch}
                  onClick={() => onSelectBranch(rec.branch)}
                  style={{ cursor: 'pointer', transition: 'background 0.12s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* Rank */}
                  <td style={{ padding: '8px 10px 8px 0', width: 56, verticalAlign: 'middle' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      minWidth: 36, height: 26, borderRadius: 6, padding: '0 8px',
                      background: isTop3 ? 'linear-gradient(135deg,#fbbf24,#f59e0b)' : '#f1f5f9',
                      color: isTop3 ? '#7c2d12' : 'var(--textSecondary)',
                      fontSize: '0.78rem', fontWeight: 800,
                    }}>
                      #{displayRank + 1}
                    </span>
                  </td>

                  {/* Branch name */}
                  <td style={{ padding: '8px 10px', verticalAlign: 'middle', width: 220 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text)' }}>{rec.branch}</span>
                      {meta.code && (
                        <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--textSecondary)', background: '#f1f5f9', padding: '1px 6px', borderRadius: 4 }}>
                          {meta.code}
                        </span>
                      )}
                      {meta.region && (
                        <span style={{ fontSize: '0.65rem', fontWeight: 600, color: '#5b21b6', background: '#ede9fe', padding: '1px 6px', borderRadius: 4 }}>
                          R{meta.region}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Bar + value */}
                  <td style={{ padding: '8px 0', verticalAlign: 'middle' }}>
                    <div style={{ position: 'relative', height: 24, background: '#f1f5f9', borderRadius: 6, overflow: 'visible' }}>
                      {rate > 0 && (
                        <div
                          style={{
                            position: 'absolute', top: 0, left: 0, height: '100%',
                            width: `${barPct}%`,
                            background: getBarColor(displayRank, rows.length),
                            borderRadius: 6,
                            transition: 'width 0.3s ease',
                          }}
                        />
                      )}
                      <span
                        style={{
                          position: 'absolute', top: '50%', transform: 'translateY(-50%)',
                          left: `calc(${barPct}% + 8px)`,
                          fontSize: '0.78rem', fontWeight: 800,
                          color: getRateColor(rate),
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {rate.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
