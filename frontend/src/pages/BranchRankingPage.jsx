import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { BackButton } from '../components/BackButton';

const JACKPOT = 80000;

const TIER_DEFS = [
  { label: 'Tier A', emoji: '🥇', reward: 'RM500', color: '#22c55e', size: 6 },
  { label: 'Tier B', emoji: '🥈', reward: 'RM300', color: '#f59e0b', size: 6 },
  { label: 'Tier C', emoji: '🥉', reward: 'RM100', color: '#f97316', size: Infinity },
];

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

function getPresetDates(preset) {
  const now = new Date();
  const fmt = d => d.toISOString().split('T')[0];
  const today = fmt(now);
  if (preset === 'this_week') {
    const day = now.getDay();
    const daysFromMon = day === 0 ? 6 : day - 1;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysFromMon);
    return { date_from: fmt(monday), date_to: today };
  }
  if (preset === 'this_month') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    return { date_from: fmt(first), date_to: today };
  }
  if (preset === 'last_month') {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 0);
    return { date_from: fmt(first), date_to: fmt(last) };
  }
  return { date_from: '', date_to: '' };
}

export function BranchRankingPage() {
  const defaults = getPresetDates('this_month');
  const [dateFrom, setDateFrom] = useState(defaults.date_from);
  const [dateTo, setDateTo] = useState(defaults.date_to);
  const [branch, setBranch] = useState('');
  const [activePreset, setActivePreset] = useState('this_month');

  const applyPreset = (preset) => {
    const { date_from, date_to } = getPresetDates(preset);
    setDateFrom(date_from);
    setDateTo(date_to);
    setActivePreset(preset);
  };

  const handleDateChange = (setter) => (e) => {
    setter(e.target.value);
    setActivePreset(null);
  };

  const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
  if (branch) params.set('branch', branch);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['branch-ranking', dateFrom, dateTo, branch],
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

  // Build tier groups
  const tierRows = [];
  let idx = 0;
  for (const tier of TIER_DEFS) {
    const tierBranches = branches.slice(idx, idx + tier.size);
    if (tierBranches.length === 0) break;
    tierRows.push({ tier, branches: tierBranches, startIdx: idx });
    idx += tierBranches.length;
  }

  return (
    <div className="branchRankingPage">
      <div className="pageHeader">
        <div className="backButtonContainer">
          <BackButton to="/" label="Back to Home" />
        </div>
        <div className="pageHeaderTitle">🏆 Branch Ranking</div>
        <div className="pageHeaderSub">Revenue by branch · {dateFrom} to {dateTo}</div>
        <div className="refreshButtonContainer">
          <button className="btn btnSmall" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? '⟳ Refreshing…' : '⟳ Refresh'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="brRankFilters">
        <div className="brRankFilterGroup">
          <label className="brRankLabel">Date From</label>
          <input type="date" className="filterInput" value={dateFrom}
            onChange={handleDateChange(setDateFrom)} />
        </div>
        <div className="brRankFilterGroup">
          <label className="brRankLabel">Date To</label>
          <input type="date" className="filterInput" value={dateTo}
            onChange={handleDateChange(setDateTo)} />
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
              { key: 'this_week', label: 'This Week' },
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
      </div>

      {/* Summary + Legend */}
      <div className="brRankTopRow">
        <div className="brRankTotalCard">
          <div className="brRankTotalLabel">Total Revenue</div>
          <div className="brRankTotalValue">{formatRM(grandTotal)}</div>
          <div className="brRankTotalSub">{branches.length} branches · {dateFrom} → {dateTo}</div>
        </div>
        <div className="brRankTierLegend">
          <div className="brRankTierBadge" style={{ '--tier-color': '#d97706' }}>
            <span className="brRankTierEmoji">🏆</span>
            <div>
              <div className="brRankTierName">Jackpot</div>
              <div className="brRankTierMin">≥ {formatRM(JACKPOT)}</div>
            </div>
          </div>
          {TIER_DEFS.map(t => (
            <div key={t.label} className="brRankTierBadge" style={{ '--tier-color': t.color }}>
              <span className="brRankTierEmoji">{t.emoji}</span>
              <div>
                <div className="brRankTierName">{t.label}</div>
                <div className="brRankTierReward">{t.reward}</div>
                <div className="brRankTierMin">Top {t.size === Infinity ? 'rest' : t.size}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chart Table */}
      {isLoading ? (
        <div className="card"><div className="loadingCard"><div className="loadingDots"><span /><span /><span /></div> Loading…</div></div>
      ) : isError ? (
        <div className="errorText">Failed to load branch ranking data.</div>
      ) : branches.length === 0 ? (
        <div className="card"><div className="muted" style={{ padding: 24, textAlign: 'center' }}>No data for selected period.</div></div>
      ) : (
        <div className="card brRankChartCard">
          <table className="brRankBarTable">
            <tbody>
              {tierRows.map(({ tier, branches: tierBranches, startIdx }, tIdx) => (
                <>
                  {/* Tier separator header row */}
                  <tr key={`sep-${tier.label}`} className={`brRankTierSepRow${tIdx === 0 ? ' first' : ''}`}>
                    <td colSpan="5">
                      <span style={{ color: tier.color }}>
                        {tier.emoji} {tier.label} — {tier.reward} reward
                      </span>
                    </td>
                  </tr>

                  {/* Branch rows */}
                  {tierBranches.map((b, i) => {
                    const rank = startIdx + i;
                    const barPct = (b.total / maxTotal) * 100;
                    const isJackpot = b.total >= JACKPOT;
                    return (
                      <tr key={b.branch} className="brRankDataRow">
                        <td className="brRankRankCell">
                          <span className={`brRankRankNum${rank < 3 ? ' top3' : ''}`}>
                            #{rank + 1}
                          </span>
                        </td>
                        <td className="brRankNameCell">{b.branch}</td>
                        <td className="brRankBarCell">
                          <div className="brRankBarWrap">
                            <div
                              className="brRankBarFill"
                              style={{
                                width: `${barPct}%`,
                                background: getBarColor(rank, branches.length),
                              }}
                            />
                            <div className="brRankJackpotLine" style={{ left: `${jackpotPct}%` }} />
                          </div>
                        </td>
                        <td className="brRankRevenueCell">
                          <span className={isJackpot ? 'brRankJackpotVal' : ''}>
                            {formatRM(b.total)}
                          </span>
                        </td>
                        {/* Tier badge — only on first row, spans all rows in tier */}
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
                  })}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
