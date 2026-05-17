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

const CAL_DAYS = ['Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

function PairValue({ ct, enr, onClickCt, onClickEnr }: {
  ct: number;
  enr: number;
  onClickCt?: () => void;
  onClickEnr?: () => void;
}) {
  const sharedDigit: React.CSSProperties = {
    fontSize: 30,
    fontWeight: 700,
    padding: '0 4px',
    transition: 'color 120ms',
  };
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 2 }}>
      <span
        onClick={ct > 0 && onClickCt ? onClickCt : undefined}
        style={{
          ...sharedDigit,
          cursor: ct > 0 && onClickCt ? 'pointer' : 'default',
          color: ct > 0 ? (onClickCt ? 'var(--brand)' : 'var(--text)') : 'var(--muted)',
        }}
      >
        {ct}
      </span>
      <span style={{ color: 'var(--muted)', fontSize: 18, fontWeight: 500 }}>|</span>
      <span
        onClick={enr > 0 && onClickEnr ? onClickEnr : undefined}
        style={{
          ...sharedDigit,
          cursor: enr > 0 && onClickEnr ? 'pointer' : 'default',
          color: enr > 0 ? (onClickEnr ? 'var(--brand)' : 'var(--text)') : 'var(--muted)',
        }}
      >
        {enr}
      </span>
    </div>
  );
}

function MetricCard({ label, ct, enr, onClickCt, onClickEnr }: {
  label: string;
  ct: number;
  enr: number;
  onClickCt?: () => void;
  onClickEnr?: () => void;
}) {
  return (
    <div
      style={{
        background: 'var(--inputBg, #f9fafb)',
        border: '1px solid var(--border, #e5e7eb)',
        borderRadius: 10,
        padding: '14px 8px 16px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 4 }}>
        {label}
      </div>
      <PairValue ct={ct} enr={enr} onClickCt={onClickCt} onClickEnr={onClickEnr} />
    </div>
  );
}

function BranchLabel({ name, ctTotal, enrTotal, onClickCt, onClickEnr, bold }: {
  name: string;
  ctTotal: number;
  enrTotal: number;
  onClickCt?: () => void;
  onClickEnr?: () => void;
  bold?: boolean;
}) {
  return (
    <div style={{
      width: 260, flexShrink: 0,
      fontSize: bold ? 18 : 16,
      fontWeight: bold ? 800 : 600,
      color: 'var(--text)',
      display: 'flex', alignItems: 'baseline', gap: 8,
    }}>
      <span>{name}</span>
      <span style={{ color: 'var(--muted)', fontWeight: 500, fontSize: bold ? 16 : 14 }}>
        [
        <span
          onClick={ctTotal > 0 && onClickCt ? onClickCt : undefined}
          style={{
            cursor: ctTotal > 0 && onClickCt ? 'pointer' : 'default',
            color: ctTotal > 0 ? 'var(--brand)' : 'var(--muted)',
            padding: '0 4px',
            fontWeight: bold ? 700 : 600,
          }}
        >
          {ctTotal}
        </span>
        |
        <span
          onClick={enrTotal > 0 && onClickEnr ? onClickEnr : undefined}
          style={{
            cursor: enrTotal > 0 && onClickEnr ? 'pointer' : 'default',
            color: enrTotal > 0 ? 'var(--brand)' : 'var(--muted)',
            padding: '0 4px',
            fontWeight: bold ? 700 : 600,
          }}
        >
          {enrTotal}
        </span>
        ]
      </span>
    </div>
  );
}

function Row({ label, ctValues, enrValues, onCellClickCt, onCellClickEnr, onLabelClickCt, onLabelClickEnr, bold = false }: {
  label: string;
  ctValues: Record<string, number>;
  enrValues: Record<string, number>;
  onCellClickCt?: (day: string) => void;
  onCellClickEnr?: (day: string) => void;
  onLabelClickCt?: () => void;
  onLabelClickEnr?: () => void;
  bold?: boolean;
}) {
  const ctTotal = CAL_DAYS.reduce((s, d) => s + (ctValues[d] || 0), 0);
  const enrTotal = CAL_DAYS.reduce((s, d) => s + (enrValues[d] || 0), 0);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 20,
      background: 'var(--panel)',
      border: '1px solid var(--border, #e5e7eb)',
      borderRadius: 12,
      padding: '16px 24px',
      marginBottom: 12,
    }}>
      <BranchLabel
        name={label}
        ctTotal={ctTotal}
        enrTotal={enrTotal}
        onClickCt={onLabelClickCt}
        onClickEnr={onLabelClickEnr}
        bold={bold}
      />
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        {CAL_DAYS.map(d => (
          <MetricCard
            key={d}
            label={d.slice(0, 3)}
            ct={ctValues[d] || 0}
            enr={enrValues[d] || 0}
            onClickCt={onCellClickCt ? () => onCellClickCt(d) : undefined}
            onClickEnr={onCellClickEnr ? () => onCellClickEnr(d) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

export function DayDistributionPage() {
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
    queryKey: ['dayDistribution', date_from, date_to],
    queryFn: () => apiFetch(`/api/ghl-stages/ct-calendar?date_from=${date_from}&date_to=${date_to}`),
    staleTime: 2 * 60 * 1000,
    enabled: preset !== 'custom' || (!!customFrom && !!customTo),
  });

  // pipeline -> preferred_day -> { ct, enr }
  const { ctMap, enrMap } = useMemo(() => {
    const ct: Record<string, Record<string, number>> = {};
    const enr: Record<string, Record<string, number>> = {};
    for (const r of (data?.rows || [])) {
      if (!r.pipeline_name || !r.preferred_day) continue;
      ct[r.pipeline_name]  ??= {};
      enr[r.pipeline_name] ??= {};
      ct[r.pipeline_name][r.preferred_day]  = (ct[r.pipeline_name][r.preferred_day]  || 0) + Number(r.n     || 0);
      enr[r.pipeline_name][r.preferred_day] = (enr[r.pipeline_name][r.preferred_day] || 0) + Number(r.n_enr || 0);
    }
    return { ctMap: ct, enrMap: enr };
  }, [data]);

  const regionPipelines = region === 'all' ? ALL_PIPELINES : (REGION_PIPELINES[`Region ${region}`] || []);
  const visiblePipelines = branch ? [branch] : regionPipelines;

  const { ctOverall, enrOverall } = useMemo(() => {
    const ct: Record<string, number> = {};
    const enr: Record<string, number> = {};
    for (const day of CAL_DAYS) { ct[day] = 0; enr[day] = 0; }
    for (const pip of visiblePipelines) {
      const pdCt = ctMap[pip] || {};
      const pdEnr = enrMap[pip] || {};
      for (const day of CAL_DAYS) {
        ct[day]  += pdCt[day]  || 0;
        enr[day] += pdEnr[day] || 0;
      }
    }
    return { ctOverall: ct, enrOverall: enr };
  }, [ctMap, enrMap, visiblePipelines]);

  // Build a Lead Centre URL with optional per-cell context. For ENR, via_ct=1
  // tells the backend to apply date/day/slot filters to the linked CT row
  // instead of the ENR row itself — so the drill-down count matches the cell.
  const goToLeadCentre = (pip: string, stage: 'CT' | 'ENR', day?: string) => {
    const p = new URLSearchParams({ stage, preset });
    if (pip) p.set('pipeline', pip);
    if (day) p.set('preferred_day', day);
    if (stage === 'ENR') p.set('via_ct', '1');
    navigate(`/ghl-lead-centre?${p}`);
  };

  return (
    <div className="dashboardPage">
      <div className="dashboardHeader">
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16 }}>
          <h1 className="pageHeaderTitle">Day Distribution</h1>
          <p className="headerSubtitle">CT bookings by day of week · {dateLabel} · Each cell shows CT | ENR · Source: GHL webhook DB</p>
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
          <Row
            label="Overall"
            ctValues={ctOverall}
            enrValues={enrOverall}
            onCellClickCt={(d) => goToLeadCentre('', 'CT',  d)}
            onCellClickEnr={(d) => goToLeadCentre('', 'ENR', d)}
            onLabelClickCt={() => goToLeadCentre('', 'CT')}
            onLabelClickEnr={() => goToLeadCentre('', 'ENR')}
            bold
          />
          {/* Branch rows — always shown so layout is consistent regardless of data */}
          {visiblePipelines.map(pip => (
            <Row
              key={pip}
              label={PIPELINE_TO_BRANCH[pip] || pip}
              ctValues={ctMap[pip] || {}}
              enrValues={enrMap[pip] || {}}
              onCellClickCt={(d) => goToLeadCentre(pip, 'CT',  d)}
              onCellClickEnr={(d) => goToLeadCentre(pip, 'ENR', d)}
              onLabelClickCt={() => goToLeadCentre(pip, 'CT')}
              onLabelClickEnr={() => goToLeadCentre(pip, 'ENR')}
            />
          ))}
        </div>
      )}
    </div>
  );
}
