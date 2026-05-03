import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { BackButton } from '../components/BackButton';
import { apiFetch } from '../lib/api';
import {
  formatDateRange,
  getApiDateRange,
  REGION_PIPELINES,
  ALL_PIPELINES,
} from '../lib/leadsSheet';

const PRESETS = [
  { key: 'today',      label: 'Today' },
  { key: 'yesterday',  label: 'Yesterday' },
  { key: 'this_week',  label: 'This Week' },
  { key: 'last_week',  label: 'Last Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'my_filter',  label: 'My Filter (Sat–Sun)' },
];

const SECTIONS = [
  { key: 'overall',  label: 'Overall',  pipelines: ALL_PIPELINES,                regionKey: '' },
  { key: 'region_a', label: 'Region A', pipelines: REGION_PIPELINES['Region A'], regionKey: 'Region A' },
  { key: 'region_b', label: 'Region B', pipelines: REGION_PIPELINES['Region B'], regionKey: 'Region B' },
  { key: 'region_c', label: 'Region C', pipelines: REGION_PIPELINES['Region C'], regionKey: 'Region C' },
];

function pct(a, b) {
  return b > 0 ? (a / b * 100).toFixed(2) + '%' : 'No data';
}

function buildGhlByPipeline(ghlRows) {
  const map = {};
  for (const row of (ghlRows || [])) {
    if (!row.pipeline_name) continue;
    map[row.pipeline_name] = {
      NL:  Number(row.nl)  || 0,
      CT:  Number(row.ct)  || 0,
      SU:  Number(row.su)  || 0,
      ENR: Number(row.enr) || 0,
    };
  }
  return map;
}

function computeSectionMetrics(pipelines, ghlByPipeline) {
  const tot = { NL: 0, CT: 0, SU: 0, ENR: 0 };
  for (const pip of pipelines) {
    const r = ghlByPipeline[pip] || { NL: 0, CT: 0, SU: 0, ENR: 0 };
    tot.NL += r.NL; tot.CT += r.CT; tot.SU += r.SU; tot.ENR += r.ENR;
  }
  return {
    ...tot,
    convRate:   pct(tot.ENR, tot.NL),  // NL → ENR funnel
    confRate:   pct(tot.CT,  tot.NL),  // NL → CT
    showUpRate: pct(tot.SU,  tot.CT),  // CT → SU
    enrolRate:  pct(tot.ENR, tot.SU),  // SU → ENR
  };
}

function MetricBox({ label, value, to }) {
  return (
    <div className="ldMetricBox">
      <div className="ldMetricLabel">{label}</div>
      <div className="ldMetricValue">
        {to ? <Link to={to} className="ldMetricLink">{value}</Link> : value}
      </div>
    </div>
  );
}

function RegionSummary({ label, pipelines, ghlByPipeline, preset, regionKey }) {
  const m = computeSectionMetrics(pipelines, ghlByPipeline);
  const regionParam = regionKey ? `&region=${encodeURIComponent(regionKey)}` : '';
  const ghlBase = `/ghl-lead-centre?preset=${preset}${regionParam}`;
  return (
    <div className="ldRegionRow">
      <div className="ldRegionLabel">{label}</div>
      <div className="ldRegionRight">
        <div className="ldMetricGrid">
          <MetricBox label="NL"  value={m.NL}  to={`${ghlBase}&stage=NL`} />
          <MetricBox label="CT"  value={m.CT}  to={`${ghlBase}&stage=CT`} />
          <MetricBox label="SU"  value={m.SU}  to={`${ghlBase}&stage=SU`} />
          <MetricBox label="ENR" value={m.ENR} to={`${ghlBase}&stage=ENR`} />
        </div>
        <div className="ldMetricGrid">
          <MetricBox label="Conversion Rate"  value={m.convRate} />
          <MetricBox label="Confirmed Rate"   value={m.confRate} />
          <MetricBox label="Show Up Rate"     value={m.showUpRate} />
          <MetricBox label="Enrolment Rate"   value={m.enrolRate} />
        </div>
      </div>
    </div>
  );
}

function PipelineTable({ title, pipelines, ghlByPipeline, preset, regionKey }) {
  const totals = { NL: 0, CT: 0, SU: 0, ENR: 0 };
  const regionParam = regionKey ? `&region=${encodeURIComponent(regionKey)}` : '';
  const ghlBase = `/ghl-lead-centre?preset=${preset}${regionParam}`;

  const tableRows = pipelines.map(pip => {
    const r = ghlByPipeline[pip] || { NL: 0, CT: 0, SU: 0, ENR: 0 };
    totals.NL += r.NL; totals.CT += r.CT; totals.SU += r.SU; totals.ENR += r.ENR;
    return { pip, ...r };
  }).filter(r => r.NL + r.CT + r.SU + r.ENR > 0);

  return (
    <div className="card ldTableCard">
      <h3 className="ldTableTitle">{title}</h3>
      <div style={{ overflowX: 'auto' }}>
        <table className="dataTable">
          <thead>
            <tr>
              <th>Pipeline</th>
              <th>NL <span className="ldColHint">(Conv%)</span></th>
              <th>CT <span className="ldColHint">(Conf%)</span></th>
              <th>SU <span className="ldColHint">(ShowUp%)</span></th>
              <th>ENR <span className="ldColHint">(Enrol%)</span></th>
            </tr>
          </thead>
          <tbody>
            {tableRows.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)' }}>No data</td></tr>
            ) : tableRows.map(r => (
              <tr key={r.pip}>
                <td>{r.pip}</td>
                <td>
                  <Link to={`${ghlBase}&stage=NL&pipeline=${encodeURIComponent(r.pip)}`} className="ldMetricLink">{r.NL}</Link>
                  {' '}<span className="ldPct">({pct(r.ENR, r.NL)})</span>
                </td>
                <td><Link to={`${ghlBase}&stage=CT&pipeline=${encodeURIComponent(r.pip)}`} className="ldMetricLink">{r.CT}</Link> <span className="ldPct">({pct(r.CT, r.NL)})</span></td>
                <td><Link to={`${ghlBase}&stage=SU&pipeline=${encodeURIComponent(r.pip)}`} className="ldMetricLink">{r.SU}</Link> <span className="ldPct">({pct(r.SU, r.CT)})</span></td>
                <td><Link to={`${ghlBase}&stage=ENR&pipeline=${encodeURIComponent(r.pip)}`} className="ldMetricLink">{r.ENR}</Link> <span className="ldPct">({pct(r.ENR, r.SU)})</span></td>
              </tr>
            ))}
          </tbody>
          {tableRows.length > 0 && (
            <tfoot>
              <tr className="ldTotalRow">
                <td><strong>Total</strong></td>
                <td>
                  <strong>{totals.NL}</strong>
                  {' '}<span className="ldPct">({pct(totals.ENR, totals.NL)})</span>
                </td>
                <td><strong>{totals.CT}</strong> <span className="ldPct">({pct(totals.CT, totals.NL)})</span></td>
                <td><strong>{totals.SU}</strong> <span className="ldPct">({pct(totals.SU, totals.CT)})</span></td>
                <td><strong>{totals.ENR}</strong> <span className="ldPct">({pct(totals.ENR, totals.SU)})</span></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

export function GhlDashboardPage() {
  const [preset, setPreset] = useState('today');
  const { date_from, date_to } = getApiDateRange(preset);

  // NL/CT/SU/ENR from ghl_stages DB — single source of truth for the funnel.
  const { data: ghlData, isLoading, refetch } = useQuery({
    queryKey: ['ghlDashPipeline', date_from, date_to],
    queryFn: () => apiFetch(`/api/ghl-stages/by-pipeline?date_from=${date_from}&date_to=${date_to}`),
    staleTime: 3 * 60 * 1000,
  });

  const ghlByPipeline = buildGhlByPipeline(ghlData?.byPipeline || []);
  const dateLabel     = formatDateRange(preset);

  return (
    <div className="dashboardPage">
      <div className="dashboardHeader">
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16 }}>
          <h1 className="pageHeaderTitle">GHL Dashboard</h1>
          <p className="headerSubtitle">NL → CT → SU → ENR · {dateLabel} · Source: GHL webhook DB</p>
        </div>
      </div>

      <div className="ldFilterBar">
        {PRESETS.map(p => (
          <button
            key={p.key}
            className={`btn ${preset === p.key ? 'btnPrimary' : 'btnGhost'} btnSmall`}
            onClick={() => setPreset(p.key)}
          >
            {p.label}
          </button>
        ))}
        <button className="btn btnGhost btnSmall" onClick={() => refetch()} style={{ marginLeft: 'auto' }}>
          ↺ Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div className="loadingDots"><span /><span /><span /></div>
          <p style={{ marginTop: 12, color: 'var(--muted)' }}>Loading data…</p>
        </div>
      ) : (
        <>
          <div className="ldSummarySection">
            {SECTIONS.map(s => (
              <RegionSummary key={s.key} label={s.label} pipelines={s.pipelines} ghlByPipeline={ghlByPipeline} preset={preset} regionKey={s.regionKey} />
            ))}
          </div>
          <div className="ldTablesSection">
            {SECTIONS.map(s => (
              <PipelineTable key={s.key} title={s.label} pipelines={s.pipelines} ghlByPipeline={ghlByPipeline} preset={preset} regionKey={s.regionKey} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
