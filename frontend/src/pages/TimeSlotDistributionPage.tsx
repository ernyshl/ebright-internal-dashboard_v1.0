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

const WEEKEND_CODES = ['0915', '1030', '1200', '1315', '1445', '1600', '1715'];
const WEEKDAY_CODES = ['1800', '1915', '2030'];
const ALL_SLOT_CODES = [...WEEKEND_CODES, ...WEEKDAY_CODES];

function getVisibleCodes(selectedDay: string): string[] {
  if (!selectedDay) return ALL_SLOT_CODES;
  if (WEEKDAY_SET.has(selectedDay)) return WEEKDAY_CODES;
  if (WEEKEND_SET.has(selectedDay)) return WEEKEND_CODES;
  return ALL_SLOT_CODES;
}

function MetricCard({ label, value, onClick }: { label: string; value: number; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--inputBg, #f9fafb)',
        border: '1px solid var(--border, #e5e7eb)',
        borderRadius: 10,
        padding: '16px 8px',
        textAlign: 'center',
        minWidth: 0,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 120ms',
      }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.borderColor = 'var(--brand)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border, #e5e7eb)'; }}
    >
      <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: value > 0 && onClick ? 'var(--brand)' : (value > 0 ? 'var(--text)' : 'var(--muted)') }}>
        {value}
      </div>
    </div>
  );
}

function Row({ label, values, codes, onCellClick, bold = false }: {
  label: string;
  values: Record<string, number>;
  codes: string[];
  onCellClick?: (code: string) => void;
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
        width: 220, flexShrink: 0,
        fontSize: bold ? 18 : 16,
        fontWeight: bold ? 800 : 600,
        color: 'var(--text)',
      }}>{label}</div>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${codes.length}, 1fr)`, gap: 10 }}>
        {codes.map(c => (
          <MetricCard
            key={c}
            label={c}
            value={values[c] || 0}
            onClick={onCellClick ? () => onCellClick(c) : undefined}
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

  // pipeline -> slot_code -> count, filtered by selectedDay if set
  const slotMap = useMemo(() => {
    const m: Record<string, Record<string, number>> = {};
    for (const r of (data?.rows || [])) {
      if (!r.pipeline_name) continue;
      if (selectedDay && r.preferred_day !== selectedDay) continue;
      const code = String(r.time_slot || '').split('|')[0].trim();
      if (!code) continue;
      m[r.pipeline_name] ??= {};
      m[r.pipeline_name][code] = (m[r.pipeline_name][code] || 0) + Number(r.n || 0);
    }
    return m;
  }, [data, selectedDay]);

  const regionPipelines = region === 'all' ? ALL_PIPELINES : (REGION_PIPELINES[`Region ${region}`] || []);
  const visiblePipelines = branch ? [branch] : regionPipelines;

  const overall: Record<string, number> = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const pip of visiblePipelines) {
      const sd = slotMap[pip] || {};
      for (const code of visibleCodes) {
        totals[code] = (totals[code] || 0) + (sd[code] || 0);
      }
    }
    return totals;
  }, [slotMap, visiblePipelines, visibleCodes]);

  // GHL Lead Centre doesn't filter by time_slot, so the slot click opens
  // CT records for that pipeline + date range (with day filter when present).
  const goToLeadCentre = (pip: string, _code: string) => {
    const p = new URLSearchParams({ stage: 'CT', preset });
    if (pip) p.set('pipeline', pip);
    navigate(`/ghl-lead-centre?${p}`);
  };

  return (
    <div className="dashboardPage">
      <div className="dashboardHeader">
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16 }}>
          <h1 className="pageHeaderTitle">Time Slot Distribution</h1>
          <p className="headerSubtitle">CT bookings by time slot · {dateLabel} · Source: GHL webhook DB</p>
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
            values={overall}
            codes={visibleCodes}
            onCellClick={(c) => goToLeadCentre('', c)}
            bold
          />
          {/* Branch rows — always shown so layout is consistent regardless of data */}
          {visiblePipelines.map(pip => (
            <Row
              key={pip}
              label={PIPELINE_TO_BRANCH[pip] || pip}
              values={slotMap[pip] || {}}
              codes={visibleCodes}
              onCellClick={(c) => goToLeadCentre(pip, c)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
