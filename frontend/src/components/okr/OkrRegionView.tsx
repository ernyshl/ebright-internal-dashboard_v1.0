import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { apiFetch } from '../../lib/api';
import { BRANCH_META, DAYS } from '../../lib/okr/constants';
import { calcMetrics, n } from '../../lib/okr/utils';

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const REGIONS: ('A' | 'B' | 'C')[] = ['A', 'B', 'C'];
const REGION_COLOR: Record<string, string> = { A: '#dc2626', B: '#2563eb', C: '#16a34a' };

type Range = 'annual' | 'this' | 'last' | 'thisWeek' | 'lastWeek' | 'pick' | 'custom';

interface Aggregate {
  attended: number;
  absent: number;
  frozen: number;
  replaced: number;
  total: number;
  rate: number;        // attended / (attended + absent) × 100
  rateFreeze: number;  // attended / total × 100
  weeks: number;
  branches: number;
}

const EMPTY: Aggregate = { attended: 0, absent: 0, frozen: 0, replaced: 0, total: 0, rate: 0, rateFreeze: 0, weeks: 0, branches: 0 };

function aggregate(records: any[]): Aggregate {
  if (!records.length) return EMPTY;
  let attended = 0, absent = 0, frozen = 0, replaced = 0;
  const branchSet = new Set<string>();
  const weekSet = new Set<string>();
  for (const r of records) {
    const m = calcMetrics(r);
    attended += m.totalAttended;
    absent   += m.totalAbsent;
    frozen   += m.totalFrozen;
    replaced += m.totalReplaced;
    branchSet.add(r.branch);
    if (r.week_date) weekSet.add(String(r.week_date).slice(0, 10));
  }
  const total = attended + absent + frozen + replaced;
  const rate = (attended + absent) > 0 ? (attended / (attended + absent)) * 100 : 0;
  const rateFreeze = total > 0 ? (attended / total) * 100 : 0;
  return { attended, absent, frozen, replaced, total, rate, rateFreeze, weeks: weekSet.size, branches: branchSet.size };
}

function dateRangeForYear(year: number) {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}
function dateRangeForMonth(year: number, month1to12: number) {
  const last = new Date(year, month1to12, 0).getDate();
  const mm = String(month1to12).padStart(2, '0');
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${last}` };
}
function fmtYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function dateRangeForWeek(weeksBack: number) {
  // Mon-anchored Mon→Sun week, weeksBack=0 ⇒ this week, 1 ⇒ last week
  const mon = new Date();
  mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7) - weeksBack * 7);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return { from: fmtYMD(mon), to: fmtYMD(sun) };
}
function shiftRange(from: string, to: string): { from: string; to: string } {
  // For trend baseline: shift the same range by exactly its length backwards.
  const f = new Date(from + 'T00:00:00');
  const t = new Date(to + 'T00:00:00');
  const days = Math.round((t.getTime() - f.getTime()) / 86400000) + 1;
  const newF = new Date(f); newF.setDate(newF.getDate() - days);
  const newT = new Date(t); newT.setDate(newT.getDate() - days);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return { from: fmt(newF), to: fmt(newT) };
}

export function OkrRegionView() {
  const now = new Date();
  const [year, setYear]         = useState<number>(now.getFullYear());
  const [range, setRange]       = useState<Range>('annual');
  const [pickMonth, setPickMonth] = useState<number>(now.getMonth() + 1);
  const [customFrom, setCustomFrom] = useState<string>(`${now.getFullYear()}-01-01`);
  const [customTo, setCustomTo]     = useState<string>(`${now.getFullYear()}-12-31`);

  // Resolve current period range
  const { from, to } = useMemo(() => {
    if (range === 'annual')   return dateRangeForYear(year);
    if (range === 'this')     return dateRangeForMonth(now.getFullYear(), now.getMonth() + 1);
    if (range === 'last') {
      let m = now.getMonth(); let y = now.getFullYear();
      if (m === 0) { m = 12; y -= 1; }
      return dateRangeForMonth(y, m);
    }
    if (range === 'thisWeek') return dateRangeForWeek(0);
    if (range === 'lastWeek') return dateRangeForWeek(1);
    if (range === 'pick')     return dateRangeForMonth(year, pickMonth);
    return { from: customFrom, to: customTo };
  }, [range, year, pickMonth, customFrom, customTo, now]);

  // Pull a wide window once and filter client-side. Backend supports limit-based pull.
  const { data, isLoading } = useQuery({
    queryKey: ['okr-region', from, to],
    queryFn: () => apiFetch(`/api/okr-attendance?limit=2000`),
  });
  const allRecords: any[] = data?.records ?? [];

  const inRange = (d: string, f: string, t: string) => {
    const x = String(d).slice(0, 10);
    return x >= f && x <= t;
  };

  // Current period aggregates per region
  const perRegion = useMemo(() => {
    const out: Record<string, Aggregate> = { A: EMPTY, B: EMPTY, C: EMPTY };
    for (const region of REGIONS) {
      const recs = allRecords.filter(r => inRange(r.week_date ?? '', from, to) && BRANCH_META[r.branch]?.region === region);
      out[region] = aggregate(recs);
    }
    return out;
  }, [allRecords, from, to]);

  // Trend baseline: same range, shifted backwards by its length
  const baseline = shiftRange(from, to);
  const perRegionPrev = useMemo(() => {
    const out: Record<string, Aggregate> = { A: EMPTY, B: EMPTY, C: EMPTY };
    for (const region of REGIONS) {
      const recs = allRecords.filter(r => inRange(r.week_date ?? '', baseline.from, baseline.to) && BRANCH_META[r.branch]?.region === region);
      out[region] = aggregate(recs);
    }
    return out;
  }, [allRecords, baseline.from, baseline.to]);

  // Overall trend (sum across regions) — for the big trend banner
  const overall: Aggregate = useMemo(() => aggregate(
    allRecords.filter(r => inRange(r.week_date ?? '', from, to))
  ), [allRecords, from, to]);
  const overallPrev: Aggregate = useMemo(() => aggregate(
    allRecords.filter(r => inRange(r.week_date ?? '', baseline.from, baseline.to))
  ), [allRecords, baseline.from, baseline.to]);

  const overallRateDelta = overall.rate - overallPrev.rate;
  const overallTotalDelta = overall.total - overallPrev.total;
  const overallTotalPct = overallPrev.total > 0 ? (overallTotalDelta / overallPrev.total) * 100 : 0;
  const trendUp = overallRateDelta >= 0;

  // Bar chart data: one bar per region for each metric
  const chartCounts = useMemo(() => REGIONS.map(r => ({
    region: `Region ${r}`,
    Attended: perRegion[r].attended,
    Absent:   perRegion[r].absent,
    Frozen:   perRegion[r].frozen,
    Replaced: perRegion[r].replaced,
  })), [perRegion]);

  const chartRates = useMemo(() => REGIONS.map(r => ({
    region: `Region ${r}`,
    Rate:       parseFloat(perRegion[r].rate.toFixed(2)),
    RateFreeze: parseFloat(perRegion[r].rateFreeze.toFixed(2)),
  })), [perRegion]);

  const rangeLabel = useMemo(() => {
    if (range === 'annual')   return `Year ${year}`;
    if (range === 'this')     return `This Month (${MONTH_SHORT[now.getMonth()]} ${now.getFullYear()})`;
    if (range === 'last') {
      let m = now.getMonth(); let y = now.getFullYear();
      if (m === 0) { m = 12; y -= 1; }
      return `Last Month (${MONTH_SHORT[m - 1]} ${y})`;
    }
    if (range === 'thisWeek') { const r = dateRangeForWeek(0); return `This Week (${r.from} → ${r.to})`; }
    if (range === 'lastWeek') { const r = dateRangeForWeek(1); return `Last Week (${r.from} → ${r.to})`; }
    if (range === 'pick')     return `${MONTH_SHORT[pickMonth - 1]} ${year}`;
    return `${customFrom} → ${customTo}`;
  }, [range, year, pickMonth, customFrom, customTo, now]);

  return (
    <div className="branchRankingPage">
      <div className="pageHeader" style={{ marginBottom: 18 }}>
        <div className="pageHeaderTitle">🌐 OKR Region — {rangeLabel}</div>
        <div className="pageHeaderSub">
          Region A vs Region B vs Region C — totals (whole numbers) and rates (%) compared
        </div>
      </div>

      {/* ── Filter bar (Year + Range buttons + Pick / Custom inputs) ── */}
      <div className="card" style={{ padding: '14px 18px', marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--textSecondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Year:</span>
          {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
            <button
              key={y}
              type="button"
              onClick={() => setYear(y)}
              style={{
                padding: '6px 14px', borderRadius: 8, fontWeight: 700, fontSize: '0.85rem',
                border: '1.5px solid', cursor: 'pointer',
                borderColor: year === y ? '#dc2626' : 'var(--border)',
                background: year === y ? '#dc2626' : '#fff',
                color: year === y ? '#fff' : 'var(--text)',
              }}
            >{y}</button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--textSecondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Range:</span>
          {([
            { id: 'annual'   as Range, label: 'Annual'      },
            { id: 'this'     as Range, label: 'This Month'  },
            { id: 'last'     as Range, label: 'Last Month'  },
            { id: 'thisWeek' as Range, label: 'This Week'   },
            { id: 'lastWeek' as Range, label: 'Last Week'   },
            { id: 'pick'     as Range, label: 'Pick Month'  },
            { id: 'custom'   as Range, label: 'Custom Range' },
          ]).map(r => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRange(r.id)}
              style={{
                padding: '6px 14px', borderRadius: 8, fontWeight: 700, fontSize: '0.85rem',
                border: '1.5px solid', cursor: 'pointer',
                borderColor: range === r.id ? '#dc2626' : 'var(--border)',
                background: range === r.id ? '#dc2626' : '#fff',
                color: range === r.id ? '#fff' : 'var(--text)',
              }}
            >{r.label}</button>
          ))}

          {range === 'pick' && (
            <select
              value={pickMonth}
              onChange={e => setPickMonth(Number(e.target.value))}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1.5px solid var(--border)', fontSize: '0.85rem', fontWeight: 600 }}
            >
              {MONTH_SHORT.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          )}

          {range === 'custom' && (
            <>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ padding: '5px 10px', borderRadius: 6, border: '1.5px solid var(--border)', fontSize: '0.85rem' }} />
              <span style={{ color: 'var(--textSecondary)' }}>→</span>
              <input type="date" value={customTo}   onChange={e => setCustomTo(e.target.value)}   style={{ padding: '5px 10px', borderRadius: 6, border: '1.5px solid var(--border)', fontSize: '0.85rem' }} />
            </>
          )}
        </div>
      </div>

      {/* ── Overall trend banner ── */}
      <div
        className="card"
        style={{
          padding: '16px 20px', marginBottom: 18,
          background: trendUp ? 'linear-gradient(135deg,#f0fdf4,#dcfce7)' : 'linear-gradient(135deg,#fef2f2,#fee2e2)',
          border: `1.5px solid ${trendUp ? '#86efac' : '#fca5a5'}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--textSecondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Overall Attendance Trend
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: trendUp ? '#15803d' : '#991b1b', lineHeight: 1.1, marginTop: 4 }}>
              {trendUp ? '▲' : '▼'} {(overallRateDelta >= 0 ? '+' : '') + overallRateDelta.toFixed(2)}%
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--textSecondary)', marginTop: 4 }}>
              vs previous period · {overall.rate.toFixed(2)}% now vs {overallPrev.rate.toFixed(2)}% before
            </div>
          </div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--textSecondary)', textTransform: 'uppercase' }}>Total Attendance</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text)' }}>{overall.total.toLocaleString()}</div>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: overallTotalDelta >= 0 ? '#15803d' : '#991b1b' }}>
                {overallTotalDelta >= 0 ? '▲ +' : '▼ '}{overallTotalDelta.toLocaleString()} ({overallTotalPct >= 0 ? '+' : ''}{overallTotalPct.toFixed(1)}%)
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--textSecondary)', textTransform: 'uppercase' }}>Branches × Weeks</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text)' }}>{overall.branches} × {overall.weeks}</div>
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="card"><div className="loadingCard"><div className="loadingDots"><span /><span /><span /></div> Loading…</div></div>
      ) : (
        <>
          {/* ── 3 region cards (whole-number summary) ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14, marginBottom: 18 }}>
            {REGIONS.map(r => {
              const cur = perRegion[r];
              const prev = perRegionPrev[r];
              const dRate = cur.rate - prev.rate;
              const dTotal = cur.total - prev.total;
              const dPct = prev.total > 0 ? (dTotal / prev.total) * 100 : 0;
              return (
                <div key={r} className="card" style={{
                  padding: '14px 16px', borderTop: `4px solid ${REGION_COLOR[r]}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text)' }}>Region {r}</div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: dRate >= 0 ? '#15803d' : '#991b1b' }}>
                      {dRate >= 0 ? '▲' : '▼'} {(dRate >= 0 ? '+' : '') + dRate.toFixed(2)}%
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                    <div style={{ fontSize: '1.6rem', fontWeight: 800, color: REGION_COLOR[r] }}>{cur.rate.toFixed(2)}%</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--textSecondary)' }}>attendance rate</div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
                    {[
                      { label: 'Attended', val: cur.attended, color: '#15803d' },
                      { label: 'Absent',   val: cur.absent,   color: '#b91c1c' },
                      { label: 'Frozen',   val: cur.frozen,   color: '#1e40af' },
                      { label: 'Replaced', val: cur.replaced, color: '#92400e' },
                    ].map(x => (
                      <div key={x.label} style={{ background: '#f8fafc', borderRadius: 6, padding: '6px 10px' }}>
                        <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--textSecondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{x.label}</div>
                        <div style={{ fontSize: '1rem', fontWeight: 800, color: x.color }}>{x.val.toLocaleString()}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--border)', fontSize: '0.78rem', fontWeight: 600 }}>
                    <span style={{ color: 'var(--textSecondary)' }}>Total: <strong style={{ color: 'var(--text)' }}>{cur.total.toLocaleString()}</strong></span>
                    <span style={{ color: dTotal >= 0 ? '#15803d' : '#991b1b' }}>
                      {dTotal >= 0 ? '▲ +' : '▼ '}{dTotal.toLocaleString()} ({dPct >= 0 ? '+' : ''}{dPct.toFixed(1)}%)
                    </span>
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--textSecondary)', marginTop: 4 }}>
                    {cur.branches} {cur.branches === 1 ? 'branch' : 'branches'} · {cur.weeks} {cur.weeks === 1 ? 'week' : 'weeks'}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Bar chart 1: Whole-number counts per region (Attended / Absent / Frozen / Replaced) ── */}
          <div className="card" style={{ padding: '14px 18px', marginBottom: 18 }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--textSecondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
              📊 Attendance Counts by Region
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartCounts} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="region" tick={{ fontSize: 12, fontWeight: 700, fill: 'var(--textSecondary)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                <Bar dataKey="Attended" fill="#16a34a" radius={[4,4,0,0]} maxBarSize={36} />
                <Bar dataKey="Absent"   fill="#dc2626" radius={[4,4,0,0]} maxBarSize={36} />
                <Bar dataKey="Frozen"   fill="#0ea5e9" radius={[4,4,0,0]} maxBarSize={36} />
                <Bar dataKey="Replaced" fill="#f59e0b" radius={[4,4,0,0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: 14, marginTop: 6, flexWrap: 'wrap', fontSize: '0.78rem' }}>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#16a34a', marginRight: 4 }} />Attended</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#dc2626', marginRight: 4 }} />Absent</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#0ea5e9', marginRight: 4 }} />Frozen</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#f59e0b', marginRight: 4 }} />Replaced</span>
            </div>
          </div>

          {/* ── Bar chart 2: Percentage rates per region ── */}
          <div className="card" style={{ padding: '14px 18px' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--textSecondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
              📈 Attendance Rates by Region (%)
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartRates} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="region" tick={{ fontSize: 12, fontWeight: 700, fill: 'var(--textSecondary)' }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} unit="%" />
                <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} formatter={(v: any) => `${v}%`} />
                <Bar dataKey="Rate" name="Attendance Rate" radius={[4,4,0,0]} maxBarSize={42}>
                  {chartRates.map((d, i) => (
                    <Cell key={i} fill={REGION_COLOR[d.region.split(' ')[1]]} />
                  ))}
                </Bar>
                <Bar dataKey="RateFreeze" name="Rate w/ Freeze" radius={[4,4,0,0]} maxBarSize={42} fillOpacity={0.45}>
                  {chartRates.map((d, i) => (
                    <Cell key={i} fill={REGION_COLOR[d.region.split(' ')[1]]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: 14, marginTop: 6, flexWrap: 'wrap', fontSize: '0.78rem' }}>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'var(--text)', marginRight: 4 }} />Solid = Attendance Rate</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'var(--textSecondary)', marginRight: 4, opacity: 0.45 }} />Faded = Rate w/ Freeze</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
