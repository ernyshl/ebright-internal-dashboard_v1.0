import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, Cell, ResponsiveContainer,
} from 'recharts';
import { apiFetch } from '../lib/api';
import { BackButton } from '../components/BackButton';

// ── Tier thresholds (RM) ──────────────────────────────────────────────────────
const JACKPOT   = 80000;
const TIER_A    = 30000; // RM500 reward
const TIER_B    = 20000; // RM300 reward
const TIER_C    = 10000; // RM100 reward

const TIER_REWARDS = [
  { label: 'Jackpot', min: JACKPOT, color: '#d97706', reward: null,  emoji: '🏆' },
  { label: 'Tier A',  min: TIER_A,  color: '#22c55e', reward: 'RM500', emoji: '🥇' },
  { label: 'Tier B',  min: TIER_B,  color: '#f59e0b', reward: 'RM300', emoji: '🥈' },
  { label: 'Tier C',  min: TIER_C,  color: '#f97316', reward: 'RM100', emoji: '🥉' },
  { label: 'Below',   min: 0,       color: '#ef4444', reward: null,   emoji: '' },
];

function getBarColor(total) {
  if (total >= JACKPOT)  return '#d97706';
  if (total >= TIER_A)   return '#22c55e';
  if (total >= TIER_B)   return '#f59e0b';
  if (total >= TIER_C)   return '#f97316';
  return '#ef4444';
}

function getTierLabel(total) {
  if (total >= JACKPOT) return 'Jackpot';
  if (total >= TIER_A)  return 'Tier A';
  if (total >= TIER_B)  return 'Tier B';
  if (total >= TIER_C)  return 'Tier C';
  return '—';
}

function formatRM(val) {
  if (val === null || val === undefined) return '—';
  return `RM${Number(val).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getDefaultDates() {
  const now   = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const fmt   = d => d.toISOString().split('T')[0];
  return { date_from: fmt(first), date_to: fmt(now) };
}

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const { branch, total, count } = payload[0].payload;
  return (
    <div className="brRankTooltip">
      <div className="brRankTooltipTitle">{branch}</div>
      <div className="brRankTooltipRow"><span>Total Revenue</span><strong>{formatRM(total)}</strong></div>
      <div className="brRankTooltipRow"><span>Invoices</span><strong>{count}</strong></div>
      <div className="brRankTooltipRow"><span>Tier</span><strong>{getTierLabel(total)}</strong></div>
    </div>
  );
};

const CustomBarLabel = ({ x, y, width, height, value }) => {
  const label = formatRM(value);
  const textX  = x + width + 6;
  const textY  = y + height / 2;
  return (
    <text x={textX} y={textY} fill="var(--textSecondary)" fontSize={11} dominantBaseline="middle">
      {label}
    </text>
  );
};

export function BranchRankingPage() {
  const defaults = getDefaultDates();
  const [dateFrom, setDateFrom] = useState(defaults.date_from);
  const [dateTo,   setDateTo]   = useState(defaults.date_to);
  const [branch,   setBranch]   = useState('');

  const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
  if (branch) params.set('branch', branch);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['branch-ranking', dateFrom, dateTo, branch],
    queryFn: () => apiFetch(`/api/finance/branch-ranking?${params}`),
    staleTime: 60_000,
  });

  const branches   = data?.branches || [];
  const grandTotal = data?.grandTotal || 0;
  const branchList = data?.branchList || [];

  // chart needs a specific height based on row count
  const chartHeight = Math.max(branches.length * 46 + 80, 300);

  return (
    <div className="branchRankingPage">
      <div className="pageHeader">
        <div className="backButtonContainer">
          <BackButton to="/" label="Back to Home" />
        </div>
        <div className="pageHeaderTitle">🏆 Branch Ranking</div>
        <div className="pageHeaderSub">Monthly revenue by branch · {dateFrom} to {dateTo}</div>
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
            onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div className="brRankFilterGroup">
          <label className="brRankLabel">Date To</label>
          <input type="date" className="filterInput" value={dateTo}
            onChange={e => setDateTo(e.target.value)} />
        </div>
        <div className="brRankFilterGroup">
          <label className="brRankLabel">Branch</label>
          <select className="filterSelect" value={branch} onChange={e => setBranch(e.target.value)}>
            <option value="">All Branches</option>
            {branchList.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
      </div>

      {/* Summary + Tier Legend */}
      <div className="brRankTopRow">
        <div className="brRankTotalCard">
          <div className="brRankTotalLabel">Total Revenue</div>
          <div className="brRankTotalValue">{formatRM(grandTotal)}</div>
          <div className="brRankTotalSub">{branches.length} branches · {dateFrom} → {dateTo}</div>
        </div>
        <div className="brRankTierLegend">
          {TIER_REWARDS.filter(t => t.reward || t.label === 'Jackpot').map(t => (
            <div key={t.label} className="brRankTierBadge" style={{ '--tier-color': t.color }}>
              <span className="brRankTierEmoji">{t.emoji}</span>
              <div>
                <div className="brRankTierName">{t.label}</div>
                {t.reward && <div className="brRankTierReward">{t.reward}</div>}
                <div className="brRankTierMin">≥ {formatRM(t.min)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chart */}
      {isLoading ? (
        <div className="card"><div className="loadingCard"><div className="loadingDots"><span /><span /><span /></div> Loading…</div></div>
      ) : isError ? (
        <div className="errorText">Failed to load branch ranking data.</div>
      ) : branches.length === 0 ? (
        <div className="card"><div className="muted" style={{ padding: 24, textAlign: 'center' }}>No data for selected period.</div></div>
      ) : (
        <div className="card brRankChartCard">
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart
              layout="vertical"
              data={branches}
              margin={{ top: 8, right: 160, bottom: 8, left: 180 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
              <XAxis
                type="number"
                tickFormatter={v => `RM${(v / 1000).toFixed(0)}K`}
                domain={[0, Math.max(JACKPOT * 1.1, (branches[0]?.total || 0) * 1.1)]}
                tick={{ fontSize: 11, fill: 'var(--textSecondary)' }}
                axisLine={{ stroke: 'var(--border)' }}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="branch"
                width={175}
                tick={{ fontSize: 12, fill: 'var(--text)' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />

              {/* Tier reference lines */}
              <ReferenceLine x={JACKPOT} stroke="#d97706" strokeDasharray="6 3" strokeWidth={2}
                label={{ value: 'Jackpot', position: 'insideTopRight', fontSize: 11, fill: '#d97706', fontWeight: 700 }} />
              <ReferenceLine x={TIER_A} stroke="#22c55e" strokeDasharray="4 2" strokeOpacity={0.6}
                label={{ value: 'Tier A', position: 'insideTopRight', fontSize: 10, fill: '#22c55e' }} />
              <ReferenceLine x={TIER_B} stroke="#f59e0b" strokeDasharray="4 2" strokeOpacity={0.6}
                label={{ value: 'Tier B', position: 'insideTopRight', fontSize: 10, fill: '#f59e0b' }} />
              <ReferenceLine x={TIER_C} stroke="#f97316" strokeDasharray="4 2" strokeOpacity={0.6}
                label={{ value: 'Tier C', position: 'insideTopRight', fontSize: 10, fill: '#f97316' }} />

              <Bar dataKey="total" radius={[0, 4, 4, 0]} label={<CustomBarLabel />} maxBarSize={32}>
                {branches.map((entry, idx) => (
                  <Cell key={idx} fill={getBarColor(entry.total)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Ranking Table */}
      {!isLoading && !isError && branches.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <table className="branchTable">
            <thead>
              <tr>
                <th style={{ width: 48 }}>Rank</th>
                <th>Branch</th>
                <th className="textRight">Total Revenue</th>
                <th className="textRight">Invoices</th>
                <th className="textRight">Tier</th>
              </tr>
            </thead>
            <tbody>
              {branches.map((b, idx) => {
                const tier = TIER_REWARDS.find(t => b.total >= t.min);
                return (
                  <tr key={b.branch} className={idx < 3 ? 'rowTop' : ''}>
                    <td>
                      <div className="branchName">
                        {idx < 3 && <span className="rankBadge">#{idx + 1}</span>}
                        {idx >= 3 && <span style={{ color: 'var(--muted)', fontSize: 13 }}>#{idx + 1}</span>}
                      </div>
                    </td>
                    <td>{b.branch}</td>
                    <td className="textRight fontBold">{formatRM(b.total)}</td>
                    <td className="textRight">{b.count}</td>
                    <td className="textRight">
                      <span className="brRankTierTag" style={{ '--tier-color': tier?.color || '#64748b' }}>
                        {tier?.emoji} {getTierLabel(b.total)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
