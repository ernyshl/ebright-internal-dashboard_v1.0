import { useState, useRef, useCallback } from 'react';
import { toPng } from 'html-to-image';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { BackButton } from '../components/BackButton';

// Two jackpot thresholds. Order matters — the table renders one vertical line
// per tier on each branch's bar, and the revenue label is colored by the
// highest tier the branch has hit (last one in the array if ranges overlap).
const JACKPOT_TIERS = [
  { amount: 80000,  color: '#16a34a', label: 'RM80K' },   // green
  { amount: 120000, color: '#2563eb', label: 'RM120K' },  // blue
];
const MAX_JACKPOT = Math.max(...JACKPOT_TIERS.map(t => t.amount));

const TIER_DEFS = [
  { label: 'Tier A', emoji: '🥇',  reward: 'RM600', color: '#22c55e', size: 5 },
  { label: 'Tier B', emoji: '🥈',  reward: 'RM500', color: '#f59e0b', size: 5 },
  { label: 'Tier C', emoji: '🥉',  reward: 'RM300', color: '#f97316', size: 5 },
  { label: 'Tier D', emoji: '🎖️', reward: 'RM100', color: '#64748b', size: 5 },
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
  const captureRef = useRef(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const captureToClipboard = useCallback(async () => {
    if (!captureRef.current) {
      showToast('⚠️ Chart not ready');
      return;
    }
    showToast('⏳ Capturing…');

    let dataUrl;
    try {
      dataUrl = await toPng(captureRef.current, {
        backgroundColor: document.documentElement.getAttribute('data-theme') === 'dark' ? '#161b2b' : '#ffffff',
        pixelRatio: 2,
        filter: (node) => !node?.dataset?.noCapture,
      });
    } catch (err) {
      showToast(`⚠️ Render failed: ${err.message}`);
      return;
    }

    const filename = `branch-ranking-${selectedYear}-${String(selectedMonth).padStart(2, '0')}.png`;

    // Try clipboard first
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      try {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        showToast('📋 Copied to clipboard!');
        return;
      } catch {
        // fall through to download
      }
    }

    // Fallback: download
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    a.click();
    showToast('📥 Downloaded!');
  }, [selectedMonth, selectedYear]);


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
    ? Math.max(branches[0]?.total || 0, MAX_JACKPOT * 1.05)
    : MAX_JACKPOT * 1.05;

  // Per-tier winner lists (a branch hitting RM120K also appears in the RM80K
  // list — both are real achievements, not a stack).
  const jackpotWinners = JACKPOT_TIERS.map(t => ({
    ...t,
    pct: Math.min((t.amount / maxTotal) * 100, 99),
    winners: branches.filter((b: any) => b.total >= t.amount),
  }));

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

      {/* Capture wrapper: filters + chart */}
      <div ref={captureRef}>
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
          title="Save chart as image"
          data-no-capture="true"
        >
          📋
        </button>
      </div>

      {toast && <div className="brRankToast">{toast}</div>}

      {/* Jackpot Winners Summary — sits between filter bar and chart so it's
          included in the captureRef PNG. */}
      {!isLoading && !isError && (
        <div className="card brRankWinnersCard">
          {jackpotWinners.map(t => (
            <div key={t.amount} className="brRankWinnersRow">
              <span className="brRankWinnersDot" style={{ background: t.color }} />
              <span className="brRankWinnersLabel">
                🏆 {t.label} Jackpot Winners ({t.winners.length}):
              </span>
              <span className="brRankWinnersList">
                {t.winners.length > 0
                  ? t.winners.map((w: any) => w.branch).join(', ')
                  : 'none yet'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Chart Table */}
      {isLoading ? (
        <div className="card"><div className="loadingCard"><div className="loadingDots"><span /><span /><span /></div> Loading…</div></div>
      ) : isError ? (
        <div className="errorText">Failed to load branch ranking data.</div>
      ) : (
        <div className="card brRankChartCard">
          <div className="brRankLegend">
            {JACKPOT_TIERS.map(t => (
              <span key={t.amount} className="brRankLegendItem">
                <span className="brRankLegendDot" style={{ background: t.color }} />
                {t.label} Jackpot
              </span>
            ))}
          </div>
          <table className="brRankBarTable">
            <tbody>
              {tierRows.map(({ tier, branches: tierBranches, startIdx }, tIdx) =>
                tierBranches.map((b, i) => {
                  const rank = startIdx + i;
                  const barPct = b.total > 0 ? (b.total / maxTotal) * 100 : 0;
                  // Highest jackpot this branch hit in the SELECTED period.
                  // Drives the bold/colored revenue label on the bar.
                  const highestJackpot = [...JACKPOT_TIERS]
                    .reverse()
                    .find(t => b.total >= t.amount);
                  // Highest jackpot the branch has EVER hit (any single month
                  // since 2026-01-01). Drives the permanent branch-name color.
                  const lifetimeJackpot = [...JACKPOT_TIERS]
                    .reverse()
                    .find(t => (b.lifetime_max ?? 0) >= t.amount);
                  const isTierFirst = i === 0 && tIdx > 0;
                  return (
                    <tr key={b.branch} className={`brRankDataRow${isTierFirst ? ' tierStart' : ''}`}>
                      <td className="brRankRankCell">
                        <span className={`brRankRankNum${rank < 3 ? ' top3' : ''}`}>
                          #{rank + 1}
                        </span>
                      </td>
                      <td
                        className="brRankNameCell"
                        style={lifetimeJackpot ? { color: lifetimeJackpot.color, fontWeight: 700 } : undefined}
                      >
                        {b.branch}
                      </td>
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
                          {jackpotWinners.map(t => (
                            <div
                              key={t.amount}
                              className="brRankJackpotLine"
                              style={{ left: `${t.pct}%`, background: t.color }}
                            />
                          ))}
                          <span
                            className={`brRankRevenueLabel${b.total === 0 ? ' brRankZeroVal' : ''}`}
                            style={{
                              left: `calc(${barPct}% + 6px)`,
                              color: highestJackpot?.color,
                              fontWeight: highestJackpot ? 800 : undefined,
                            }}
                          >
                            {b.total === 0 ? 'RM0.00' : formatRM(b.total)}
                          </span>
                        </div>
                      </td>
                      {i === 0 && (
                        <td
                          rowSpan={tierBranches.length}
                          className="brRankTierBadgeCell"
                          style={{ '--tier-color': tier.color } as React.CSSProperties}
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
      </div>{/* end captureRef */}
    </div>
  );
}
