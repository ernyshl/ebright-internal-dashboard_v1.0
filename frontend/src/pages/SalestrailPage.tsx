import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { BackButton } from '../components/BackButton';

type Period = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'last_7' | 'last_30';

function getPeriodQuery(period: Period): string {
  const now = new Date();
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = fmt(now);
  const yesterday = fmt(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  // Sunday-start week (matches Salestrail)
  const dow = now.getDay();
  const weekStart = fmt(new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow));
  const monthStart = fmt(new Date(now.getFullYear(), now.getMonth(), 1));

  if (period === 'last_7')  return `rolling_days=7`;
  if (period === 'last_30') return `rolling_days=30`;

  const dateMap: Partial<Record<Period, { date_from: string; date_to: string }>> = {
    today:      { date_from: today,      date_to: today },
    yesterday:  { date_from: yesterday,  date_to: yesterday },
    this_week:  { date_from: weekStart,  date_to: today },
    this_month: { date_from: monthStart, date_to: today },
  };
  const d = dateMap[period]!;
  return `date_from=${d.date_from}&date_to=${d.date_to}`;
}

function fmtDuration(secs: number): string {
  if (!secs) return '0s';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function medalColor(rank: number): string {
  if (rank === 1) return '#f59e0b';
  if (rank === 2) return '#94a3b8';
  if (rank === 3) return '#cd7f32';
  return 'transparent';
}

const PERIODS: { label: string; value: Period }[] = [
  { label: 'Today',      value: 'today' },
  { label: 'Yesterday',  value: 'yesterday' },
  { label: 'This Week',  value: 'this_week' },
  { label: 'This Month', value: 'this_month' },
  { label: 'Last 7d',   value: 'last_7' },
  { label: 'Last 30d',  value: 'last_30' },
];

interface RankRow {
  user_id: string;
  user_name: string;
  total_calls: string;
  answered: string;
  missed: string;
  outbound: string;
  inbound: string;
  total_duration_sec: string;
  avg_duration_sec: string;
  answer_rate: string;
}

export function SalestrailPage() {
  const [period, setPeriod] = useState<Period>('today');
  const navigate = useNavigate();

  const periodQuery = getPeriodQuery(period);

  const q = useQuery({
    queryKey: ['salestrail', 'ranking', periodQuery],
    queryFn: () => apiFetch(`/api/salestrail/ranking?${periodQuery}`),
    refetchInterval: 120_000,
  });

  const rows: RankRow[] = q.data?.ranking || [];
  const totalCalls = rows.reduce((s, r) => s + parseInt(r.total_calls), 0);
  const totalAnswered = rows.reduce((s, r) => s + parseInt(r.answered), 0);
  const totalMissed = rows.reduce((s, r) => s + parseInt(r.missed), 0);
  const totalDuration = rows.reduce((s, r) => s + parseInt(r.total_duration_sec || '0'), 0);
  const overallAnswerRate = totalCalls > 0 ? ((totalAnswered / totalCalls) * 100).toFixed(1) : '0.0';

  return (
    <div className="leadsBreakdownPage">
      <div className="pageHeader">
        <div className="backButtonContainer">
          <BackButton to="/" label="Back to Home" />
        </div>
        <div className="pageHeaderTitle">📞 Salestrail Call Ranking</div>
        <div className="pageHeaderSub">Branch call performance · Auto-refresh every 2 min</div>
        <div className="refreshButtonContainer">
          <button className="btn btnSmall" onClick={() => q.refetch()} disabled={q.isFetching}>
            {q.isFetching ? '⟳ Refreshing…' : '⟳ Refresh'}
          </button>
        </div>
      </div>

      {/* Period selector */}
      <div className="section" style={{ paddingTop: 0 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {PERIODS.map(p => (
            <button
              key={p.value}
              className={`btn btnSmall${period === p.value ? ' btnActive' : ''}`}
              onClick={() => setPeriod(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {q.isLoading ? (
        <div className="card">
          <div className="loadingCard"><div className="loadingDots"><span /><span /><span /></div> Loading call data…</div>
        </div>
      ) : q.isError ? (
        <div className="errorText">Failed to load Salestrail data.</div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="summaryStats" style={{ marginBottom: 24 }}>
            <div className="statCard" style={{ '--stat-color': '#3b82f6' } as React.CSSProperties}>
              <div className="statCardIcon">📞</div>
              <div className="statCardContent">
                <div className="statCardValue">{totalCalls.toLocaleString()}</div>
                <div className="statCardTitle">Total Calls</div>
              </div>
            </div>
            <div className="statCard" style={{ '--stat-color': '#10b981' } as React.CSSProperties}>
              <div className="statCardIcon">✅</div>
              <div className="statCardContent">
                <div className="statCardValue">{totalAnswered.toLocaleString()}</div>
                <div className="statCardTitle">Answered</div>
              </div>
            </div>
            <div className="statCard" style={{ '--stat-color': '#ef4444' } as React.CSSProperties}>
              <div className="statCardIcon">❌</div>
              <div className="statCardContent">
                <div className="statCardValue">{totalMissed.toLocaleString()}</div>
                <div className="statCardTitle">Missed</div>
              </div>
            </div>
            <div className="statCard" style={{ '--stat-color': '#f59e0b' } as React.CSSProperties}>
              <div className="statCardIcon">📊</div>
              <div className="statCardContent">
                <div className="statCardValue">{overallAnswerRate}%</div>
                <div className="statCardTitle">Answer Rate</div>
              </div>
            </div>
            <div className="statCard" style={{ '--stat-color': '#6366f1' } as React.CSSProperties}>
              <div className="statCardIcon">⏱️</div>
              <div className="statCardContent">
                <div className="statCardValue">{fmtDuration(totalDuration)}</div>
                <div className="statCardTitle">Total Talk Time</div>
              </div>
            </div>
          </div>

          {/* Ranking table */}
          {rows.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--muted)' }}>
              No call data for this period.
            </div>
          ) : (
            <div className="section">
              <div className="branchTableWrap">
                <table className="branchTable">
                  <thead>
                    <tr>
                      <th style={{ width: 48 }}>#</th>
                      <th>Branch</th>
                      <th className="textRight">Total Calls</th>
                      <th className="textRight">Answered</th>
                      <th className="textRight">Missed</th>
                      <th className="textRight">Answer Rate</th>
                      <th className="textRight">Outbound</th>
                      <th className="textRight">Inbound</th>
                      <th className="textRight">Avg Duration</th>
                      <th className="textRight">Total Talk Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => {
                      const rank = idx + 1;
                      const total = parseInt(row.total_calls);
                      const answered = parseInt(row.answered);
                      const missed = parseInt(row.missed);
                      const outbound = parseInt(row.outbound);
                      const inbound = parseInt(row.inbound);
                      const avgSec = parseInt(row.avg_duration_sec || '0');
                      const totalSec = parseInt(row.total_duration_sec || '0');
                      const rate = parseFloat(row.answer_rate || '0');
                      const isTop = rank <= 3;
                      const barPct = totalCalls > 0 ? Math.round((total / totalCalls) * 100) : 0;

                      return (
                        <tr key={row.user_id} className={isTop ? 'rowTop' : ''}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              {rank <= 3 ? (
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                  width: 24, height: 24, borderRadius: '50%',
                                  background: medalColor(rank), color: rank === 1 ? '#78350f' : rank === 2 ? '#1e293b' : '#7c2d12',
                                  fontWeight: 700, fontSize: 11,
                                }}>
                                  {rank}
                                </span>
                              ) : (
                                <span style={{ color: 'var(--muted)', fontSize: 13, width: 24, textAlign: 'center', display: 'inline-block' }}>{rank}</span>
                              )}
                            </div>
                          </td>
                          <td>
                            <div className="branchName" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <span
                                style={{ cursor: 'pointer', color: 'var(--accent, #3b82f6)', textDecoration: 'underline' }}
                                onClick={() => navigate(`/salestrail/branch/${row.user_id}?period=${encodeURIComponent(periodQuery)}&name=${encodeURIComponent(row.user_name)}`)}
                              >{row.user_name}</span>
                              <div style={{ background: 'var(--surface-muted, #e2e8f0)', borderRadius: 4, height: 4, width: '100%', maxWidth: 120 }}>
                                <div style={{ background: 'var(--accent, #3b82f6)', borderRadius: 4, height: 4, width: `${barPct}%` }} />
                              </div>
                            </div>
                          </td>
                          <td className="textRight fontBold">{total}</td>
                          <td className="textRight" style={{ color: '#10b981' }}>{answered}</td>
                          <td className="textRight" style={{ color: missed > answered ? '#ef4444' : undefined }}>{missed}</td>
                          <td className="textRight">
                            <span style={{
                              fontWeight: 600,
                              color: rate >= 50 ? '#10b981' : rate >= 30 ? '#f59e0b' : '#ef4444',
                            }}>
                              {rate}%
                            </span>
                          </td>
                          <td className="textRight">{outbound}</td>
                          <td className="textRight">{inbound}</td>
                          <td className="textRight" style={{ color: 'var(--muted)', fontSize: 13 }}>{fmtDuration(avgSec)}</td>
                          <td className="textRight" style={{ color: 'var(--muted)', fontSize: 13 }}>{fmtDuration(totalSec)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
