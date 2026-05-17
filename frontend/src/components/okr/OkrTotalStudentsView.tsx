import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from 'recharts';
import { apiFetch } from '../../lib/api';
import { BRANCH_META } from '../../lib/okr/constants';

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const REGIONS: ('A' | 'B' | 'C')[] = ['A', 'B', 'C'];

type Range = 'annual' | 'thisMonth' | 'lastMonth' | 'pickMonth' | 'custom';

function fmtYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Monday-anchored week start for a given date string YYYY-MM-DD.
function weekMonday(dateStr: string): string {
  const d = new Date(dateStr.slice(0, 10) + 'T00:00:00');
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return fmtYMD(d);
}

// Bucket key for the X-axis. When 'month' returns 'YYYY-MM', when 'week' returns 'YYYY-MM-DD' (Monday).
function bucketOf(weekDateYMD: string, mode: 'month' | 'week'): string {
  const mon = weekMonday(weekDateYMD);
  if (mode === 'week') return mon;
  return mon.slice(0, 7); // YYYY-MM
}

function inRange(weekDateYMD: string, from: string, to: string): boolean {
  const d = weekDateYMD.slice(0, 10);
  return d >= from && d <= to;
}

export function OkrTotalStudentsView() {
  const now = new Date();
  const [year, setYear]               = useState<number>(now.getFullYear());
  const [range, setRange]             = useState<Range>('annual');
  const [pickMonth, setPickMonth]     = useState<number>(now.getMonth() + 1);
  const [customFrom, setCustomFrom]   = useState<string>(`${now.getFullYear()}-01-01`);
  const [customTo, setCustomTo]       = useState<string>(`${now.getFullYear()}-12-31`);
  const [region, setRegion]           = useState<'all' | 'A' | 'B' | 'C'>('all');
  const [branch, setBranch]           = useState<string>('all');

  // Resolve current date window + bucketing mode
  const { from, to, mode } = useMemo<{ from: string; to: string; mode: 'month' | 'week' }>(() => {
    if (range === 'annual') {
      return { from: `${year}-01-01`, to: `${year}-12-31`, mode: 'month' };
    }
    if (range === 'thisMonth') {
      const y = now.getFullYear(), m = now.getMonth() + 1;
      const last = new Date(y, m, 0).getDate();
      const mm = String(m).padStart(2, '0');
      return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${last}`, mode: 'week' };
    }
    if (range === 'lastMonth') {
      let y = now.getFullYear(), m = now.getMonth(); // 0=Jan; m as 0..11
      if (m === 0) { y -= 1; m = 12; }
      const last = new Date(y, m, 0).getDate();
      const mm = String(m).padStart(2, '0');
      return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${last}`, mode: 'week' };
    }
    if (range === 'pickMonth') {
      const last = new Date(year, pickMonth, 0).getDate();
      const mm = String(pickMonth).padStart(2, '0');
      return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${last}`, mode: 'week' };
    }
    return { from: customFrom, to: customTo, mode: 'week' };
  }, [range, year, pickMonth, customFrom, customTo, now]);

  // Fetch all records (large limit). Same pattern as YearlyDashboardView.
  const { data, isLoading } = useQuery({
    queryKey: ['okr-total-students-all'],
    queryFn: () => apiFetch('/api/okr-attendance?limit=2000'),
    staleTime: 60_000,
  });
  const allRecords: any[] = (data as any)?.records ?? [];

  // All branches that exist in the data (for "All Regions" view)
  const branchList = useMemo(() => {
    const set = new Set<string>();
    for (const r of allRecords) if (r.branch) set.add(r.branch);
    return Array.from(set).sort();
  }, [allRecords]);

  // Branches scoped to the selected region — these become the visible pills.
  // When region='all' we show every branch; otherwise only branches whose
  // BRANCH_META.region matches the selected region.
  const branchesForRegion = useMemo(() => {
    if (region === 'all') return branchList;
    return branchList.filter(b => BRANCH_META[b]?.region === region);
  }, [branchList, region]);

  // If the user picks a region that doesn't contain the currently-selected
  // branch, reset branch to 'all' so the chart doesn't end up empty.
  const handleRegionChange = (r: 'all' | 'A' | 'B' | 'C') => {
    setRegion(r);
    if (branch !== 'all') {
      const branchRegion = BRANCH_META[branch]?.region;
      if (r !== 'all' && branchRegion !== r) setBranch('all');
    }
  };

  // Filter + bucket the records
  // Each chart bar = sum of active_students across all (filtered) branches' LATEST week in the bucket.
  const chartData = useMemo(() => {
    const filtered = allRecords.filter(r => {
      const ymd = String(r.week_date ?? '').slice(0, 10);
      if (!ymd || !inRange(ymd, from, to)) return false;
      if (region !== 'all') {
        const reg = BRANCH_META[r.branch]?.region;
        if (reg !== region) return false;
      }
      if (branch !== 'all' && r.branch !== branch) return false;
      return true;
    });

    // For each (bucket, branch), keep the LATEST week's record (so monthly view doesn't
    // double-count when a branch reports multiple weeks in the same month).
    const latestByBranchPerBucket = new Map<string, Map<string, any>>();
    for (const r of filtered) {
      const ymd = String(r.week_date).slice(0, 10);
      const b = bucketOf(ymd, mode);
      const inner = latestByBranchPerBucket.get(b) ?? new Map<string, any>();
      const existing = inner.get(r.branch);
      if (!existing || String(existing.week_date).slice(0, 10) < ymd) inner.set(r.branch, r);
      latestByBranchPerBucket.set(b, inner);
    }

    // Build all bucket keys in the range (so empty buckets show 0)
    const bucketKeys: string[] = [];
    if (mode === 'month') {
      const y = parseInt(from.slice(0, 4), 10);
      for (let m = 1; m <= 12; m++) bucketKeys.push(`${y}-${String(m).padStart(2, '0')}`);
    } else {
      // Walk Monday-by-Monday from first Monday in range to last Monday in range.
      const start = new Date(from + 'T00:00:00');
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
      const end = new Date(to + 'T00:00:00');
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 7)) {
        bucketKeys.push(fmtYMD(d));
      }
    }

    // Aggregate active_students per bucket
    return bucketKeys.map(key => {
      const inner = latestByBranchPerBucket.get(key);
      let total = 0;
      let branchesCounted = 0;
      if (inner) {
        for (const rec of inner.values()) {
          total += Number(rec.active_students ?? 0);
          branchesCounted += 1;
        }
      }
      const label = mode === 'month'
        ? MONTH_SHORT[parseInt(key.slice(5, 7), 10) - 1]
        : (() => {
            const d = new Date(key + 'T00:00:00');
            return `${d.getDate()}/${d.getMonth() + 1}`;
          })();
      return { key, label, total, branches: branchesCounted };
    });
  }, [allRecords, from, to, mode, region, branch]);

  // Summary KPIs for the cards above the chart
  const summary = useMemo(() => {
    const nonZero = chartData.filter(d => d.total > 0);
    if (nonZero.length === 0) return { peak: 0, latest: 0, latestLabel: '—', avg: 0, growth: 0 };
    const peak   = Math.max(...nonZero.map(d => d.total));
    const latest = nonZero[nonZero.length - 1];
    const first  = nonZero[0];
    const avg    = Math.round(nonZero.reduce((s, d) => s + d.total, 0) / nonZero.length);
    const growth = first.total > 0 ? Math.round(((latest.total - first.total) / first.total) * 100) : 0;
    return { peak, latest: latest.total, latestLabel: latest.label, avg, growth };
  }, [chartData]);

  const yearOptions = useMemo(() => {
    const yrs = new Set<number>([now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]);
    for (const r of allRecords) {
      const y = parseInt(String(r.week_date ?? '').slice(0, 4), 10);
      if (y > 0) yrs.add(y);
    }
    return Array.from(yrs).sort();
  }, [allRecords, now]);

  return (
    <div className="okrDashWrap">

      {/* ── Filters ── */}
      <div className="card" style={{ padding: 18, marginBottom: 16 }}>

        {/* Year row */}
        <FilterRow label="Year">
          {yearOptions.map(y => (
            <Pill key={y} active={year === y} onClick={() => setYear(y)}>{y}</Pill>
          ))}
        </FilterRow>

        {/* Range row */}
        <FilterRow label="Range">
          <Pill active={range === 'annual'}    onClick={() => setRange('annual')}>Annual</Pill>
          <Pill active={range === 'thisMonth'} onClick={() => setRange('thisMonth')}>This Month</Pill>
          <Pill active={range === 'lastMonth'} onClick={() => setRange('lastMonth')}>Last Month</Pill>
          <Pill active={range === 'pickMonth'} onClick={() => setRange('pickMonth')}>Pick Month</Pill>
          <Pill active={range === 'custom'}    onClick={() => setRange('custom')}>Custom Range</Pill>
        </FilterRow>

        {/* Pick Month dropdown (only when range='pickMonth') */}
        {range === 'pickMonth' && (
          <FilterRow label="Month">
            {MONTH_SHORT.map((m, i) => (
              <Pill key={m} active={pickMonth === i + 1} onClick={() => setPickMonth(i + 1)}>{m}</Pill>
            ))}
          </FilterRow>
        )}

        {/* Custom range inputs */}
        {range === 'custom' && (
          <FilterRow label="From – To">
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1.5px solid var(--border)', fontSize: '0.85rem' }} />
            <span style={{ color: 'var(--textSecondary)', fontWeight: 600 }}>–</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1.5px solid var(--border)', fontSize: '0.85rem' }} />
          </FilterRow>
        )}

        {/* Region row */}
        <FilterRow label="Region">
          <Pill active={region === 'all'} onClick={() => handleRegionChange('all')}>All</Pill>
          {REGIONS.map(r => (
            <Pill key={r} active={region === r} onClick={() => handleRegionChange(r)}>Region {r}</Pill>
          ))}
        </FilterRow>

        {/* Branch pills — scoped to the selected region */}
        <FilterRow label="Branch">
          <Pill active={branch === 'all'} onClick={() => setBranch('all')}>All</Pill>
          {branchesForRegion.map(b => (
            <Pill key={b} active={branch === b} onClick={() => setBranch(b)}>{b}</Pill>
          ))}
        </FilterRow>
      </div>

      {/* ── Summary KPIs ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 16 }}>
        <KpiCard label="Latest Period"   value={summary.latest.toLocaleString()} sub={summary.latestLabel} accent="#dc2626" />
        <KpiCard label="Peak"            value={summary.peak.toLocaleString()}   sub="highest in range"    accent="#2563eb" />
        <KpiCard label="Average"         value={summary.avg.toLocaleString()}    sub="per period"          accent="#16a34a" />
        <KpiCard label="Growth (1st → latest)" value={`${summary.growth > 0 ? '+' : ''}${summary.growth}%`}
                 sub={summary.growth >= 0 ? '↑ up' : '↓ down'}
                 accent={summary.growth >= 0 ? '#16a34a' : '#dc2626'} />
      </div>

      {/* ── Chart ── */}
      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: '0.95rem', fontWeight: 800 }}>
              📈 Total Active Students {mode === 'month' ? 'by Month' : 'by Week'}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--textSecondary)', marginTop: 2 }}>
              {region === 'all' ? 'All regions' : `Region ${region}`}
              {' · '}
              {branch === 'all' ? 'All branches' : branch}
              {' · '}
              {from} → {to}
            </div>
          </div>
        </div>

        {isLoading ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--textSecondary)' }}>Loading…</div>
        ) : chartData.every(d => d.total === 0) ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--textSecondary)' }}>
            No active student data for this period.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={360}>
            <ComposedChart data={chartData} margin={{ top: 20, right: 16, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#475569' }} />
              <YAxis tick={{ fontSize: 12, fill: '#475569' }} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: 'rgba(22, 163, 74, 0.06)' }}
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const d = payload[0].payload as { label: string; total: number; branches: number };
                  return (
                    <div style={{ background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a' }}>{d.label}</div>
                      <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: 2 }}>
                        <span style={{ color: '#16a34a', fontWeight: 700 }}>{d.total.toLocaleString()}</span> active students
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--textSecondary)' }}>
                        across {d.branches} {d.branches === 1 ? 'branch' : 'branches'}
                      </div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="total" fill="#16a34a" radius={[6, 6, 0, 0]}>
                <LabelList dataKey="total" position="top" style={{ fontSize: 11, fontWeight: 700, fill: '#0f172a' }}
                  formatter={(v: number) => v > 0 ? v.toLocaleString() : ''} />
              </Bar>
              <Line
                type="monotone"
                dataKey="total"
                stroke="#16a34a"
                strokeWidth={2.5}
                dot={{ r: 4, fill: '#16a34a', strokeWidth: 2, stroke: '#fff' }}
                activeDot={{ r: 6 }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

// ─── Small helpers ───────────────────────────────────────────────────────────

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', flexWrap: 'wrap' }}>
      <div style={{ minWidth: 70, fontSize: '0.72rem', fontWeight: 700, color: 'var(--textSecondary)',
                    textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}:
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>{children}</div>
    </div>
  );
}

function Pill({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '6px 14px',
        borderRadius: 8,
        border: '1.5px solid',
        borderColor: active ? 'var(--brand, #e1251b)' : 'var(--border)',
        background: active ? 'var(--brand, #e1251b)' : '#fff',
        color: active ? '#fff' : 'var(--text)',
        fontWeight: 700, fontSize: '0.8rem',
        cursor: 'pointer',
        transition: 'all 0.12s',
      }}
    >
      {children}
    </button>
  );
}

function KpiCard({ label, value, sub, accent }: { label: string; value: string; sub: string; accent: string }) {
  return (
    <div style={{ background: '#fff', border: '1.5px solid var(--border)', borderRadius: 10, padding: '14px 16px', borderLeft: `4px solid ${accent}` }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--textSecondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0f172a', marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: '0.72rem', color: 'var(--textSecondary)', marginTop: 2 }}>{sub}</div>
    </div>
  );
}
