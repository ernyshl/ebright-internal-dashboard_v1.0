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
    const m: Record<string, { NL: number; CT: number; SU: number; ENR: number }> = {};
    for (const r of (data?.byPipeline || [])) {
      m[r.pipeline_name] = { NL: Number(r.nl)||0, CT: Number(r.ct)||0, SU: Number(r.su)||0, ENR: Number(r.enr)||0 };
    }
    return m;
  }, [data]);

  const regionPipelines = region === 'all' ? ALL_PIPELINES : (REGION_PIPELINES[`Region ${region}`] || []);
  const visiblePipelines = branch ? [branch] : regionPipelines;

  const overall = useMemo(() => visiblePipelines.reduce(
    (acc, pip) => {
      const r = byPipeline[pip] || { NL: 0, CT: 0, SU: 0, ENR: 0 };
      return { NL: acc.NL + r.NL, CT: acc.CT + r.CT, SU: acc.SU + r.SU, ENR: acc.ENR + r.ENR };
    },
    { NL: 0, CT: 0, SU: 0, ENR: 0 }
  ), [byPipeline, visiblePipelines]);

  const goToLeadCentre = (pip: string, stage: string) => {
    const p = new URLSearchParams({ stage });
    if (preset === 'custom') { p.set('preset', 'custom'); }
    else { p.set('preset', preset); }
    if (pip) p.set('pipeline', pip);
    navigate(`/ghl-lead-centre?${p}`);
  };

  const numCell = (val: number, pip: string, stage: string) => (
    <td style={{ textAlign: 'right' }}>
      {val > 0
        ? <span style={{ cursor: 'pointer', color: 'var(--brand)', fontWeight: 600 }} onClick={() => goToLeadCentre(pip, stage)}>{val}</span>
        : <span style={{ color: 'var(--muted)' }}>0</span>}
    </td>
  );

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

      {/* Branch filter — shown only when a region is selected */}
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
        <div className="card" style={{ overflowX: 'auto', padding: 0 }}>
          <table className="dataTable">
            <thead>
              <tr>
                <th>Branch</th>
                <th style={{ textAlign: 'right' }}>NL</th>
                <th style={{ textAlign: 'right' }}>CT</th>
                <th style={{ textAlign: 'right' }}>SU</th>
                <th style={{ textAlign: 'right' }}>ENR</th>
              </tr>
            </thead>
            <tbody>
              {/* Overall summary row */}
              <tr style={{ background: 'var(--bg2)' }}>
                <td><strong>Overall</strong></td>
                {numCell(overall.NL,  '', 'NL')}
                {numCell(overall.CT,  '', 'CT')}
                {numCell(overall.SU,  '', 'SU')}
                {numCell(overall.ENR, '', 'ENR')}
              </tr>
              {visiblePipelines.map(pip => {
                const r = byPipeline[pip] || { NL: 0, CT: 0, SU: 0, ENR: 0 };
                if (r.NL + r.CT + r.SU + r.ENR === 0) return null;
                return (
                  <tr key={pip}>
                    <td>{PIPELINE_TO_BRANCH[pip] || pip}</td>
                    {numCell(r.NL,  pip, 'NL')}
                    {numCell(r.CT,  pip, 'CT')}
                    {numCell(r.SU,  pip, 'SU')}
                    {numCell(r.ENR, pip, 'ENR')}
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
