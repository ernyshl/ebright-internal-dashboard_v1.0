import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import { BRANCH_META } from '../../lib/okr/constants';
import { calcMetrics, getRateColor, weekRange, toWednesday } from '../../lib/okr/utils';

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

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

type SortDir = 'asc' | 'desc';
type SortKey = 'rank' | 'branch' | 'attended' | 'absent' | 'frozen' | 'replaced' | 'total' | 'active' | 'rate' | 'rateFreeze';

interface Props {
  /** Click on branch row → open the dedicated branch detail page for that branch + week */
  onSelect: (opts: { branch: string; week: string }) => void;
}

export function OkrTableView({ onSelect }: Props) {
  const [weekDate, setWeekDate]             = useState<string>(() => lastWeekMonday());
  const [selectedBranch, setSelectedBranch] = useState<string>('ALL');
  const [sortKey, setSortKey]               = useState<SortKey>('rate');
  const [sortDir, setSortDir]               = useState<SortDir>('desc');

  const dw = new Date((weekDate || thisWeekMonday()) + 'T00:00:00');
  const selectedYear  = dw.getFullYear();
  const selectedMonth = dw.getMonth() + 1;

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['okr-week', weekDate],
    queryFn: () => apiFetch(`/api/okr-attendance?week_date=${weekDate}&limit=100`),
    enabled: !!weekDate,
  });
  const records: any[] = data?.records ?? [];

  const handleThisWeek = () => setWeekDate(thisWeekMonday());
  const handleLastWeek = () => setWeekDate(lastWeekMonday());
  const handleMonthChange = (m: number) => {
    const firstOfMonth = new Date(selectedYear, m - 1, 1);
    firstOfMonth.setDate(firstOfMonth.getDate() + ((8 - firstOfMonth.getDay()) % 7 || 7) - 7);
    if (firstOfMonth.getMonth() + 1 !== m) firstOfMonth.setDate(firstOfMonth.getDate() + 7);
    setWeekDate(toWednesday(localYMD(firstOfMonth)));
  };
  const handleYearChange = (y: number) => {
    const d = new Date(y, selectedMonth - 1, dw.getDate());
    setWeekDate(toWednesday(localYMD(d)));
  };

  const allRows = useMemo(() => {
    return records.map(r => {
      const m = calcMetrics(r);
      const meta = BRANCH_META[r.branch] ?? {};
      return {
        rec: r,
        branch: r.branch,
        code: meta.code ?? r.branch.slice(0, 4),
        region: meta.region ?? '?',
        num: meta.num ?? 99,
        attended: m.totalAttended,
        absent:   m.totalAbsent,
        frozen:   m.totalFrozen,
        replaced: m.totalReplaced,
        total:    m.totalAttendance,
        rate:     m.attendanceRate,
        rateFreeze: m.attendanceRateWithFreeze,
        active: Number(r.active_students ?? 0),
      };
    });
  }, [records]);

  const branchList = useMemo(() => allRows.map(r => r.branch).sort(), [allRows]);

  // Rank by rate desc — fixed regardless of which sort direction the user picks
  const rankByRate = useMemo(() => {
    const sorted = [...allRows].sort((a, b) => b.rate - a.rate);
    const map = new Map<string, number>();
    sorted.forEach((r, i) => map.set(r.branch, i + 1));
    return map;
  }, [allRows]);

  const filteredRows = useMemo(() => {
    let out = selectedBranch === 'ALL' ? allRows : allRows.filter(r => r.branch === selectedBranch);
    out = [...out].sort((a, b) => {
      let av: number | string;
      let bv: number | string;
      if (sortKey === 'rank') {
        av = rankByRate.get(a.branch) ?? 999;
        bv = rankByRate.get(b.branch) ?? 999;
      } else if (sortKey === 'branch') {
        av = a.branch.toLowerCase();
        bv = b.branch.toLowerCase();
      } else {
        av = (a as any)[sortKey] ?? 0;
        bv = (b as any)[sortKey] ?? 0;
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return out;
  }, [allRows, selectedBranch, sortKey, sortDir, rankByRate]);

  const handleSort = (k: SortKey) => {
    if (sortKey === k) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(k);
      // Numeric metrics default to desc (highest first), branch name defaults to asc
      setSortDir(k === 'branch' || k === 'rank' ? 'asc' : 'desc');
    }
  };
  const arrow = (k: SortKey) => sortKey !== k ? ' ↕' : (sortDir === 'asc' ? ' ▲' : ' ▼');

  const totals = useMemo(() => {
    return filteredRows.reduce((acc, r) => ({
      attended: acc.attended + r.attended,
      absent:   acc.absent   + r.absent,
      frozen:   acc.frozen   + r.frozen,
      replaced: acc.replaced + r.replaced,
      total:    acc.total    + r.total,
      active:   acc.active   + r.active,
    }), { attended: 0, absent: 0, frozen: 0, replaced: 0, total: 0, active: 0 });
  }, [filteredRows]);

  const isThisWeek = weekDate === thisWeekMonday();
  const isLastWeek = weekDate === lastWeekMonday();

  const hStyle = (): React.CSSProperties => ({ cursor: 'pointer', userSelect: 'none' });

  return (
    <div className="branchRankingPage">
      <div className="pageHeader" style={{ marginBottom: 18 }}>
        <div className="pageHeaderTitle">🏆 OKR Table — Week of {weekRange(weekDate)}</div>
        <div className="pageHeaderSub">
          Click any branch name to open its weekly dashboard · {filteredRows.length} {filteredRows.length === 1 ? 'branch' : 'branches'}
        </div>
        <div className="refreshButtonContainer">
          <button className="btn btnSmall" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? '⟳ Refreshing…' : '⟳ Refresh'}
          </button>
        </div>
      </div>

      <div className="card brRankFilters" style={{ display: 'flex', flexDirection: 'row', gap: 20, alignItems: 'center', marginBottom: 20, padding: '15px 20px' }}>
        <div className="brRankFilterGroup">
          <label className="brRankLabel">MONTH</label>
          <select className="filterSelect" value={selectedMonth} onChange={e => handleMonthChange(Number(e.target.value))}>
            {MONTH_SHORT.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
        </div>

        <div className="brRankFilterGroup">
          <label className="brRankLabel">YEAR</label>
          <select className="filterSelect" value={selectedYear} onChange={e => handleYearChange(Number(e.target.value))}>
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <div className="brRankFilterGroup">
          <label className="brRankLabel">PICK DATE</label>
          <input
            type="date"
            className="filterSelect"
            value={weekDate}
            onChange={e => setWeekDate(toWednesday(e.target.value))}
            style={{ minWidth: 150 }}
          />
        </div>

        <div className="brRankFilterGroup">
          <label className="brRankLabel">BRANCH</label>
          <select
            className="filterSelect"
            value={selectedBranch}
            onChange={e => setSelectedBranch(e.target.value)}
            style={{ minWidth: 180 }}
          >
            <option value="ALL">All Branches</option>
            {branchList.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>

        <div className="brRankFilterGroup">
          <label className="brRankLabel">QUICK SELECT</label>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className={`btn btnSmall ${isThisWeek ? 'btnPrimary' : 'btnSecondary'}`}
              onClick={handleThisWeek}
              style={{ backgroundColor: isThisWeek ? '#dc2626' : '', color: isThisWeek ? '#fff' : '' }}
            >
              This Week
            </button>
            <button
              className={`btn btnSmall ${isLastWeek ? 'btnPrimary' : 'btnSecondary'}`}
              onClick={handleLastWeek}
              style={{ backgroundColor: isLastWeek ? '#dc2626' : '', color: isLastWeek ? '#fff' : '' }}
            >
              Last Week
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="card"><div className="loadingCard"><div className="loadingDots"><span /><span /><span /></div> Loading…</div></div>
      ) : isError ? (
        <div className="errorText">Failed to load OKR records.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="brRankBarTable w-full text-left border-collapse">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-3 border font-semibold text-center" style={hStyle()} onClick={() => handleSort('rank')}     title="Sort by rank">Rank{arrow('rank')}</th>
                <th className="p-3 border font-semibold"             style={hStyle()} onClick={() => handleSort('branch')}   title="Sort by branch name">Branch{arrow('branch')}</th>
                <th className="p-3 border font-semibold text-center" style={hStyle()} onClick={() => handleSort('attended')} title="Sort by attended">Attended{arrow('attended')}</th>
                <th className="p-3 border font-semibold text-center" style={hStyle()} onClick={() => handleSort('absent')}   title="Sort by absent">Absent{arrow('absent')}</th>
                <th className="p-3 border font-semibold text-center" style={hStyle()} onClick={() => handleSort('frozen')}   title="Sort by frozen">Frozen{arrow('frozen')}</th>
                <th className="p-3 border font-semibold text-center" style={hStyle()} onClick={() => handleSort('replaced')} title="Sort by replaced">Replaced{arrow('replaced')}</th>
                <th className="p-3 border font-bold text-center bg-gray-200" style={hStyle()} onClick={() => handleSort('total')} title="Sort by total attendance">Total Attendance{arrow('total')}</th>
                <th className="p-3 border font-semibold text-center" style={hStyle()} onClick={() => handleSort('active')}   title="Sort by active students">Active{arrow('active')}</th>
                <th className="p-3 border font-bold text-center bg-gray-200" style={hStyle()} onClick={() => handleSort('rate')} title="Sort by attendance rate">Attendance Rate{arrow('rate')}</th>
                <th className="p-3 border font-semibold text-right" style={hStyle()} onClick={() => handleSort('rateFreeze')} title="Sort by rate w/ freeze">Rate w/ Freeze{arrow('rateFreeze')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length > 0 ? filteredRows.map(r => {
                const rank = rankByRate.get(r.branch) ?? 0;
                const isTop3 = rank > 0 && rank <= 3;
                return (
                  <tr key={r.branch} className="hover:bg-gray-50 border-b">
                    <td className="p-3 border text-center">
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        minWidth: 36, height: 26, borderRadius: 6, padding: '0 8px',
                        background: isTop3 ? 'linear-gradient(135deg,#fbbf24,#f59e0b)' : '#f1f5f9',
                        color: isTop3 ? '#7c2d12' : 'var(--textSecondary)',
                        fontSize: '0.78rem', fontWeight: 800,
                      }}>
                        #{rank}
                      </span>
                    </td>
                    <td
                      className="p-3 border font-medium"
                      onClick={() => onSelect({ branch: r.branch, week: weekDate })}
                      style={{ cursor: 'pointer' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{
                          minWidth: 22, height: 22, borderRadius: '50%',
                          background: '#f1f5f9', color: 'var(--textSecondary)',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.65rem', fontWeight: 800,
                        }}>{String(r.num).padStart(2, '0')}</span>
                        <span style={{ fontWeight: 700, color: '#2563eb', textDecoration: 'underline', textUnderlineOffset: 2 }}>
                          {r.branch}
                        </span>
                        <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--textSecondary)', background: '#f1f5f9', padding: '1px 6px', borderRadius: 4 }}>{r.code}</span>
                        <span style={{ fontSize: '0.65rem', fontWeight: 600, color: '#5b21b6', background: '#ede9fe', padding: '1px 6px', borderRadius: 4 }}>R{r.region}</span>
                      </div>
                    </td>
                    <td className="p-3 border text-center" style={{ color: '#15803d' }}>{r.attended}</td>
                    <td className="p-3 border text-center" style={{ color: '#b91c1c' }}>{r.absent}</td>
                    <td className="p-3 border text-center" style={{ color: '#1e40af' }}>{r.frozen}</td>
                    <td className="p-3 border text-center" style={{ color: '#92400e' }}>{r.replaced}</td>
                    <td className="p-3 border text-center font-bold bg-gray-50">{r.total}</td>
                    <td className="p-3 border text-center">{r.active}</td>
                    <td className="p-3 border text-center font-bold bg-gray-50" style={{ color: getRateColor(r.rate) }}>{r.rate.toFixed(2)}%</td>
                    <td className="p-3 border text-right" style={{ color: getRateColor(r.rateFreeze) }}>{r.rateFreeze.toFixed(2)}%</td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={10} className="p-10 text-center text-gray-500">No OKR records found for this week.</td>
                </tr>
              )}
            </tbody>
            {filteredRows.length > 0 && (
              <tfoot className="font-bold text-base" style={{ backgroundColor: '#e2e8f0' }}>
                <tr>
                  <td className="p-3 border text-center">—</td>
                  <td className="p-3 border">TOTALS</td>
                  <td className="p-3 border text-center">{totals.attended}</td>
                  <td className="p-3 border text-center">{totals.absent}</td>
                  <td className="p-3 border text-center">{totals.frozen}</td>
                  <td className="p-3 border text-center">{totals.replaced}</td>
                  <td className="p-3 border text-center text-lg">{totals.total}</td>
                  <td className="p-3 border text-center">{totals.active}</td>
                  <td className="p-3 border text-center">—</td>
                  <td className="p-3 border text-right">—</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
