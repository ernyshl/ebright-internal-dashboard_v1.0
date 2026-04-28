import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
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

const STAGES = ['NL', 'CT', 'SU', 'ENR'] as const;

type StageMap = { NL: number; CT: number; SU: number; ENR: number };

function MetricCard({ label, value, onClick }: { label: string; value: number; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--inputBg, #f9fafb)',
        border: '1px solid var(--border, #e5e7eb)',
        borderRadius: 10,
        padding: '18px 12px',
        textAlign: 'center',
        cursor: onClick && value > 0 ? 'pointer' : 'default',
        transition: 'border-color 120ms',
      }}
      onMouseEnter={e => { if (onClick && value > 0) e.currentTarget.style.borderColor = 'var(--brand)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border, #e5e7eb)'; }}
    >
      <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 30, fontWeight: 700, color: value > 0 && onClick ? 'var(--brand)' : 'var(--text)' }}>
        {value}
      </div>
    </div>
  );
}

function Row({ label, values, onCellClick, bold = false }: {
  label: string;
  values: StageMap;
  onCellClick?: (stage: typeof STAGES[number]) => void;
  bold?: boolean;
}) {
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
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {STAGES.map(s => (
          <MetricCard key={s} label={s} value={values[s]} onClick={onCellClick ? () => onCellClick(s) : undefined} />
        ))}
      </div>
    </div>
  );
}

export function LeadsDashboardV2Page() {
  const navigate = useNavigate();
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
    queryKey: ['leadsDashV2', date_from, date_to],
    queryFn: () => apiFetch(`/api/ghl-stages/by-pipeline?date_from=${date_from}&date_to=${date_to}`),
    staleTime: 2 * 60 * 1000,
    enabled: preset !== 'custom' || (!!customFrom && !!customTo),
  });

  const byPipeline = useMemo(() => {
    const m: Record<string, StageMap> = {};
    for (const r of (data?.byPipeline || [])) {
      m[r.pipeline_name] = { NL: Number(r.nl)||0, CT: Number(r.ct)||0, SU: Number(r.su)||0, ENR: Number(r.enr)||0 };
    }
    return m;
  }, [data]);

  const regionPipelines = region === 'all' ? ALL_PIPELINES : (REGION_PIPELINES[`Region ${region}`] || []);
  const visiblePipelines = branch ? [branch] : regionPipelines;

  const overall: StageMap = useMemo(() => visiblePipelines.reduce(
    (acc, pip) => {
      const r = byPipeline[pip] || { NL: 0, CT: 0, SU: 0, ENR: 0 };
      return { NL: acc.NL + r.NL, CT: acc.CT + r.CT, SU: acc.SU + r.SU, ENR: acc.ENR + r.ENR };
    },
    { NL: 0, CT: 0, SU: 0, ENR: 0 } as StageMap
  ), [byPipeline, visiblePipelines]);

  const goToLeadCentre = (pip: string, stage: string) => {
    const p = new URLSearchParams({ stage, preset });
    if (pip) p.set('pipeline', pip);
    navigate(`/ghl-lead-centre?${p}`);
  };

  return (
    <div className="dashboardPage">
      <div className="dashboardHeader">
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16 }}>
          <h1 className="pageHeaderTitle">Leads Dashboard v2</h1>
          <p className="headerSubtitle">NL → CT → SU → ENR · {dateLabel} · Source: GHL webhook DB</p>
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
          <Row label="Overall" values={overall} onCellClick={(s) => goToLeadCentre('', s)} bold />
          {/* Branch rows */}
          {visiblePipelines.map(pip => {
            const r = byPipeline[pip] || { NL: 0, CT: 0, SU: 0, ENR: 0 };
            if (r.NL + r.CT + r.SU + r.ENR === 0) return null;
            return (
              <Row
                key={pip}
                label={PIPELINE_TO_BRANCH[pip] || pip}
                values={r}
                onCellClick={(s) => goToLeadCentre(pip, s)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
