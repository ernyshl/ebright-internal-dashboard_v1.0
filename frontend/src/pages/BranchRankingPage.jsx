import { useState, useRef, useEffect, useCallback } from 'react';
import html2canvas from 'html2canvas';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { BackButton } from '../components/BackButton';

const JACKPOT = 80000;

const TIER_DEFS = [
  { label: 'Tier A', emoji: '🥇', reward: 'RM500', color: '#22c55e', size: 7 },
  { label: 'Tier B', emoji: '🥈', reward: 'RM300', color: '#f59e0b', size: 7 },
  { label: 'Tier C', emoji: '🥉', reward: 'RM100', color: '#f97316', size: 6 },
];

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatRM(val) {
  if (val === null || val === undefined) return '—';
  return `RM${Number(val).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getBarColor(rank, total) {
  const t = total <= 1 ? 0 : rank / (total - 1);
  const hue = Math.round(142 * (1 - t));
  const sat = Math.round(71 + 13 * t);
  const lig = Math.round(45 + 10 * t);
  return `hsl(${hue}, ${sat}%, ${lig}%)`;
}

function monthYearToDates(month, year) {
  const mm = String(month).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();
  return {
    date_from: `${year}-${mm}-01`,
    date_to: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
  };
}

function getYears() {
  const cur = new Date().getFullYear();
  const arr = [];
  for (let y = cur - 2; y <= cur + 1; y++) arr.push(y);
  return arr;
}

export function BranchRankingPage() {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [branch, setBranch] = useState('');
  const [activePreset, setActivePreset] = useState('this_month');
  const [toast, setToast] = useState(null);
  const chartRef = useRef(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const captureToClipboard = useCallback(async () => {
    if (!chartRef.current) return;
    try {
      const canvas = await html2canvas(chartRef.current, {
        backgroundColor: document.documentElement.getAttribute('data-theme') === 'dark' ? '#161b2b' : '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      showToast('📋 Copied to clipboard!');
    } catch {
      showToast('⚠️ Copy failed — try on HTTPS');
    }
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        captureToClipboard();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [captureToClipboard]);

  const applyPreset = (preset) => {
    if (preset === 'this_month') {
      setSelectedMonth(now.getMonth() + 1);
      setSelectedYear(now.getFullYear());
    } else if (preset === 'last_month') {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      setSelectedMonth(d.getMonth() + 1);
      setSelectedYear(d.getFullYear());
    }
    setActivePreset(preset);
  };

  const handleMonthChange = (e) => {
    setSelectedMonth(Number(e.target.value));
    setActivePreset(null);
  };

  const handleYearChange = (e) => {
    setSelectedYear(Number(e.target.value));
    setActivePreset(null);
  };

  const { date_from, date_to } = monthYearToDates(selectedMonth, selectedYear);
  const params = new URLSearchParams({ date_from, date_to });
  if (branch) params.set('branch', branch);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['branch-ranking', date_from, date_to, branch],
    queryFn: () => apiFetch(`/api/finance/branch-ranking?${params}`),
    staleTime: 60_000,
  });

  const branches = data?.branches || [];
  const grandTotal = data?.grandTotal || 0;
  const branchList = data?.branchList || [];

  const maxTotal = branches.length > 0
    ? Math.max(branches[0]?.total || 0, JACKPOT * 1.05)
    : JACKPOT * 1.05;
  const jackpotPct = Math.min((JACKPOT / maxTotal) * 100, 97);

  const tierRows = [];
  let idx = 0;
  for (const tier of TIER_DEFS) {
    const tierBranches = branches.slice(idx, idx + tier.size);
    if (tierBranches.length === 0) break;
    tierRows.push({ tier, branches: tierBranches, startIdx: idx });
    idx += tierBranches.length;
  }

  const periodLabel = `${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`;

  return (
    <div className="branchRankingPage">
      <div className="pageHeader">
        <div className="backButtonContainer">
          <BackButton to="/" label="Back to Home" />
        </div>
        <div className="pageHeaderTitle">🏆 Branch Ranking</div>
        <div className="pageHeaderSub">Revenue by branch · {periodLabel}</div>
        <div className="refreshButtonContainer">
          <button className="btn btnSmall" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? '⟳ Refreshing…' : '⟳ Refresh'}
          </button>
        </div>
      </div>

      {/* Filters + Total Revenue inline */}
      <div className="brRankFilters">
        <div className="brRankFilterGroup">
          <label className="brRankLabel">Month</label>
          <select className="filterSelect" value={selectedMonth} onChange={handleMonthChange}>
            {MONTH_SHORT.map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>
        <div className="brRankFilterGroup">
          <label className="brRankLabel">Year</label>
          <select className="filterSelect" value={selectedYear} onChange={handleYearChange}>
            {getYears().map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="brRankFilterGroup">
          <label className="brRankLabel">Branch</label>
          <select className="filterSelect" value={branch} onChange={e => setBranch(e.target.value)}>
            <option value="">All Branches</option>
            {branchList.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div className="brRankFilterGroup">
          <label className="brRankLabel">Quick Select</label>
          <div className="brRankPresets">
            {[
              { key: 'this_month', label: 'This Month' },
              { key: 'last_month', label: 'Last Month' },
            ].map(p => (
              <button
                key={p.key}
                className={`brRankPresetBtn${activePreset === p.key ? ' active' : ''}`}
                onClick={() => applyPreset(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="brRankFilterGroup brRankTotalInline">
          <label className="brRankLabel">Total Revenue</label>
          <div className="brRankTotalValue">{isLoading ? '—' : formatRM(grandTotal)}</div>
        </div>
        <button
          className="brRankPresetBtn"
          onClick={captureToClipboard}
          disabled={isLoading}
          title="Copy chart to clipboard (Ctrl+Shift+S)"
        >
          📋
        </button>
      </div>

      {toast && <div className="brRankToast">{toast}</div>}

      {/* Chart Table */}
      {isLoading ? (
        <div className="card"><div className="loadingCard"><div className="loadingDots"><span /><span /><span /></div> Loading…</div></div>
      ) : isError ? (
        <div className="errorText">Failed to load branch ranking data.</div>
      ) : (
        <div ref={chartRef} className="card brRankChartCard">
          <table className="brRankBarTable">
            <tbody>
              {tierRows.map(({ tier, branches: tierBranches, startIdx }, tIdx) =>
                tierBranches.map((b, i) => {
                  const rank = startIdx + i;
                  const barPct = b.total > 0 ? (b.total / maxTotal) * 100 : 0;
                  const isJackpot = b.total >= JACKPOT;
                  const isTierFirst = i === 0 && tIdx > 0;
                  return (
                    <tr key={b.branch} className={`brRankDataRow${isTierFirst ? ' tierStart' : ''}`}>
                      <td className="brRankRankCell">
                        <span className={`brRankRankNum${rank < 3 ? ' top3' : ''}`}>
                          #{rank + 1}
                        </span>
                      </td>
                      <td className="brRankNameCell">{b.branch}</td>
                      <td className="brRankBarCell">
                        <div className="brRankBarWrap">
                          {b.total > 0 && (
                            <div
                              className="brRankBarFill"
                              style={{
                                width: `${barPct}%`,
                                background: getBarColor(rank, branches.length),
                              }}
                            />
                          )}
                          <div className="brRankJackpotLine" style={{ left: `${jackpotPct}%` }} />
                          <span
                            className={`brRankRevenueLabel${isJackpot ? ' brRankJackpotVal' : b.total === 0 ? ' brRankZeroVal' : ''}`}
                            style={{ left: `calc(${barPct}% + 6px)` }}
                          >
                            {b.total === 0 ? 'RM0.00' : formatRM(b.total)}
                          </span>
                        </div>
                      </td>
                      {i === 0 && (
                        <td
                          rowSpan={tierBranches.length}
                          className="brRankTierBadgeCell"
                          style={{ '--tier-color': tier.color }}
                        >
                          <div className="brRankTierBadgeInner">
                            <div className="brRankTierBadgeEmoji">{tier.emoji}</div>
                            <div className="brRankTierBadgeName">{tier.label}</div>
                            <div className="brRankTierBadgeReward">{tier.reward}</div>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
