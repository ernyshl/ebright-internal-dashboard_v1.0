import React, { useMemo, useState, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toPng } from 'html-to-image';
import { apiFetch } from '../lib/api';
import { BackButton } from '../components/BackButton';

// --- Types ---
type RenewalData = {
  branch_code: string;
  branch_name: string;
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

// Region groupings — kept in the frontend so we can include not-yet-opened
// branches (e.g. PU) as zero-rows without needing a DB migration first.
type Region = 'A' | 'B' | 'C';
const BRANCH_REGIONS: Record<string, Region> = {
  // Region A
  RBY: 'A', KLG: 'A', SHA: 'A', SA: 'A', DA: 'A', EGR: 'A', ST: 'A',
  // Region B
  DK: 'B', KD: 'B', AMP: 'B', SP: 'B', BTHO: 'B', KTG: 'B', TSG: 'B',
  // Region C
  PJY: 'C', KW: 'C', BBB: 'C', CJY: 'C', BSP: 'C', PU: 'C', ONL: 'C',
};

// Display names for branches that aren't (yet) returned by the API. Used to
// render zero-row placeholders so the page reflects the full 21-branch roster.
const BRANCH_NAME_FALLBACK: Record<string, string> = {
  PU: 'Ebright Dataran Puchong Utama',
};

// Monthly renewal revenue targets per branch (RM). null = no target set
// (e.g. PU is not yet open). Compared against monthly grand_total or, when
// the user picks a custom date range, the partial-month grand_total.
const BRANCH_TARGETS: Record<string, number | null> = {
  CJY: 25962.3,
  ST: 14988.7,
  KD: 16371.2,
  AMP: 20173.6,
  BBB: 13344.6,
  BSP: 9990.9,
  DA: 11468.7,
  ONL: 8689.5,
  SP: 7598.7,
  DK: 17333.4,
  PJY: 16759.7,
  SHA: 16947.8,
  SA: 16057.8,
  KLG: 10993.1,
  EGR: 4552.7,
  RBY: 6162.1,
  BTHO: 6285.9,
  PU: null,
  KTG: 0,
  KW: 0,
  TSG: 0,
};

// Which target-derivation formula each branch uses, shown as an asterisk
// beside the target value (see the "How it works" legend on the graph view).
// ** = (total revenue × 0.3) ÷ 6; * = (total revenue × 0.3) ÷ 4.5 (the rest).
const DOUBLE_ASTERISK_BRANCHES = new Set(['RBY', 'KTG', 'TSG', 'KW']);
const targetAsterisk = (branchCode: string) =>
  DOUBLE_ASTERISK_BRANCHES.has(branchCode) ? '**' : '*';

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

const getBarColor = (rank: number, total: number) => {
  const t = total <= 1 ? 0 : rank / (total - 1);
  const hue = Math.round(142 * (1 - t));
  const sat = Math.round(71 + 13 * t);
  const lig = Math.round(45 + 10 * t);
  return `hsl(${hue}, ${sat}%, ${lig}%)`;
};

// Last day of the given month (1-indexed). Used to clamp custom date inputs
// to the selected month so target comparisons stay meaningful.
const lastDayOfMonth = (year: number, month1Indexed: number) =>
  new Date(year, month1Indexed, 0).getDate();

const toIsoDate = (year: number, month1Indexed: number, day: number) =>
  `${year}-${String(month1Indexed).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

export default function FinanceRenewalByBranchPage() {
  // 1. State for Filters
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedBranch, setSelectedBranch] = useState('ALL');
  const [selectedRegion, setSelectedRegion] = useState<'ALL' | Region>('ALL');
  // Custom date range — both must be set to be active, and both are clamped
  // to the selected month so the monthly target stays a fair comparison.
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const graphCaptureRef = useRef<HTMLDivElement | null>(null);
  const [captureToast, setCaptureToast] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'graph'>('graph');
  const [graphMetric, setGraphMetric] = useState<'revenue' | 'count'>('revenue');

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

  // Month boundary helpers for clamping the custom date inputs.
  const monthFirst = toIsoDate(selectedYear, selectedMonth, 1);
  const monthLast  = toIsoDate(selectedYear, selectedMonth, lastDayOfMonth(selectedYear, selectedMonth));
  // Only treat the custom range as active when BOTH ends are set and both
  // fall inside the selected month (the <input min/max> already restricts
  // user input — this is a defensive guard).
  const customRangeActive =
    !!startDate && !!endDate &&
    startDate >= monthFirst && endDate <= monthLast &&
    startDate <= endDate;

  // 2. Data Query
  const {
    data: mainData,
    isLoading,
    isError,
    error,
    refetch,
    isFetching
  } = useQuery({
    queryKey: ['finance-renewal-by-branch', selectedMonth, selectedYear, customRangeActive ? startDate : '', customRangeActive ? endDate : ''],
    queryFn: () => {
      const params = new URLSearchParams({
        month: String(selectedMonth),
        year: String(selectedYear),
      });
      if (customRangeActive) {
        params.set('date_from', startDate);
        params.set('date_to', endDate);
      }
      return apiFetch(`/api/finance/renewal-by-branch?${params.toString()}`);
    },
  });

  const { data: freshnessData } = useQuery({
    queryKey: ['finance-renewal-freshness'],
    queryFn: () => apiFetch('/api/finance/renewal-by-branch/freshness'),
    refetchInterval: 60000, 
  });

  // 3. Quick Select Handlers
  // Each month change clears the custom date range — otherwise the previous
  // month's start/end would be out of bounds for the new month and silently
  // get ignored, which is confusing.
  const handleThisMonth = () => {
    setSelectedMonth(now.getMonth() + 1);
    setSelectedYear(now.getFullYear());
    setStartDate(''); setEndDate('');
  };

  const handleLastMonth = () => {
    let m = now.getMonth(); // 0-indexed, so 4 (May) becomes 3 (April)
    let y = now.getFullYear();
    if (m === 0) { m = 12; y -= 1; }
    setSelectedMonth(m);
    setSelectedYear(y);
    setStartDate(''); setEndDate('');
  };

  const handleMonthChange = (m: number) => {
    setSelectedMonth(m);
    setStartDate(''); setEndDate('');
  };
  const handleYearChange = (y: number) => {
    setSelectedYear(y);
    setStartDate(''); setEndDate('');
  };

  const showCaptureToast = (msg: string) => {
    setCaptureToast(msg);
    setTimeout(() => setCaptureToast(null), 2500);
  };

  const captureGraph = useCallback(async () => {
    if (!graphCaptureRef.current) {
      showCaptureToast('⚠️ Chart not ready');
      return;
    }
    showCaptureToast('⏳ Capturing…');

    let dataUrl: string;
    try {
      dataUrl = await toPng(graphCaptureRef.current, {
        backgroundColor:
          document.documentElement.getAttribute('data-theme') === 'dark'
            ? '#161b2b'
            : '#ffffff',
        pixelRatio: 2,
        filter: (node: HTMLElement) => !(node as HTMLElement)?.dataset?.noCapture,
      });
    } catch (err) {
      showCaptureToast(`⚠️ Render failed: ${(err as Error).message}`);
      return;
    }

    const filename = `renewal-ranking-${selectedYear}-${String(selectedMonth).padStart(2, '0')}.png`;

    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      try {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        showCaptureToast('📋 Copied to clipboard!');
        return;
      } catch {
        // fall through to download
      }
    }

    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    a.click();
    showCaptureToast('📥 Downloaded!');
  }, [selectedMonth, selectedYear]);

  // 4. Filtering Logic
  // Pad the API response with zero-rows for any branch in BRANCH_REGIONS that
  // the backend didn't return — keeps not-yet-opened branches (e.g. PU)
  // visible in the table and graph as RM 0.00 placeholders.
  const allRows: RenewalData[] = useMemo(() => {
    const apiRows: RenewalData[] = mainData?.data || [];
    const seen = new Set(apiRows.map(r => r.branch_code));
    const padded: RenewalData[] = [...apiRows];
    for (const code of Object.keys(BRANCH_REGIONS)) {
      if (seen.has(code)) continue;
      padded.push({
        branch_code: code,
        branch_name: BRANCH_NAME_FALLBACK[code] || code,
        count_3m: 0, count_6m: 0, count_9m: 0, count_12m: 0,
        total_3m: 0, total_6m: 0, total_9m: 0, total_12m: 0,
        total_renewals: 0, grand_total: 0,
      });
    }
    return padded.sort((a, b) => a.branch_code.localeCompare(b.branch_code));
  }, [mainData]);

  const branchList = useMemo(() => {
    const branches = Array.from(new Set(allRows.map(r => r.branch_code)));
    return branches.sort();
  }, [allRows]);

  const rows = useMemo(() => {
    return allRows.filter(r => {
      if (selectedBranch !== 'ALL' && r.branch_code !== selectedBranch) return false;
      if (selectedRegion !== 'ALL' && BRANCH_REGIONS[r.branch_code] !== selectedRegion) return false;
      return true;
    });
  }, [allRows, selectedBranch, selectedRegion]);

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

  // Rank rows for the graph view.
  //   • Revenue mode: by % of monthly target descending. Zero-target branches
  //     (target = 0, e.g. TSG/KW/KTG) use a pseudo-% of (actual / maxActual)
  //     * 100 so they integrate into the ranking by relative scale instead
  //     of dropping to the bottom — TSG with RM 3,920 lands just below
  //     Ampang's 48% rather than at #18 with no signal.
  //     Null-target branches (e.g. PU) ALWAYS rank last regardless of actual.
  //   • Count mode: by absolute renewal count, descending (no targets).
  // Ties broken by branch name asc so the order is stable for screenshots.
  const graphRows = useMemo(() => {
    if (graphMetric === 'count') {
      return [...rows].sort((a, b) => {
        const av = Number(a.total_renewals);
        const bv = Number(b.total_renewals);
        if (av === bv) return a.branch_name.localeCompare(b.branch_name);
        return bv - av;
      });
    }
    const maxActual = rows.reduce(
      (m, r) => Math.max(m, Number(r.grand_total)),
      0,
    );
    const pctOf = (r: RenewalData): number | null => {
      const target = BRANCH_TARGETS[r.branch_code];
      if (target == null) return null; // null target — always last
      const actual = Number(r.grand_total);
      if (target > 0) return (actual / target) * 100;
      // target === 0: rank by absolute scale so zero-target branches still
      // sort visibly against the targeted ones.
      return maxActual > 0 ? (actual / maxActual) * 100 : 0;
    };
    return [...rows].sort((a, b) => {
      const ap = pctOf(a);
      const bp = pctOf(b);
      if (ap == null && bp == null) {
        // Both null-target — tie-break by name (stable).
        return a.branch_name.localeCompare(b.branch_name);
      }
      if (ap == null) return 1;  // a (null) → after b
      if (bp == null) return -1; // b (null) → after a
      if (ap === bp) return a.branch_name.localeCompare(b.branch_name);
      return bp - ap;
    });
  }, [rows, graphMetric]);

  const graphMax = useMemo(() => {
    const key = graphMetric === 'revenue' ? 'grand_total' : 'total_renewals';
    return graphRows.reduce((m, r) => Math.max(m, Number(r[key])), 0);
  }, [graphRows, graphMetric]);

  // 5. Calculate Totals — target_total sums only branches with a configured
  // target (null/missing entries are skipped) so the TOTALS row reflects the
  // achievable target for the visible rows.
  const totals = useMemo(() => {
    return rows.reduce((acc, row) => {
      const t = BRANCH_TARGETS[row.branch_code];
      return {
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
        target_total: acc.target_total + (t == null ? 0 : t),
      };
    }, {
      count_3m: 0, count_6m: 0, count_9m: 0, count_12m: 0,
      total_3m: 0, total_6m: 0, total_9m: 0, total_12m: 0,
      total_renewals: 0, grand_total: 0, target_total: 0,
    });
  }, [rows]);

  return (
    <div className="branchRankingPage">
      {captureToast && (
        <div className="renewalGraphCaptureToast">{captureToast}</div>
      )}
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

      {/* Capture region: filter bar + chart, mirroring BranchRankingPage. */}
      <div ref={graphCaptureRef}>
      {/* --- HORIZONTAL FILTER BAR ---
          Plain .brRankFilters (no .card) to match BranchRankingPage. The .card
          class's backdrop-filter + translucent bg made html-to-image clip the
          right-edge content (totals tile) from the captured PNG. */}
      <div className="brRankFilters" style={{ display: 'flex', flexDirection: 'row', gap: '20px', alignItems: 'center', marginBottom: '20px', padding: '15px 20px' }}>
        <div className="brRankFilterGroup">
          <label className="brRankLabel">MONTH</label>
          <select
            className="filterSelect"
            value={selectedMonth}
            onChange={(e) => handleMonthChange(Number(e.target.value))}
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
            onChange={(e) => handleYearChange(Number(e.target.value))}
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
          <label className="brRankLabel">REGION</label>
          <select
            className="filterSelect"
            value={selectedRegion}
            onChange={(e) => setSelectedRegion(e.target.value as 'ALL' | Region)}
            style={{ minWidth: '140px' }}
          >
            <option value="ALL">All Regions</option>
            <option value="A">Region A</option>
            <option value="B">Region B</option>
            <option value="C">Region C</option>
          </select>
        </div>

        {/* Custom date range — restricted to days inside the selected month
            via min/max so the comparison against the monthly target stays
            fair. Clearing either input disables the range. */}
        <div className="brRankFilterGroup">
          <label className="brRankLabel">START DATE</label>
          <input
            type="date"
            className="filterSelect"
            value={startDate}
            min={monthFirst}
            max={endDate || monthLast}
            onChange={(e) => setStartDate(e.target.value)}
            style={{ minWidth: '150px' }}
          />
        </div>

        <div className="brRankFilterGroup">
          <label className="brRankLabel">END DATE</label>
          <input
            type="date"
            className="filterSelect"
            value={endDate}
            min={startDate || monthFirst}
            max={monthLast}
            onChange={(e) => setEndDate(e.target.value)}
            style={{ minWidth: '150px' }}
          />
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
    {/* CLEAR RANGE — only shown when a custom range is set, so it doesn't
        clutter the bar otherwise. */}
    {(startDate || endDate) && (
      <button
        className="btn btnSmall btnSecondary"
        onClick={() => { setStartDate(''); setEndDate(''); }}
        title="Clear custom date range"
      >
        ✕ Range
      </button>
    )}
    {/* TABLE / GRAPH TOGGLE */}
    <button
      className="btn btnSmall btnSecondary"
      onClick={() => setViewMode(viewMode === 'table' ? 'graph' : 'table')}
      style={{ marginLeft: '4px' }}
      data-no-capture="true"
    >
      {viewMode === 'table' ? '📊 Graph' : '📋 Table'}
    </button>
  </div>
</div>

        {/* Single .brRankFilterGroup with the .brRankTotalInline class
            (margin-left:auto + text-align:right). Putting both label/value
            pairs INSIDE one tile means they move as one flex item — earlier
            attempts with two separate tiles had the second one overflow the
            html-to-image bounding rect even though it rendered fine on the
            live page. Mirrors BranchRankingPage's working pattern. */}
        <div className="brRankFilterGroup brRankTotalInline">
          <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-end' }}>
            <div style={{ textAlign: 'right' }}>
              <div className="brRankLabel">TOTAL PACKS</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                {totals.total_renewals}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="brRankLabel">TOTAL RENEWALS</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                {formatRM(totals.grand_total)}
              </div>
            </div>
          </div>
        </div>

        {/* Capture button — only shown in graph view, filtered out of PNG via
            data-no-capture. Clipboard-icon only to match BranchRankingPage. */}
        {viewMode === 'graph' && (
          <button
            className="brRankPresetBtn"
            onClick={captureGraph}
            title="Save chart as image"
            data-no-capture="true"
            style={{ fontSize: '20px', lineHeight: 1 }}
          >
            📋
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="card"><div className="loadingCard"><div className="loadingDots"><span /><span /><span /></div> Loading…</div></div>
      ) : isError ? (
        <div className="errorText">Failed to load renewal data. {(error as Error)?.message}</div>
      ) : (
        viewMode === 'table' ? (
        <div className="card overflow-x-auto">
          <table className="brRankBarTable renewalBranchTable w-full text-left border-collapse">
             <thead>
              <tr>
                <th className="p-3 border font-semibold text-center" rowSpan={2}>#</th>
                <th className="p-3 border font-semibold" rowSpan={2}>Branch</th>
                <th className="p-3 border font-semibold text-center" colSpan={4}>Package — Renewals</th>
                <th className="p-3 border font-bold text-center accentCol sortable" rowSpan={2} onClick={() => handleSort('total_renewals')}>Total Renewals{sortIndicator('total_renewals')}</th>
                <th className="p-3 border font-semibold text-center" colSpan={4}>Package — Renewals (RM)</th>
                <th className="p-3 border font-bold text-right accentCol sortable" rowSpan={2} onClick={() => handleSort('grand_total')}>Actual (RM){sortIndicator('grand_total')}</th>
                <th className="p-3 border font-bold text-right targetCol" rowSpan={2}>Target (RM)</th>
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
                  <td className="p-3 border text-right text-lg targetCol">{formatRM(totals.target_total)}</td>
                </tr>
              )}
              {sortedRows.length > 0 ? sortedRows.map((row, i) => {
                const target = BRANCH_TARGETS[row.branch_code];
                return (
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
                  <td className="p-3 border text-right targetCol">{target == null ? '—' : formatRM(target)}</td>
                </tr>
                );
              }) : (
                <tr>
                  <td colSpan={13} className="p-10 text-center rowNumCell">No renewal records found for this period.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        ) : (
          <div className="renewalGraphCard">
            {/* Metric toggle (Revenue / Count). Capture button moved to the
                filter bar so it sits next to the totals, like BranchRankingPage. */}
            <div className="renewalGraphMetricToggle" data-no-capture="true">
              <button
                className={graphMetric === 'revenue' ? 'active' : ''}
                onClick={() => setGraphMetric('revenue')}
              >
                💰 Revenue (RM)
              </button>
              <button
                className={graphMetric === 'count' ? 'active' : ''}
                onClick={() => setGraphMetric('count')}
              >
                🔢 Renewal Count
              </button>
            </div>
            <table className="renewalGraphTable">
              <tbody>
                {graphRows.map((row, i) => {
                  const value = graphMetric === 'revenue'
                    ? Number(row.grand_total)
                    : Number(row.total_renewals);
                  const isZero = value === 0;
                  // Revenue mode: track = monthly target, fill = actual (so
                  // 50% of target visually lands at the midpoint of the row).
                  // Count mode: target not defined → fall back to the previous
                  // max-relative bar so the chart still reads at a glance.
                  // Branches with target === null (e.g. PU) also fall back.
                  const target = graphMetric === 'revenue'
                    ? BRANCH_TARGETS[row.branch_code]
                    : null;
                  const useProgress = graphMetric === 'revenue' && target != null && target > 0;
                  // Revenue mode + no target configured (e.g. PU). Render an
                  // empty 0% bar and a blank value cell — showing "RM 0.00"
                  // for a not-yet-opened branch is misleading.
                  const noTargetSet = graphMetric === 'revenue' && (target == null);
                  const rawPct = useProgress ? (value / (target as number)) * 100 : 0;
                  const fillPct = noTargetSet
                    ? 0
                    : useProgress
                      ? Math.min(100, rawPct)
                      : (graphMax > 0 ? (value / graphMax) * 100 : 0);
                  const overTarget = useProgress && rawPct > 100;
                  // Value column: revenue rows always use the same 3-cell grid
                  // (actual | / | target) so actuals line up across rows. The
                  // separator + target are blank for zero-target branches so
                  // the actual still anchors to the same column position
                  // instead of floating to the far right. Null-target (PU)
                  // renders a fully empty cell.
                  const display: React.ReactNode = noTargetSet
                    ? ''
                    : graphMetric === 'revenue'
                      ? (
                        <>
                          <span className="renewalGraphActual">{formatRM(value)}</span>
                          <span className="renewalGraphSep">{useProgress ? '/' : ''}</span>
                          <span className="renewalGraphTarget">
                            {useProgress ? `${formatRM(target as number)} ${targetAsterisk(row.branch_code)}` : ''}
                          </span>
                        </>
                      )
                      : `${value} renewal${value === 1 ? '' : 's'}`;
                  // Rank-based green→yellow gradient — restored from the
                  // previous design. The progress vs target is conveyed by
                  // fill width + a numeric % label, not by hue.
                  const fillColor = isZero
                    ? 'transparent'
                    : getBarColor(i, graphRows.length);
                  // Percentage label position: sits at the right edge of the
                  // fill so the eye lands on it where the bar stops. Clamp to
                  // [0, 100] so it stays visible when the bar exceeds target.
                  const pctLabelLeft = Math.max(0, Math.min(100, fillPct));
                  return (
                    <tr key={row.branch_code} className={isZero ? 'zeroRow' : ''}>
                      <td className="renewalGraphRank">#{i + 1}</td>
                      <td className="renewalGraphName" title={row.branch_name}>
                        {row.branch_name || row.branch_code}
                      </td>
                      <td className="renewalGraphBarCell">
                        <div className={`renewalGraphTrack${useProgress ? ' renewalGraphTrackTarget' : ''}`}>
                          <div
                            className={`renewalGraphFill${overTarget ? ' renewalGraphFillOver' : ''}`}
                            style={{ width: `${fillPct}%`, background: fillColor }}
                          />
                          {/* Half-line marker at 50% of the target — quick
                              "before/after centre" visual reference. */}
                          {useProgress && <div className="renewalGraphHalfMarker" />}
                          {/* % of target — anchored to where the fill ends
                              so the number reads in context with the bar. */}
                          {useProgress && (
                            <span
                              className={`renewalGraphPct${overTarget ? ' renewalGraphPctOver' : ''}`}
                              style={{ left: `${pctLabelLeft}%` }}
                            >
                              {Math.round(rawPct)}%
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="renewalGraphValue">{display}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}
      </div>

      {/* How-it-works note — graph view only. Outside graphCaptureRef so it's
          excluded from the chart PNG. Explains how each branch's monthly
          renewal target is derived from total revenue. */}
      {viewMode === 'graph' && (
        <div className="card" style={{ marginTop: 16, fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
          <strong>How it works:</strong><br />
          The monthly renewal target for each branch is derived from its total revenue:<br />
          <span style={{ fontFamily: 'monospace' }}>*&nbsp;&nbsp;Total revenue × 0.3 = a, then a ÷ 4.5 = target</span><br />
          <span style={{ fontFamily: 'monospace' }}>** Total revenue × 0.3 = a, then a ÷ 6 = target</span>
        </div>
      )}
    </div>
  );
}