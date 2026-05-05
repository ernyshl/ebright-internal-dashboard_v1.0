import { useState, useRef, useCallback } from 'react';
import { toPng } from 'html-to-image';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { BackButton } from '../components/BackButton';

const JACKPOT = 80000;
const RENEWAL_COLOR = '#fbbf24'; // gold

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

export function FinanceBranchRevenueRenewalsPage() {
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

    const filename = `branch-revenue-renewals-${selectedYear}-${String(selectedMonth).padStart(2, '0')}.png`;

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
    queryKey: ['branch-revenue-renewals', date_from, date_to, branch],
    queryFn: () => apiFetch(`/api/finance/branch-revenue-renewals?${params}`),
    staleTime: 60_000,
  });

  const branches = data?.branches || [];
  const grandTotal = data?.grandTotal || 0;
  const grandRenewalTotal = data?.grandRenewalTotal || 0;
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
        <div className="pageHeaderTitle">💰 Branch Revenue & Renewals</div>
        <div className="pageHeaderSub">Revenue with renewal portion · {periodLabel}</div>
        <div className="refreshButtonContainer">
          <button className="btn btnSmall" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? '⟳ Refreshing…' : '⟳ Refresh'}
          </button>
        </div>
      </div>

      <div ref={captureRef}>
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
        <div className="brRankFilterGroup brRankTotalInline">
          <label className="brRankLabel">Total Renewals</label>
          <div className="brRankTotalValue">
            {isLoading ? '—' : formatRM(grandRenewalTotal)}
          </div>
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

      {isLoading ? (
        <div className="card"><div className="loadingCard"><div className="loadingDots"><span /><span /><span /></div> Loading…</div></div>
      ) : isError ? (
        <div className="errorText">Failed to load branch revenue & renewals data.</div>
      ) : (
        <div className="card brRankChartCard">
          <div style={{
            display: 'flex',
            gap: 18,
            padding: '10px 16px',
            fontSize: '0.85em',
            color: 'var(--textSecondary)',
            alignItems: 'center',
            borderBottom: '1px solid var(--border)',
            flexWrap: 'wrap',
          }}>
            <strong style={{ color: 'var(--textPrimary)', fontSize: '0.92em' }}>Legend:</strong>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 14, height: 14, background: RENEWAL_COLOR, borderRadius: 3, display: 'inline-block' }} />
              Total Renewal
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 14, height: 14, background: 'linear-gradient(90deg, hsl(142,71%,45%), hsl(28,84%,55%))', borderRadius: 3, display: 'inline-block' }} />
              Total Revenue
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 2, height: 14, background: '#f97316', display: 'inline-block' }} />
              Jackpot threshold (RM80,000)
            </span>
          </div>
          <table className="brRankBarTable">
            <tbody>
              {tierRows.map(({ tier, branches: tierBranches, startIdx }, tIdx) =>
                tierBranches.map((b, i) => {
                  const rank = startIdx + i;
                  const totalPct = b.total > 0 ? (b.total / maxTotal) * 100 : 0;
                  const renewalPct = b.total > 0 ? (b.renewal / maxTotal) * 100 : 0;
                  const restPct = Math.max(totalPct - renewalPct, 0);
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
                        <div className="brRankBarWrap" style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                          {b.renewal > 0 && (
                            <div
                              style={{
                                width: `${renewalPct}%`,
                                background: RENEWAL_COLOR,
                                position: 'absolute',
                                left: 0,
                                top: 0,
                                bottom: 0,
                                borderRadius: restPct > 0 ? '4px 0 0 4px' : '4px',
                              }}
                            />
                          )}
                          {restPct > 0 && (
                            <div
                              className="brRankBarFill"
                              style={{
                                width: `${restPct}%`,
                                background: getBarColor(rank, branches.length),
                                position: 'absolute',
                                left: `${renewalPct}%`,
                                top: 0,
                                bottom: 0,
                                borderRadius: renewalPct > 0 ? '0 4px 4px 0' : '4px',
                              }}
                            />
                          )}
                          <div className="brRankJackpotLine" style={{ left: `${jackpotPct}%` }} />
                          <span
                            className={`brRankRevenueLabel${b.total === 0 ? ' brRankZeroVal' : ''}`}
                            style={{ left: `calc(${totalPct}% + 6px)` }}
                          >
                            {b.total === 0 ? 'RM0.00' : formatRM(b.total)}
                          </span>
                        </div>
                      </td>
                      <td style={{
                        textAlign: 'right',
                        paddingRight: 14,
                        whiteSpace: 'nowrap',
                        fontWeight: 700,
                        fontSize: '0.95em',
                        color: b.renewal > 0 ? '#d97706' : 'var(--textSecondary, #94a3b8)',
                      }}>
                        {b.renewal > 0 ? formatRM(b.renewal) : '—'}
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
      </div>
    </div>
  );
}
