import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BackButton } from '../components/BackButton';
import {
  fetchLeadsData,
  filterByPreset,
  computeMetrics,
  computeByPipeline,
  formatDateRange,
  REGION_PIPELINES,
  ALL_PIPELINES,
} from '../lib/leadsSheet';

const PRESETS = [
  { key: 'today',      label: 'Today' },
  { key: 'yesterday',  label: 'Yesterday' },
  { key: 'this_week',  label: 'This Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'my_filter',  label: 'My Filter' },
];

const SECTIONS = [
  { key: 'overall',  label: 'Overall',  pipelines: ALL_PIPELINES },
  { key: 'region_a', label: 'Region A', pipelines: REGION_PIPELINES['Region A'] },
  { key: 'region_b', label: 'Region B', pipelines: REGION_PIPELINES['Region B'] },
  { key: 'region_c', label: 'Region C', pipelines: REGION_PIPELINES['Region C'] },
];

function pct(a, b) {
  return b > 0 ? (a / b * 100).toFixed(2) + '%' : 'No data';
}

function MetricBox({ label, value }) {
  return (
    <div className="ldMetricBox">
      <div className="ldMetricLabel">{label}</div>
      <div className="ldMetricValue">{value}</div>
    </div>
  );
}

function RegionSummary({ label, rows }) {
  const m = computeMetrics(rows);
  return (
    <div className="ldRegionRow">
      <div className="ldRegionLabel">{label}</div>
      <div className="ldRegionRight">
        <div className="ldMetricGrid">
          <MetricBox label="NL" value={m.NL} />
          <MetricBox label="CT" value={m.CT} />
          <MetricBox label="SU" value={m.SU} />
          <MetricBox label="ENR" value={m.ENR} />
        </div>
        <div className="ldMetricGrid">
          <MetricBox label="Conversion Rate" value={m.convRate} />
          <MetricBox label="Confirmed Rate" value={m.confRate} />
          <MetricBox label="Show Up Rate" value={m.showUpRate} />
          <MetricBox label="Enrolment Rate" value={m.enrolRate} />
        </div>
      </div>
    </div>
  );
}

function PipelineTable({ title, pipelines, byPipeline }) {
  const totals = { NL: 0, CT: 0, SU: 0, ENR: 0 };
  const tableRows = pipelines.map(pip => {
    const r = byPipeline[pip] || { NL: 0, CT: 0, SU: 0, ENR: 0 };
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
                <td>{r.NL} <span className="ldPct">({pct(r.ENR, r.NL)})</span></td>
                <td>{r.CT} <span className="ldPct">({pct(r.CT, r.NL)})</span></td>
                <td>{r.SU} <span className="ldPct">({pct(r.SU, r.CT)})</span></td>
                <td>{r.ENR} <span className="ldPct">({pct(r.ENR, r.SU)})</span></td>
              </tr>
            ))}
          </tbody>
          {tableRows.length > 0 && (
            <tfoot>
              <tr className="ldTotalRow">
                <td><strong>Total</strong></td>
                <td><strong>{totals.NL}</strong> <span className="ldPct">({pct(totals.ENR, totals.NL)})</span></td>
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

export function LeadsDashboardPage() {
  const [preset, setPreset] = useState('today');

  const { data: allRows = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['leadsSheet'],
    queryFn: fetchLeadsData,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

  const filtered = filterByPreset(allRows, preset);
  const byPipeline = computeByPipeline(filtered);

  const regionRows = {
    overall:  filtered,
    region_a: filtered.filter(r => r.region === 'Region A'),
    region_b: filtered.filter(r => r.region === 'Region B'),
    region_c: filtered.filter(r => r.region === 'Region C'),
  };

  const dateLabel = formatDateRange(preset);

  return (
    <div className="dashboardPage">
      <div className="dashboardHeader">
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16 }}>
          <h1 className="pageHeaderTitle">Leads Dashboard</h1>
          <p className="headerSubtitle">CT to NL — Overall · {dateLabel}</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="ldFilterBar">
        {PRESETS.map(p => (
          <button
            key={p.key}
            className={`btn ${preset === p.key ? 'btnPrimary' : 'btnGhost'} btnSmall`}
            onClick={() => setPreset(p.key)}
          >
            {p.key === 'my_filter' ? `${p.label} (Sat–Sun)` : p.label}
          </button>
        ))}
        <button className="btn btnGhost btnSmall" onClick={() => refetch()} style={{ marginLeft: 'auto' }}>
          ↺ Refresh
        </button>
      </div>

      {isLoading && (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div className="loadingDots"><span /><span /><span /></div>
          <p style={{ marginTop: 12, color: 'var(--muted)' }}>Loading sheet data…</p>
        </div>
      )}

      {isError && (
        <div className="errorText">Failed to load Google Sheet data. Check that the sheet is public.</div>
      )}

      {!isLoading && !isError && (
        <>
          {/* Summary cards */}
          <div className="ldSummarySection">
            {SECTIONS.map(s => (
              <RegionSummary
                key={s.key}
                label={s.label}
                rows={regionRows[s.key]}
              />
            ))}
          </div>

          {/* Tables */}
          <div className="ldTablesSection">
            {SECTIONS.map(s => (
              <PipelineTable
                key={s.key}
                title={s.label}
                pipelines={s.pipelines}
                byPipeline={byPipeline}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
