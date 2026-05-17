import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { BackButton } from '../components/BackButton';

type Period = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'last_7' | 'last_30';
type CallFilter = 'all' | 'answered' | 'missed' | 'no_answer';

function getPeriodQuery(period: Period): string {
  const now = new Date();
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = fmt(now);
  const yesterday = fmt(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
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

const BRANCH_NAME_MAP: Record<string, string> = {
  'Ebright TSG':          'Ebright Taman Sri Gombak',
  'Ebright BTHO':         'Ebright Bandar Tun Hussein Onn',
  'ebright subang taipan': 'Ebright Subang Taipan',
  'Ebright coach':        'Ebright Head Quarters',
  'Ebright Rimbayu':      'Ebright Bandar Rimbayu',
};

function displayName(name: string): string {
  return BRANCH_NAME_MAP[name] ?? name;
}

const FILTER_META: Record<CallFilter, { icon: string; label: string; subtext: string; color: string }> = {
  all:       { icon: '📞', label: 'All Calls',               subtext: 'All calls across all branches',                  color: '#3b82f6' },
  answered:  { icon: '✅', label: 'Answered Calls',          subtext: 'Calls that were successfully answered',           color: '#10b981' },
  missed:    { icon: '📵', label: 'Missed Calls (BM)',        subtext: 'Customer called — branch manager did not answer', color: '#ef4444' },
  no_answer: { icon: '🔇', label: 'No Answer (Customer)',     subtext: 'Branch called — customer did not pick up',       color: '#f97316' },
};

interface RankRow {
  user_id: string;
  user_name: string;
  total_calls: string;
  answered: string;
  missed: string;
  no_answer: string;
  outbound: string;
  inbound: string;
  total_duration_sec: string;
  avg_duration_sec: string;
  answer_rate: string;
}

interface RecHealth {
  user_id: string;
  sim_answered: number;
  sim_no_rec: number;
  pct_missing: number;
  status: 'OK' | 'PARTIAL' | 'BROKEN';
}

interface ModalCallRow {
  call_id: string;
  user_id: string;
  user_name: string;
  call_date: string;
  call_time: string;
  duration: string;
  answered: boolean;
  inbound: boolean;
  number: string;
  formatted_number: string;
  phonebook_name: string | null;
}

export function SalestrailPage() {
  const [period, setPeriod] = useState<Period>('today');
  const [activeFilter, setActiveFilter] = useState<CallFilter | null>(null);
  const navigate = useNavigate();

  const periodQuery = getPeriodQuery(period);

  const q = useQuery({
    queryKey: ['salestrail', 'ranking', periodQuery],
    queryFn: () => apiFetch(`/api/salestrail/ranking?${periodQuery}`),
    refetchInterval: 120_000,
  });

  const healthQ = useQuery({
    queryKey: ['salestrail', 'recording-health'],
    queryFn: () => apiFetch('/api/salestrail/recording-health'),
    staleTime: 5 * 60_000,
  });

  const healthMap: Record<string, RecHealth> = {};
  for (const h of (healthQ.data?.health ?? []) as RecHealth[]) {
    healthMap[h.user_id] = h;
  }

  const modalQ = useQuery({
    queryKey: ['salestrail', 'all-calls', activeFilter, periodQuery],
    queryFn: () => apiFetch(`/api/salestrail/all-calls?type=${activeFilter}&${periodQuery}`),
    enabled: !!activeFilter,
  });

  const rows: RankRow[] = q.data?.ranking || [];
  const modalCalls: ModalCallRow[] = modalQ.data?.calls || [];

  const totalCalls = rows.reduce((s, r) => s + parseInt(r.total_calls), 0);
  const totalAnswered = rows.reduce((s, r) => s + parseInt(r.answered), 0);
  const totalMissed = rows.reduce((s, r) => s + parseInt(r.missed), 0);
  const totalNoAnswer = rows.reduce((s, r) => s + parseInt(r.no_answer), 0);
  const totalDuration = rows.reduce((s, r) => s + parseInt(r.total_duration_sec || '0'), 0);
  const overallAnswerRate = totalCalls > 0 ? ((totalAnswered / totalCalls) * 100).toFixed(1) : '0.0';

  function openFilter(f: CallFilter) {
    setActiveFilter(prev => prev === f ? null : f);
  }

  const clickableCard = (color: string, filter: CallFilter): React.CSSProperties => ({
    '--stat-color': color,
    cursor: 'pointer',
    outline: activeFilter === filter ? `2px solid ${color}` : '2px solid transparent',
    outlineOffset: 2,
    transition: 'outline 0.15s',
  } as React.CSSProperties);

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
            <div className="statCard" style={clickableCard('#3b82f6', 'all')} onClick={() => openFilter('all')}>
              <div className="statCardIcon">📞</div>
              <div className="statCardContent">
                <div className="statCardValue">{totalCalls.toLocaleString()}</div>
                <div className="statCardTitle">Total Calls</div>
              </div>
            </div>
            <div className="statCard" style={clickableCard('#10b981', 'answered')} onClick={() => openFilter('answered')}>
              <div className="statCardIcon">✅</div>
              <div className="statCardContent">
                <div className="statCardValue">{totalAnswered.toLocaleString()}</div>
                <div className="statCardTitle">Answered</div>
              </div>
            </div>
            <div className="statCard" style={clickableCard('#ef4444', 'missed')} onClick={() => openFilter('missed')}>
              <div className="statCardIcon">📵</div>
              <div className="statCardContent">
                <div className="statCardValue">{totalMissed.toLocaleString()}</div>
                <div className="statCardTitle">Missed (BM)</div>
              </div>
            </div>
            <div className="statCard" style={clickableCard('#f97316', 'no_answer')} onClick={() => openFilter('no_answer')}>
              <div className="statCardIcon">🔇</div>
              <div className="statCardContent">
                <div className="statCardValue">{totalNoAnswer.toLocaleString()}</div>
                <div className="statCardTitle">No Answer (Customer)</div>
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
                      <th className="textRight">Missed (BM)</th>
                      <th className="textRight">No Answer (Cust)</th>
                      <th className="textRight">Answer Rate</th>
                      <th className="textRight">Outbound</th>
                      <th className="textRight">Inbound</th>
                      <th className="textRight">Avg Duration</th>
                      <th className="textRight">Total Talk Time</th>
                      <th className="textCenter">Recording</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => {
                      const rank = idx + 1;
                      const total = parseInt(row.total_calls);
                      const answered = parseInt(row.answered);
                      const missed = parseInt(row.missed);
                      const noAnswer = parseInt(row.no_answer);
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
                                onClick={() => navigate(`/salestrail/branch/${row.user_id}?period=${encodeURIComponent(periodQuery)}&name=${encodeURIComponent(displayName(row.user_name))}`)}
                              >{displayName(row.user_name)}</span>
                              <div style={{ background: 'var(--surface-muted, #e2e8f0)', borderRadius: 4, height: 4, width: '100%', maxWidth: 120 }}>
                                <div style={{ background: 'var(--accent, #3b82f6)', borderRadius: 4, height: 4, width: `${barPct}%` }} />
                              </div>
                            </div>
                          </td>
                          <td className="textRight fontBold">{total}</td>
                          <td className="textRight" style={{ color: '#10b981' }}>{answered}</td>
                          <td className="textRight" style={{ color: missed > 0 ? '#ef4444' : undefined }}>{missed}</td>
                          <td className="textRight" style={{ color: noAnswer > 0 ? '#f97316' : undefined }}>{noAnswer}</td>
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
                          <td className="textCenter">
                            {(() => {
                              const h = healthMap[row.user_id];
                              if (!h) return <span style={{ color: 'var(--muted)', fontSize: 11 }}>—</span>;
                              const palette = {
                                OK:      { bg: '#d1fae5', color: '#065f46' },
                                PARTIAL: { bg: '#fef3c7', color: '#92400e' },
                                BROKEN:  { bg: '#fee2e2', color: '#991b1b' },
                              };
                              const c = palette[h.status];
                              return (
                                <span
                                  title={`${h.pct_missing}% of SIM calls missing recording (last 30d, ${h.sim_no_rec}/${h.sim_answered})`}
                                  style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: c.bg, color: c.color, cursor: 'help' }}
                                >
                                  {h.status}
                                </span>
                              );
                            })()}
                          </td>
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

      {/* Call details modal */}
      {activeFilter && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.65)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            padding: '60px 16px 24px',
            overflowY: 'auto',
          }}
          onClick={() => setActiveFilter(null)}
        >
          <div
            style={{
              background: 'var(--surface, #1e293b)',
              borderRadius: 12, padding: 24, width: '100%', maxWidth: 900,
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
                  {FILTER_META[activeFilter].icon} {FILTER_META[activeFilter].label}
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                  {FILTER_META[activeFilter].subtext}
                </div>
              </div>
              <button
                onClick={() => setActiveFilter(null)}
                style={{
                  background: 'none', border: '1px solid var(--border, #334155)',
                  color: 'var(--text)', borderRadius: 6, padding: '4px 12px',
                  cursor: 'pointer', fontSize: 16, flexShrink: 0, marginLeft: 16,
                }}
              >✕</button>
            </div>

            {!modalQ.isLoading && !modalQ.isError && (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
                {modalCalls.length} call{modalCalls.length !== 1 ? 's' : ''} found
                {modalCalls.length >= 500 ? ' (showing first 500)' : ''}
              </div>
            )}

            {modalQ.isLoading ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
                <div className="loadingDots"><span /><span /><span /></div> Loading calls…
              </div>
            ) : modalQ.isError ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}>Failed to load call details.</div>
            ) : modalCalls.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>No calls found for this period.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="branchTable">
                  <thead>
                    <tr>
                      <th>Branch</th>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Contact</th>
                      <th className="textCenter">Direction</th>
                      <th className="textRight">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modalCalls.map(call => {
                      const contact = call.phonebook_name || call.formatted_number || call.number || '—';
                      const dur = parseInt(call.duration || '0');
                      return (
                        <tr key={call.call_id}>
                          <td style={{ fontSize: 13, fontWeight: 600 }}>{displayName(call.user_name)}</td>
                          <td style={{ fontSize: 13 }}>{call.call_date}</td>
                          <td style={{ fontSize: 13, color: 'var(--muted)' }}>{call.call_time?.slice(0, 5)}</td>
                          <td style={{ fontSize: 13 }}>{contact}</td>
                          <td className="textCenter">
                            <span style={{
                              fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                              background: call.inbound ? '#dbeafe' : '#fef3c7',
                              color: call.inbound ? '#1d4ed8' : '#92400e',
                            }}>
                              {call.inbound ? '← IN' : '→ OUT'}
                            </span>
                          </td>
                          <td className="textRight" style={{ fontSize: 13, color: 'var(--muted)' }}>
                            {dur > 0 ? fmtDuration(dur) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
