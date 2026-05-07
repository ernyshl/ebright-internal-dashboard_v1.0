import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { BackButton } from '../components/BackButton';

// --- Types ---
type RenewalData = {
  branch_code: string;
  count_3m: number; count_6m: number; count_9m: number; count_12m: number;
  total_3m: number; total_6m: number; total_9m: number; total_12m: number;
  total_renewals: number;
  grand_total: number;
};

type SortKey =
  | 'count_3m' | 'count_6m' | 'count_9m' | 'count_12m'
  | 'total_3m' | 'total_6m' | 'total_9m' | 'total_12m'
  | 'total_renewals' | 'grand_total';

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// --- Helper Functions ---
const formatRM = (val: number) => 
  new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR' }).format(val);

const getRelativeTime = (dateString?: string) => {
  if (!dateString) return 'Unknown';
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const diffInSeconds = (new Date(dateString).getTime() - Date.now()) / 1000;
  if (Math.abs(diffInSeconds) < 60) return rtf.format(Math.round(diffInSeconds), 'second');
  if (Math.abs(diffInSeconds) < 3600) return rtf.format(Math.round(diffInSeconds / 60), 'minute');
  if (Math.abs(diffInSeconds) < 86400) return rtf.format(Math.round(diffInSeconds / 3600), 'hour');
  return rtf.format(Math.round(diffInSeconds / 86400), 'day');
};

export default function FinanceRenewalByBranchPage() {
  // 1. State for Filters
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedBranch, setSelectedBranch] = useState('ALL');
  const [sortBy, setSortBy] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const handleSort = (key: SortKey) => {
    if (sortBy !== key) {
      setSortBy(key);
      setSortDir('desc');
      return;
    }
    if (sortDir === 'desc') {
      setSortDir('asc');
    } else {
      // Third click resets to default (alphabetical by branch_code)
      setSortBy(null);
      setSortDir('desc');
    }
  };

  const sortIndicator = (key: SortKey) =>
    sortBy === key ? (sortDir === 'desc' ? ' ▼' : ' ▲') : '';

  // 2. Data Query
  const { 
    data: mainData, 
    isLoading, 
    isError, 
    error,
    refetch,
    isFetching
  } = useQuery({
    queryKey: ['finance-renewal-by-branch', selectedMonth, selectedYear],
    queryFn: () => apiFetch(`/api/finance/renewal-by-branch?month=${selectedMonth}&year=${selectedYear}`),
  });

  const { data: freshnessData } = useQuery({
    queryKey: ['finance-renewal-freshness'],
    queryFn: () => apiFetch('/api/finance/renewal-by-branch/freshness'),
    refetchInterval: 60000, 
  });

  // 3. Quick Select Handlers
  const handleThisMonth = () => {
    setSelectedMonth(now.getMonth() + 1);
    setSelectedYear(now.getFullYear());
  };

  const handleLastMonth = () => {
    let m = now.getMonth(); // 0-indexed, so 4 (May) becomes 3 (April)
    let y = now.getFullYear();
    if (m === 0) { m = 12; y -= 1; }
    setSelectedMonth(m);
    setSelectedYear(y);
  };

  // 4. Filtering Logic
  const allRows: RenewalData[] = mainData?.data || [];
  
  const branchList = useMemo(() => {
    const branches = Array.from(new Set(allRows.map(r => r.branch_code)));
    return branches.sort();
  }, [allRows]);

  const rows = useMemo(() => {
    if (selectedBranch === 'ALL') return allRows;
    return allRows.filter(r => r.branch_code === selectedBranch);
  }, [allRows, selectedBranch]);

  // Apply column sort on top of branch-filtered rows. Default (sortBy === null)
  // preserves the API's alphabetical-by-branch ordering.
  const sortedRows = useMemo(() => {
    if (!sortBy) return rows;
    const dirMul = sortDir === 'desc' ? -1 : 1;
    return [...rows].sort((a, b) => {
      const av = Number(a[sortBy]);
      const bv = Number(b[sortBy]);
      if (av === bv) return a.branch_code.localeCompare(b.branch_code);
      return (av - bv) * dirMul;
    });
  }, [rows, sortBy, sortDir]);

  // 5. Calculate Totals
  const totals = useMemo(() => {
    return rows.reduce((acc, row) => ({
      count_3m: acc.count_3m + row.count_3m,
      count_6m: acc.count_6m + row.count_6m,
      count_9m: acc.count_9m + row.count_9m,
      count_12m: acc.count_12m + row.count_12m,
      total_3m: acc.total_3m + Number(row.total_3m),
      total_6m: acc.total_6m + Number(row.total_6m),
      total_9m: acc.total_9m + Number(row.total_9m),
      total_12m: acc.total_12m + Number(row.total_12m),
      total_renewals: acc.total_renewals + row.total_renewals,
      grand_total: acc.grand_total + Number(row.grand_total),
    }), {
      count_3m: 0, count_6m: 0, count_9m: 0, count_12m: 0,
      total_3m: 0, total_6m: 0, total_9m: 0, total_12m: 0,
      total_renewals: 0, grand_total: 0
    });
  }, [rows]);

  return (
    <div className="branchRankingPage"> 
      <div className="pageHeader">
        <div className="backButtonContainer">
          <BackButton to="/" label="Back to Home" />
        </div>
        <div className="pageHeaderTitle">🔄 Renewal by Branch ({MONTH_SHORT[selectedMonth - 1]} {selectedYear})</div>
        <div className="pageHeaderSub">
          Last updated: {getRelativeTime(freshnessData?.data?.last_refreshed)}
        </div>
        <div className="refreshButtonContainer">
          <button className="btn btnSmall" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? '⟳ Refreshing…' : '⟳ Refresh'}
          </button>
        </div>
      </div>

      {/* --- HORIZONTAL FILTER BAR --- */}
      <div className="card brRankFilters" style={{ display: 'flex', flexDirection: 'row', gap: '20px', alignItems: 'center', marginBottom: '20px', padding: '15px 20px' }}>
        <div className="brRankFilterGroup">
          <label className="brRankLabel">MONTH</label>
          <select 
            className="filterSelect" 
            value={selectedMonth} 
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
          >
            {MONTH_SHORT.map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>

        <div className="brRankFilterGroup">
          <label className="brRankLabel">YEAR</label>
          <select 
            className="filterSelect" 
            value={selectedYear} 
            onChange={(e) => setSelectedYear(Number(e.target.value))}
          >
            {[2024, 2025, 2026].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        <div className="brRankFilterGroup">
          <label className="brRankLabel">BRANCH</label>
          <select 
            className="filterSelect" 
            value={selectedBranch} 
            onChange={(e) => setSelectedBranch(e.target.value)}
            style={{ minWidth: '180px' }}
          >
            <option value="ALL">All Branches</option>
            {branchList.map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>

        <div className="brRankFilterGroup">
  <label className="brRankLabel">QUICK SELECT</label>
  <div style={{ display: 'flex', gap: '10px' }}>
    {/* THIS MONTH BUTTON */}
    <button 
      className={`btn btnSmall ${selectedMonth === now.getMonth() + 1 && selectedYear === now.getFullYear() ? 'btnPrimary' : 'btnSecondary'}`}
      onClick={handleThisMonth}
      style={{ 
        backgroundColor: (selectedMonth === now.getMonth() + 1 && selectedYear === now.getFullYear()) ? '#dc2626' : '',
        color: (selectedMonth === now.getMonth() + 1 && selectedYear === now.getFullYear()) ? 'white' : ''
      }}
    >
      This Month
    </button>

    {/* LAST MONTH BUTTON */}
    <button 
      className={`btn btnSmall ${
        selectedMonth === (now.getMonth() === 0 ? 12 : now.getMonth()) && 
        selectedYear === (now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()) 
        ? 'btnPrimary' : 'btnSecondary'
      }`}
      onClick={handleLastMonth}
      style={{ 
        backgroundColor: (
          selectedMonth === (now.getMonth() === 0 ? 12 : now.getMonth()) && 
          selectedYear === (now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear())
        ) ? '#dc2626' : '',
        color: (
          selectedMonth === (now.getMonth() === 0 ? 12 : now.getMonth()) && 
          selectedYear === (now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear())
        ) ? 'white' : ''
      }}
    >
      Last Month
    </button>
  </div>
</div>
      </div>

      {isLoading ? (
        <div className="card"><div className="loadingCard"><div className="loadingDots"><span /><span /><span /></div> Loading…</div></div>
      ) : isError ? (
        <div className="errorText">Failed to load renewal data. {(error as Error)?.message}</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="brRankBarTable renewalBranchTable w-full text-left border-collapse">
             <thead>
              <tr>
                <th className="p-3 border font-semibold text-center" rowSpan={2}>#</th>
                <th className="p-3 border font-semibold" rowSpan={2}>Branch</th>
                <th className="p-3 border font-semibold text-center" colSpan={4}>Package — Renewals</th>
                <th className="p-3 border font-bold text-center accentCol sortable" rowSpan={2} onClick={() => handleSort('total_renewals')}>Total Renewals{sortIndicator('total_renewals')}</th>
                <th className="p-3 border font-semibold text-center" colSpan={4}>Package — Renewals (RM)</th>
                <th className="p-3 border font-bold text-right accentCol sortable" rowSpan={2} onClick={() => handleSort('grand_total')}>Grand Total (RM){sortIndicator('grand_total')}</th>
              </tr>
              <tr>
                <th className="p-3 border font-semibold text-center sortable" onClick={() => handleSort('count_3m')}>3M{sortIndicator('count_3m')}</th>
                <th className="p-3 border font-semibold text-center sortable" onClick={() => handleSort('count_6m')}>6M{sortIndicator('count_6m')}</th>
                <th className="p-3 border font-semibold text-center sortable" onClick={() => handleSort('count_9m')}>9M{sortIndicator('count_9m')}</th>
                <th className="p-3 border font-semibold text-center sortable" onClick={() => handleSort('count_12m')}>12M{sortIndicator('count_12m')}</th>
                <th className="p-3 border font-semibold text-right sortable" onClick={() => handleSort('total_3m')}>3M{sortIndicator('total_3m')}</th>
                <th className="p-3 border font-semibold text-right sortable" onClick={() => handleSort('total_6m')}>6M{sortIndicator('total_6m')}</th>
                <th className="p-3 border font-semibold text-right sortable" onClick={() => handleSort('total_9m')}>9M{sortIndicator('total_9m')}</th>
                <th className="p-3 border font-semibold text-right sortable" onClick={() => handleSort('total_12m')}>12M{sortIndicator('total_12m')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length > 0 && (
                <tr className="font-bold text-base totalsRow">
                  <td className="p-3 border"></td>
                  <td className="p-3 border">TOTALS</td>
                  <td className="p-3 border text-center">{totals.count_3m}</td>
                  <td className="p-3 border text-center">{totals.count_6m}</td>
                  <td className="p-3 border text-center">{totals.count_9m}</td>
                  <td className="p-3 border text-center">{totals.count_12m}</td>
                  <td className="p-3 border text-center text-lg accentCol">{totals.total_renewals}</td>
                  <td className="p-3 border text-right">{formatRM(totals.total_3m)}</td>
                  <td className="p-3 border text-right">{formatRM(totals.total_6m)}</td>
                  <td className="p-3 border text-right">{formatRM(totals.total_9m)}</td>
                  <td className="p-3 border text-right">{formatRM(totals.total_12m)}</td>
                  <td className="p-3 border text-right text-lg accentCol grandTotalCell">{formatRM(totals.grand_total)}</td>
                </tr>
              )}
              {sortedRows.length > 0 ? sortedRows.map((row, i) => (
                <tr key={row.branch_code} className="border-b">
                  <td className="p-3 border text-center rowNumCell">{i + 1}</td>
                  <td className="p-3 border font-medium">{row.branch_code}</td>
                  <td className="p-3 border text-center">{row.count_3m}</td>
                  <td className="p-3 border text-center">{row.count_6m}</td>
                  <td className="p-3 border text-center">{row.count_9m}</td>
                  <td className="p-3 border text-center">{row.count_12m}</td>
                  <td className="p-3 border text-center font-bold accentCol">{row.total_renewals}</td>
                  <td className="p-3 border text-right amountCell">{formatRM(row.total_3m)}</td>
                  <td className="p-3 border text-right amountCell">{formatRM(row.total_6m)}</td>
                  <td className="p-3 border text-right amountCell">{formatRM(row.total_9m)}</td>
                  <td className="p-3 border text-right amountCell">{formatRM(row.total_12m)}</td>
                  <td className="p-3 border text-right font-bold accentCol grandTotalCell">{formatRM(row.grand_total)}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={12} className="p-10 text-center rowNumCell">No renewal records found for this period.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}