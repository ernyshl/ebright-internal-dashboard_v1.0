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

const CAL_DAYS = ['Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const WEEKDAY_SET = new Set(['Wednesday', 'Thursday', 'Friday']);
const WEEKEND_SET = new Set(['Saturday', 'Sunday']);

const WEEKEND_CODES = ['0915', '1030', '1200', '1315', '1445', '1600', '1715'];
const WEEKDAY_CODES = ['1800', '1915', '2030'];
const ALL_SLOT_CODES = [...WEEKEND_CODES, ...WEEKDAY_CODES];

const SLOT_LABEL: Record<string, string> = {
  '0915': '0915', '1030': '1030', '1200': '1200', '1315': '1315',
  '1445': '1445', '1600': '1600', '1715': '1715',
  '1800': '1800', '1915': '1915', '2030': '2030',
};

function getVisibleCodes(selectedDay: string): string[] {
  if (!selectedDay) return ALL_SLOT_CODES;
  if (WEEKDAY_SET.has(selectedDay)) return WEEKDAY_CODES;
  if (WEEKEND_SET.has(selectedDay)) return WEEKEND_CODES;
  return ALL_SLOT_CODES;
}

export function TimeSlotDistributionPage() {
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

  const overall = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const pip of visiblePipelines) {
      const sd = slotMap[pip] || {};
      for (const code of visibleCodes) {
        totals[code] = (totals[code] || 0) + (sd[code] || 0);
      }
    }
    return totals;
  }, [slotMap, visiblePipelines, visibleCodes]);

  const overallTotal = visibleCodes.reduce((s, c) => s + (overall[c] || 0), 0);

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
        <div className="card" style={{ overflowX: 'auto', padding: 0 }}>
          <table className="dataTable">
            <thead>
              <tr>
                <th>Branch</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                {visibleCodes.map(c => (
                  <th key={c} style={{ textAlign: 'right' }}>{SLOT_LABEL[c]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Overall row */}
              <tr style={{ background: 'var(--bg2)' }}>
                <td><strong>Overall</strong></td>
                <td style={{ textAlign: 'right' }}><strong>{overallTotal}</strong></td>
                {visibleCodes.map(c => (
                  <td key={c} style={{ textAlign: 'right' }}>
                    <strong>{overall[c] || 0}</strong>
                  </td>
                ))}
              </tr>
              {visiblePipelines.map(pip => {
                const sd = slotMap[pip] || {};
                const rowTotal = visibleCodes.reduce((s, c) => s + (sd[c] || 0), 0);
                if (rowTotal === 0) return null;
                return (
                  <tr key={pip}>
                    <td>{PIPELINE_TO_BRANCH[pip] || pip}</td>
                    <td style={{ textAlign: 'right' }}>{rowTotal}</td>
                    {visibleCodes.map(c => (
                      <td key={c} style={{ textAlign: 'right', color: sd[c] ? 'var(--text)' : 'var(--muted)' }}>
                        {sd[c] || 0}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
