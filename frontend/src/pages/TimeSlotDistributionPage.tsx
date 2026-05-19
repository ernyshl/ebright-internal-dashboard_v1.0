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

const CAL_DAYS = ['Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const WEEKDAY_SET = new Set(['Wednesday', 'Thursday', 'Friday']);
const WEEKEND_SET = new Set(['Saturday', 'Sunday']);

const WEEKEND_CODES = ['0915', '1030', '1200', '1315', '1445', '1600', '1730'];
const WEEKDAY_CODES = ['1800', '1915', '2030'];
const ALL_SLOT_CODES = [...WEEKEND_CODES, ...WEEKDAY_CODES];

function getVisibleCodes(selectedDay: string): string[] {
  if (!selectedDay) return ALL_SLOT_CODES;
  if (WEEKDAY_SET.has(selectedDay)) return WEEKDAY_CODES;
  if (WEEKEND_SET.has(selectedDay)) return WEEKEND_CODES;
  return ALL_SLOT_CODES;
}

function PairValue({ ct, enr, onClickCt, onClickEnr }: {
  ct: number;
  enr: number;
  onClickCt?: () => void;
  onClickEnr?: () => void;
}) {
  const sharedDigit: React.CSSProperties = {
    fontSize: 26,
    fontWeight: 700,
    padding: '0 3px',
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
      <span style={{ color: 'var(--muted)', fontSize: 15, fontWeight: 500 }}>|</span>
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
        padding: '12px 6px 14px',
        textAlign: 'center',
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600, marginBottom: 4 }}>
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

function Row({ label, ctValues, enrValues, codes, onCellClickCt, onCellClickEnr, onLabelClickCt, onLabelClickEnr, bold = false }: {
  label: string;
  ctValues: Record<string, number>;
  enrValues: Record<string, number>;
  codes: string[];
  onCellClickCt?: (code: string) => void;
  onCellClickEnr?: (code: string) => void;
  onLabelClickCt?: () => void;
  onLabelClickEnr?: () => void;
  bold?: boolean;
}) {
  const ctTotal = codes.reduce((s, c) => s + (ctValues[c] || 0), 0);
  const enrTotal = codes.reduce((s, c) => s + (enrValues[c] || 0), 0);
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
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${codes.length}, 1fr)`, gap: 10 }}>
        {codes.map(c => (
          <MetricCard
            key={c}
            label={c}
            ct={ctValues[c] || 0}
            enr={enrValues[c] || 0}
            onClickCt={onCellClickCt ? () => onCellClickCt(c) : undefined}
            onClickEnr={onCellClickEnr ? () => onCellClickEnr(c) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

export function TimeSlotDistributionPage() {
  const navigate = useNavigate();
  const [preset, setPreset]           = useState('today');
  const [customFrom, setCustomFrom]   = useState('');
  const [customTo, setCustomTo]       = useState('');
  const [region, setRegion]           = useState<'all'|'A'|'B'|'C'>('all');
  const [branch, setBranch]           = useState('');
  const [selectedDay, setSelectedDay] = useState('');

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
    queryKey: ['timeSlotDist', date_from, date_to],
    queryFn: () => apiFetch(`/api/ghl-stages/ct-calendar?date_from=${date_from}&date_to=${date_to}`),
    staleTime: 2 * 60 * 1000,
    enabled: preset !== 'custom' || (!!customFrom && !!customTo),
  });

  const visibleCodes = getVisibleCodes(selectedDay);

  // pipeline -> slot_code -> { ct, enr }, filtered by selectedDay if set.
  const { ctMap, enrMap } = useMemo(() => {
    const ct: Record<string, Record<string, number>> = {};
    const enr: Record<string, Record<string, number>> = {};
    for (const r of (data?.rows || [])) {
      if (!r.pipeline_name) continue;
      if (selectedDay && r.preferred_day !== selectedDay) continue;
      const code = String(r.time_slot || '').split('|')[0].trim();
      if (!code) continue;
      ct[r.pipeline_name]  ??= {};
      enr[r.pipeline_name] ??= {};
      ct[r.pipeline_name][code]  = (ct[r.pipeline_name][code]  || 0) + Number(r.n     || 0);
      enr[r.pipeline_name][code] = (enr[r.pipeline_name][code] || 0) + Number(r.n_enr || 0);
    }
    return { ctMap: ct, enrMap: enr };
  }, [data, selectedDay]);

  const regionPipelines = region === 'all' ? ALL_PIPELINES : (REGION_PIPELINES[`Region ${region}`] || []);
  const visiblePipelines = branch ? [branch] : regionPipelines;

  const { ctOverall, enrOverall } = useMemo(() => {
    const ct: Record<string, number> = {};
    const enr: Record<string, number> = {};
    for (const pip of visiblePipelines) {
      const sdCt = ctMap[pip] || {};
      const sdEnr = enrMap[pip] || {};
      for (const code of visibleCodes) {
        ct[code]  = (ct[code]  || 0) + (sdCt[code]  || 0);
        enr[code] = (enr[code] || 0) + (sdEnr[code] || 0);
      }
    }
    return { ctOverall: ct, enrOverall: enr };
  }, [ctMap, enrMap, visiblePipelines, visibleCodes]);

  // For ENR clicks, via_ct=1 tells the backend to apply date/day/slot filters
  // to the linked CT row instead of the ENR row itself — so the drill-down
  // count matches the cell number exactly.
  const goToLeadCentre = (pip: string, stage: 'CT' | 'ENR', slot?: string) => {
    const p = new URLSearchParams({ stage, preset });
    if (pip) p.set('pipeline', pip);
    if (selectedDay) p.set('preferred_day', selectedDay);
    if (slot) p.set('time_slot', slot);
    if (stage === 'ENR') p.set('via_ct', '1');
    navigate(`/ghl-lead-centre?${p}`);
  };

  return (
    <div className="dashboardPage">
      <div className="dashboardHeader">
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16 }}>
          <h1 className="pageHeaderTitle">Time Slot Distribution</h1>
          <p className="headerSubtitle">CT bookings by time slot · {dateLabel} · Each cell shows CT | ENR · Source: GHL webhook DB</p>
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
        <div className="ldFilterBar" style={{ marginBottom: 8, flexWrap: 'wrap' }}>
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

      {/* Day filter */}
      <div className="ldFilterBar" style={{ marginBottom: 16 }}>
        <button className={`btn ${selectedDay === '' ? 'btnPrimary' : 'btnGhost'} btnSmall`}
          onClick={() => setSelectedDay('')}>All Days</button>
        {CAL_DAYS.map(d => (
          <button key={d}
            className={`btn ${selectedDay === d ? 'btnPrimary' : 'btnGhost'} btnSmall`}
            onClick={() => setSelectedDay(selectedDay === d ? '' : d)}>
            {d.slice(0, 3)}
          </button>
        ))}
      </div>

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
            codes={visibleCodes}
            onCellClickCt={(c) => goToLeadCentre('', 'CT',  c)}
            onCellClickEnr={(c) => goToLeadCentre('', 'ENR', c)}
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
              codes={visibleCodes}
              onCellClickCt={(c) => goToLeadCentre(pip, 'CT',  c)}
              onCellClickEnr={(c) => goToLeadCentre(pip, 'ENR', c)}
              onLabelClickCt={() => goToLeadCentre(pip, 'CT')}
              onLabelClickEnr={() => goToLeadCentre(pip, 'ENR')}
            />
          ))}
        </div>
      )}
    </div>
  );
}
