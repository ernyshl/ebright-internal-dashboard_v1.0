import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BackButton } from '../components/BackButton';
import { apiFetch } from '../lib/api';
import { getApiDateRange, formatDateRange, PIPELINE_TO_BRANCH, REGION_PIPELINES, ALL_PIPELINES } from '../lib/leadsSheet';

const PRESETS = [
  { key: 'today',      label: 'Today' },
  { key: 'yesterday',  label: 'Yesterday' },
  { key: 'this_week',  label: 'This Week' },
  { key: 'last_week',  label: 'Last Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'custom',     label: 'Custom' },
];

const CAL_DAYS = ['Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div style={{
      background: 'var(--inputBg, #f9fafb)',
      border: '1px solid var(--border, #e5e7eb)',
      borderRadius: 10,
      padding: '18px 12px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 30, fontWeight: 700, color: value > 0 ? 'var(--text)' : 'var(--muted)' }}>
        {value}
      </div>
    </div>
  );
}

function Row({ label, values, bold = false }: { label: string; values: Record<string, number>; bold?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 20,
      background: 'var(--panel)',
      border: '1px solid var(--border, #e5e7eb)',
      borderRadius: 12,
      padding: '16px 24px',
      marginBottom: 12,
    }}>
      <div style={{
        minWidth: 140, flexShrink: 0,
        fontSize: bold ? 18 : 16,
        fontWeight: bold ? 800 : 600,
        color: 'var(--text)',
      }}>{label}</div>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        {CAL_DAYS.map(d => (
          <MetricCard key={d} label={d.slice(0, 3)} value={values[d] || 0} />
        ))}
      </div>
    </div>
  );
}

export function DayDistributionPage() {
  const [preset, setPreset]         = useState('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo]     = useState('');
  const [region, setRegion]         = useState<'all'|'A'|'B'|'C'>('all');
  const [branch, setBranch]         = useState('');

  useEffect(() => { setBranch(''); }, [region]);

  let date_from: string, date_to: string;
  if (preset === 'custom') {
    date_from = customFrom;
    date_to   = customTo;
  } else {
    ({ date_from, date_to } = getApiDateRange(preset));
  }

  const dateLabel = preset === 'custom' ? `${customFrom} – ${customTo}` : formatDateRange(preset);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['dayDistribution', date_from, date_to],
    queryFn: () => apiFetch(`/api/ghl-stages/ct-calendar?date_from=${date_from}&date_to=${date_to}`),
    staleTime: 2 * 60 * 1000,
    enabled: preset !== 'custom' || (!!customFrom && !!customTo),
  });

  // pipeline -> preferred_day -> count
  const dayMap = useMemo(() => {
    const m: Record<string, Record<string, number>> = {};
    for (const r of (data?.rows || [])) {
      if (!r.pipeline_name || !r.preferred_day) continue;
      m[r.pipeline_name] ??= {};
      m[r.pipeline_name][r.preferred_day] = (m[r.pipeline_name][r.preferred_day] || 0) + Number(r.n || 0);
    }
    return m;
  }, [data]);

  const regionPipelines = region === 'all' ? ALL_PIPELINES : (REGION_PIPELINES[`Region ${region}`] || []);
  const visiblePipelines = branch ? [branch] : regionPipelines;

  const overall: Record<string, number> = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const day of CAL_DAYS) totals[day] = 0;
    for (const pip of visiblePipelines) {
      const pd = dayMap[pip] || {};
      for (const day of CAL_DAYS) totals[day] += pd[day] || 0;
    }
    return totals;
  }, [dayMap, visiblePipelines]);

  return (
    <div className="dashboardPage">
      <div className="dashboardHeader">
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16 }}>
          <h1 className="pageHeaderTitle">Day Distribution</h1>
          <p className="headerSubtitle">CT bookings by day of week · {dateLabel} · Source: GHL webhook DB</p>
        </div>
      </div>

      {/* Date presets */}
      <div className="ldFilterBar" style={{ marginBottom: 8 }}>
        {PRESETS.map(p => (
          <button key={p.key} className={`btn ${preset === p.key ? 'btnPrimary' : 'btnGhost'} btnSmall`}
            onClick={() => setPreset(p.key)}>{p.label}</button>
        ))}
        <button className="btn btnGhost btnSmall" onClick={() => refetch()} style={{ marginLeft: 'auto' }}>↺ Refresh</button>
      </div>

      {preset === 'custom' && (
        <div className="brRankFilters" style={{ marginBottom: 8, gap: 12 }}>
          <div className="brRankFilterGroup">
            <label className="brRankLabel">From</label>
            <input type="date" className="filterInput" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
          </div>
          <div className="brRankFilterGroup">
            <label className="brRankLabel">To</label>
            <input type="date" className="filterInput" value={customTo} onChange={e => setCustomTo(e.target.value)} />
          </div>
        </div>
      )}

      {/* Region filter */}
      <div className="ldFilterBar" style={{ marginBottom: 8 }}>
        {(['all', 'A', 'B', 'C'] as const).map(r => (
          <button key={r} className={`btn ${region === r ? 'btnPrimary' : 'btnGhost'} btnSmall`}
            onClick={() => setRegion(r)}>
            {r === 'all' ? 'All Regions' : `Region ${r}`}
          </button>
        ))}
      </div>

      {/* Branch filter */}
      {region !== 'all' && (
        <div className="ldFilterBar" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
          <button className={`btn ${branch === '' ? 'btnPrimary' : 'btnGhost'} btnSmall`}
            onClick={() => setBranch('')}>All</button>
          {(REGION_PIPELINES[`Region ${region}`] || []).map(pip => (
            <button key={pip}
              className={`btn ${branch === pip ? 'btnPrimary' : 'btnGhost'} btnSmall`}
              onClick={() => setBranch(pip === branch ? '' : pip)}>
              {PIPELINE_TO_BRANCH[pip] || pip}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div className="loadingDots"><span /><span /><span /></div>
          <p style={{ marginTop: 12, color: 'var(--muted)' }}>Loading…</p>
        </div>
      ) : (
        <div>
          {/* Overall row */}
          <Row label="Overall" values={overall} bold />
          {/* Branch rows */}
          {visiblePipelines.map(pip => {
            const pd = dayMap[pip] || {};
            const total = CAL_DAYS.reduce((s, d) => s + (pd[d] || 0), 0);
            if (total === 0) return null;
            return (
              <Row key={pip} label={PIPELINE_TO_BRANCH[pip] || pip} values={pd} />
            );
          })}
        </div>
      )}
    </div>
  );
}
