import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { BackButton } from '../components/BackButton';
import { apiFetch } from '../lib/api';
import { getUser } from '../lib/auth';
import { REGION_PIPELINES, PIPELINE_TO_BRANCH } from '../lib/leadsSheet';

type Region = 'A' | 'B' | 'C';
type Level = 'overall' | 'region' | 'branch';
type TimeMode = 'annual' | 'this_month' | 'last_month' | 'pick_month' | 'custom';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const RATE_DEFS = [
  { key: 'conversion', label: 'Conversion Rate',  num: 'ENR', den: 'NL',  targetKey: 'conversion_rate' },
  { key: 'confirmed',  label: 'Confirmed Rate',   num: 'CT',  den: 'NL',  targetKey: 'confirmed_rate' },
  { key: 'show_up',    label: 'Show Up Rate',     num: 'SU',  den: 'CT',  targetKey: 'show_up_rate' },
  { key: 'enrolment',  label: 'Enrolment Rate',   num: 'ENR', den: 'SU',  targetKey: 'enrolment_rate' },
] as const;

// ── helpers ──────────────────────────────────────────────────────────────
const fmtDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const startOfMonth = (y: number, m: number) => new Date(y, m, 1);
const endOfMonth = (y: number, m: number) => new Date(y, m + 1, 0);
const startOfYear = (y: number) => new Date(y, 0, 1);
const endOfYear = (y: number) => new Date(y, 11, 31);

// Monday on or before the given date
const mondayOf = (d: Date) => {
  const dow = d.getDay(); // 0=Sun..6=Sat
  const diff = dow === 0 ? -6 : 1 - dow;
  const m = new Date(d);
  m.setDate(d.getDate() + diff);
  m.setHours(0, 0, 0, 0);
  return m;
};

// Generate the bucket list the chart should display.
function buildBuckets(
  granularity: 'month' | 'week',
  from: Date,
  to: Date,
): Array<{ key: string; label: string }> {
  const buckets: Array<{ key: string; label: string }> = [];
  if (granularity === 'month') {
    const start = new Date(from.getFullYear(), from.getMonth(), 1);
    const end = new Date(to.getFullYear(), to.getMonth(), 1);
    const cur = new Date(start);
    while (cur <= end) {
      buckets.push({
        key: fmtDate(cur),
        label: MONTH_NAMES[cur.getMonth()],
      });
      cur.setMonth(cur.getMonth() + 1);
    }
  } else {
    const start = mondayOf(from);
    const cur = new Date(start);
    while (cur <= to) {
      buckets.push({
        key: fmtDate(cur),
        label: `${MONTH_NAMES[cur.getMonth()]} ${cur.getDate()}`,
      });
      cur.setDate(cur.getDate() + 7);
    }
  }
  return buckets;
}

// Compute date range and granularity for the current filter state.
function resolveRange(
  year: number,
  timeMode: TimeMode,
  pickedMonth: number | null,
  customFrom: string,
  customTo: string,
): { from: Date; to: Date; granularity: 'month' | 'week' } {
  const now = new Date();
  if (timeMode === 'annual') {
    return { from: startOfYear(year), to: endOfYear(year), granularity: 'month' };
  }
  if (timeMode === 'this_month') {
    return { from: startOfMonth(now.getFullYear(), now.getMonth()), to: endOfMonth(now.getFullYear(), now.getMonth()), granularity: 'week' };
  }
  if (timeMode === 'last_month') {
    const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { from: startOfMonth(lm.getFullYear(), lm.getMonth()), to: endOfMonth(lm.getFullYear(), lm.getMonth()), granularity: 'week' };
  }
  if (timeMode === 'pick_month' && pickedMonth !== null) {
    return { from: startOfMonth(year, pickedMonth), to: endOfMonth(year, pickedMonth), granularity: 'week' };
  }
  if (timeMode === 'custom' && customFrom && customTo) {
    const f = new Date(customFrom);
    const t = new Date(customTo);
    const days = Math.ceil((t.getTime() - f.getTime()) / 86400000);
    return { from: f, to: t, granularity: days > 60 ? 'month' : 'week' };
  }
  // fallback
  return { from: startOfYear(year), to: endOfYear(year), granularity: 'month' };
}

// Aggregate raw rows into per-bucket NL/CT/SU/ENR counts.
function aggregateByBucket(
  rows: Array<{ bucket: string; pipeline_name: string; stage_key: string; n: number }>,
  buckets: Array<{ key: string }>,
) {
  const empty = { NL: 0, CT: 0, SU: 0, ENR: 0 };
  const map: Record<string, typeof empty> = {};
  for (const b of buckets) map[b.key] = { ...empty };
  for (const r of rows) {
    const key = r.bucket.slice(0, 10);
    if (!map[key]) continue;
    map[key][r.stage_key as keyof typeof empty] += Number(r.n) || 0;
  }
  return map;
}

// ── chart component ──────────────────────────────────────────────────────
function RateChart({
  title,
  buckets,
  data,
  numKey,
  denKey,
  target,
  height = 220,
}: {
  title: string;
  buckets: Array<{ key: string; label: string }>;
  data: Record<string, { NL: number; CT: number; SU: number; ENR: number }>;
  numKey: 'NL' | 'CT' | 'SU' | 'ENR';
  denKey: 'NL' | 'CT' | 'SU' | 'ENR';
  target: number;
  height?: number;
}) {
  const chartData = buckets.map(b => {
    const counts = data[b.key] || { NL: 0, CT: 0, SU: 0, ENR: 0 };
    const num = counts[numKey];
    const den = counts[denKey];
    const rate = den > 0 ? (num / den) * 100 : 0;
    return { label: b.label, rate: Number(rate.toFixed(2)), num, den, target };
  });

  return (
    <div className="card" style={{ padding: 12, minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{title}</div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload || !payload.length) return null;
              const d = payload[0].payload as any;
              return (
                <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', padding: 8, borderRadius: 6, fontSize: 12 }}>
                  <div style={{ fontWeight: 600 }}>{d.label}</div>
                  <div>Rate: <strong>{d.rate}%</strong></div>
                  <div style={{ color: 'var(--muted)' }}>{numKey}: {d.num} / {denKey}: {d.den}</div>
                  <div style={{ color: 'var(--muted)' }}>Target: {d.target}%</div>
                </div>
              );
            }}
          />
          <ReferenceLine y={target} stroke="#dc2626" strokeDasharray="4 4" />
          <Bar dataKey="rate" fill="#3b82f6" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── edit targets modal ───────────────────────────────────────────────────
function EditTargetsModal({
  open,
  onClose,
  current,
}: {
  open: boolean;
  onClose: () => void;
  current: { conversion_rate: number; confirmed_rate: number; show_up_rate: number; enrolment_rate: number };
}) {
  const qc = useQueryClient();
  const [vals, setVals] = useState(current);
  useEffect(() => { setVals(current); }, [current, open]);

  const save = useMutation({
    mutationFn: (body: typeof current) => apiFetch('/api/branch-performance/targets', { method: 'PUT', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kpi-targets'] });
      onClose();
    },
  });

  if (!open) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }} onClick={onClose}>
      <div className="card" style={{ width: 400, padding: 20 }} onClick={e => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Edit KPI Targets</h3>
        <p style={{ fontSize: 12, color: 'var(--muted)' }}>Values are %. Used as the red dashed line on every chart.</p>
        {RATE_DEFS.map(r => (
          <label key={r.key} className="field" style={{ display: 'block', marginBottom: 12 }}>
            <div className="label">{r.label}</div>
            <input
              className="input"
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={(vals as any)[r.targetKey]}
              onChange={e => setVals({ ...vals, [r.targetKey]: Number(e.target.value) })}
            />
          </label>
        ))}
        {save.isError && (
          <div className="errorText" style={{ marginBottom: 8 }}>
            {(save.error as any)?.data?.error || 'Save failed'}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btnGhost" onClick={onClose}>Cancel</button>
          <button className="btn btnPrimary" onClick={() => save.mutate(vals)} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── main page ────────────────────────────────────────────────────────────
export function BranchPerformancePage() {
  const user = getUser();
  const isSuperAdmin = user?.role === 'super_admin';

  const [level, setLevel] = useState<Level>('overall');
  const [region, setRegion] = useState<Region | null>(null);
  const [pipeline, setPipeline] = useState<string | null>(null);

  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());
  const [timeMode, setTimeMode] = useState<TimeMode>('annual');
  const [pickedMonth, setPickedMonth] = useState<number | null>(null);
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');

  const [editOpen, setEditOpen] = useState(false);

  const { from, to, granularity } = useMemo(
    () => resolveRange(year, timeMode, pickedMonth, customFrom, customTo),
    [year, timeMode, pickedMonth, customFrom, customTo],
  );

  const fromStr = fmtDate(from);
  const toStr = fmtDate(to);
  const buckets = useMemo(() => buildBuckets(granularity, from, to), [granularity, from, to]);

  // Targets
  const { data: targets } = useQuery({
    queryKey: ['kpi-targets'],
    queryFn: () => apiFetch('/api/branch-performance/targets'),
    staleTime: 5 * 60 * 1000,
  });
  const t = targets || { conversion_rate: 7, confirmed_rate: 40, show_up_rate: 50, enrolment_rate: 33 };

  const yearOptions = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];
  const availableRegions: Region[] = ['A', 'B', 'C'];

  return (
    <div className="dashboardPage">
      <div className="dashboardHeader">
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 className="pageHeaderTitle">Branch Performance</h1>
            <BreadCrumb level={level} region={region} pipeline={pipeline}
              onJump={(target) => {
                if (target === 'overall')  { setLevel('overall'); setRegion(null); setPipeline(null); }
                if (target === 'region')   { setLevel('region'); setPipeline(null); }
              }}
            />
          </div>
          {isSuperAdmin && (
            <button className="btn btnGhost btnSmall" onClick={() => setEditOpen(true)}>⚙ Edit Targets</button>
          )}
        </div>
      </div>

      {/* Year chips */}
      <div className="ldFilterBar" style={{ marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--muted)', marginRight: 8 }}>Year:</span>
        {yearOptions.map(y => (
          <button
            key={y}
            className={`btn ${year === y ? 'btnPrimary' : 'btnGhost'} btnSmall`}
            onClick={() => setYear(y)}
          >
            {y}
          </button>
        ))}
      </div>

      {/* Time mode chips */}
      <div className="ldFilterBar" style={{ marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--muted)', marginRight: 8 }}>Range:</span>
        <button className={`btn ${timeMode === 'annual' ? 'btnPrimary' : 'btnGhost'} btnSmall`} onClick={() => { setTimeMode('annual'); setPickedMonth(null); }}>Annual</button>
        <button className={`btn ${timeMode === 'this_month' ? 'btnPrimary' : 'btnGhost'} btnSmall`} onClick={() => { setTimeMode('this_month'); setPickedMonth(null); setYear(now.getFullYear()); }}>This Month</button>
        <button className={`btn ${timeMode === 'last_month' ? 'btnPrimary' : 'btnGhost'} btnSmall`} onClick={() => { setTimeMode('last_month'); setPickedMonth(null); setYear(now.getFullYear()); }}>Last Month</button>
        <button className={`btn ${timeMode === 'pick_month' ? 'btnPrimary' : 'btnGhost'} btnSmall`} onClick={() => { setTimeMode('pick_month'); if (pickedMonth === null) setPickedMonth(now.getMonth()); }}>Pick Month</button>
        <button className={`btn ${timeMode === 'custom' ? 'btnPrimary' : 'btnGhost'} btnSmall`} onClick={() => setTimeMode('custom')}>Custom Range</button>
      </div>

      {/* Month chip row when in pick_month mode */}
      {timeMode === 'pick_month' && (
        <div className="ldFilterBar" style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)', marginRight: 8 }}>Month:</span>
          {MONTH_NAMES.map((m, i) => (
            <button
              key={m}
              className={`btn ${pickedMonth === i ? 'btnPrimary' : 'btnGhost'} btnSmall`}
              onClick={() => setPickedMonth(i)}
            >
              {m}
            </button>
          ))}
        </div>
      )}

      {/* Custom range inputs */}
      {timeMode === 'custom' && (
        <div className="ldFilterBar" style={{ marginBottom: 8, gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>From:</span>
          <input className="input" type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ width: 160 }} />
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>To:</span>
          <input className="input" type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{ width: 160 }} />
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        {level === 'overall' && (
          <OverallView fromStr={fromStr} toStr={toStr} granularity={granularity} buckets={buckets} targets={t}
            onDrillRegion={(r) => { setLevel('region'); setRegion(r); }}
          />
        )}
        {level === 'region' && (
          <RegionView fromStr={fromStr} toStr={toStr} granularity={granularity} buckets={buckets} targets={t}
            availableRegions={availableRegions} activeRegion={region}
            onSelectRegion={(r) => setRegion(r)}
            onDrillBranch={(p) => { setLevel('branch'); setPipeline(p); }}
          />
        )}
        {level === 'branch' && pipeline && region && (
          <BranchView fromStr={fromStr} toStr={toStr} granularity={granularity} buckets={buckets} targets={t}
            region={region} pipeline={pipeline} onSelectPipeline={(p) => setPipeline(p)}
          />
        )}
      </div>

      <EditTargetsModal open={editOpen} onClose={() => setEditOpen(false)} current={t} />
    </div>
  );
}

// ── breadcrumb ───────────────────────────────────────────────────────────
function BreadCrumb({ level, region, pipeline, onJump }: {
  level: Level;
  region: Region | null;
  pipeline: string | null;
  onJump: (target: 'overall' | 'region') => void;
}) {
  const link = (label: string, target: 'overall' | 'region', last: boolean) => last
    ? <span style={{ fontWeight: 600 }}>{label}</span>
    : <a onClick={(e) => { e.preventDefault(); onJump(target); }} href="#" style={{ color: 'var(--brand)', textDecoration: 'none' }}>{label}</a>;
  const sep = <span style={{ color: 'var(--muted)', margin: '0 6px' }}>›</span>;
  return (
    <p className="headerSubtitle" style={{ marginTop: 4 }}>
      {link('Overall', 'overall', level === 'overall')}
      {level !== 'overall' && <>{sep}{link(`Region ${region}`, 'region', level === 'region')}</>}
      {level === 'branch' && pipeline && <>{sep}<span style={{ fontWeight: 600 }}>{pipeline} · {PIPELINE_TO_BRANCH[pipeline] || ''}</span></>}
    </p>
  );
}

// ── overall view ─────────────────────────────────────────────────────────
function OverallView({ fromStr, toStr, granularity, buckets, targets, onDrillRegion }: any) {
  const { data, isLoading } = useQuery({
    queryKey: ['bp-rates', 'overall', fromStr, toStr, granularity],
    queryFn: () => apiFetch(`/api/branch-performance/rates?scope=overall&granularity=${granularity}&from=${fromStr}&to=${toStr}`),
    staleTime: 60 * 1000,
  });
  if (isLoading) return <Spinner />;
  const aggregated = aggregateByBucket(data?.rows || [], buckets);
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        {RATE_DEFS.map(r => (
          <RateChart
            key={r.key}
            title={r.label}
            buckets={buckets}
            data={aggregated}
            numKey={r.num as any}
            denKey={r.den as any}
            target={Number((targets as any)[r.targetKey]) || 0}
          />
        ))}
      </div>
      <div className="ldFilterBar">
        <span style={{ fontSize: 12, color: 'var(--muted)', marginRight: 8 }}>Drill into:</span>
        {(['A', 'B', 'C'] as Region[]).map(r => (
          <button key={r} className="btn btnGhost btnSmall" onClick={() => onDrillRegion(r)}>Region {r}</button>
        ))}
      </div>
    </>
  );
}

// ── region view ──────────────────────────────────────────────────────────
function RegionView({ fromStr, toStr, granularity, buckets, targets, availableRegions, activeRegion, onSelectRegion, onDrillBranch }: any) {
  return (
    <>
      <div className="ldFilterBar" style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: 'var(--muted)', marginRight: 8 }}>Region:</span>
        {availableRegions.map((r: Region) => (
          <button
            key={r}
            className={`btn ${activeRegion === r ? 'btnPrimary' : 'btnGhost'} btnSmall`}
            onClick={() => onSelectRegion(r)}
          >
            Region {r}
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        {availableRegions.map((r: Region) => (
          <RegionPanel
            key={r}
            region={r}
            isActive={activeRegion === r}
            fromStr={fromStr} toStr={toStr} granularity={granularity} buckets={buckets} targets={targets}
          />
        ))}
      </div>
      {activeRegion && (
        <div className="ldFilterBar">
          <span style={{ fontSize: 12, color: 'var(--muted)', marginRight: 8 }}>Drill into branch:</span>
          {REGION_PIPELINES[`Region ${activeRegion}`].map((p: string) => (
            <button key={p} className="btn btnGhost btnSmall" onClick={() => onDrillBranch(p)}>{p}</button>
          ))}
        </div>
      )}
    </>
  );
}

function RegionPanel({ region, isActive, fromStr, toStr, granularity, buckets, targets }: any) {
  const { data, isLoading } = useQuery({
    queryKey: ['bp-rates', 'region', region, fromStr, toStr, granularity],
    queryFn: () => apiFetch(`/api/branch-performance/rates?scope=region&region=${region}&granularity=${granularity}&from=${fromStr}&to=${toStr}`),
    staleTime: 60 * 1000,
  });
  const aggregated = aggregateByBucket(data?.rows || [], buckets);
  return (
    <div className="card" style={{ padding: 12, border: isActive ? '2px solid var(--brand)' : undefined }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Region {region}</div>
      {isLoading ? <Spinner small /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {RATE_DEFS.map(r => (
            <RateChart
              key={r.key}
              title={r.label}
              buckets={buckets}
              data={aggregated}
              numKey={r.num as any}
              denKey={r.den as any}
              target={Number((targets as any)[r.targetKey]) || 0}
              height={160}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── branch view ──────────────────────────────────────────────────────────
function BranchView({ fromStr, toStr, granularity, buckets, targets, region, pipeline, onSelectPipeline }: any) {
  const branches = REGION_PIPELINES[`Region ${region}`] || [];
  const { data, isLoading } = useQuery({
    queryKey: ['bp-rates', 'branch', pipeline, fromStr, toStr, granularity],
    queryFn: () => apiFetch(`/api/branch-performance/rates?scope=branch&branch=${encodeURIComponent(pipeline)}&granularity=${granularity}&from=${fromStr}&to=${toStr}`),
    staleTime: 60 * 1000,
  });
  const aggregated = aggregateByBucket(data?.rows || [], buckets);
  return (
    <>
      <div className="ldFilterBar" style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: 'var(--muted)', marginRight: 8 }}>Branch:</span>
        {branches.map((p: string) => (
          <button
            key={p}
            className={`btn ${pipeline === p ? 'btnPrimary' : 'btnGhost'} btnSmall`}
            onClick={() => onSelectPipeline(p)}
          >
            {p}
          </button>
        ))}
      </div>
      {isLoading ? <Spinner /> : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
          {RATE_DEFS.map(r => (
            <RateChart
              key={r.key}
              title={`${r.label} · ${pipeline} (${PIPELINE_TO_BRANCH[pipeline] || ''})`}
              buckets={buckets}
              data={aggregated}
              numKey={r.num as any}
              denKey={r.den as any}
              target={Number((targets as any)[r.targetKey]) || 0}
              height={260}
            />
          ))}
        </div>
      )}
    </>
  );
}

function Spinner({ small = false }: { small?: boolean }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: small ? 12 : 32 }}>
      <div className="loadingDots"><span /><span /><span /></div>
    </div>
  );
}
