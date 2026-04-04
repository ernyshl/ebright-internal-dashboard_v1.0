import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BackButton } from '../components/BackButton';
import { apiFetch } from '../lib/api';
import {
  fetchLeadsData,
  filterByPreset,
  computeByPipeline,
  formatDateRange,
  getApiDateRange,
  REGION_PIPELINES,
  ALL_PIPELINES,
  BRANCH_TO_PIPELINE,
} from '../lib/leadsSheet';

const PRESETS = [
  { key: 'today',      label: 'Today' },
  { key: 'yesterday',  label: 'Yesterday' },
  { key: 'this_week',  label: 'This Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'my_filter',  label: 'My Filter (Sat–Sun)' },
];

const SECTIONS = [
  { key: 'overall',   label: 'Overall',  pipelines: ALL_PIPELINES },
  { key: 'region_a',  label: 'Region A', pipelines: REGION_PIPELINES['Region A'] },
  { key: 'region_b',  label: 'Region B', pipelines: REGION_PIPELINES['Region B'] },
  { key: 'region_c',  label: 'Region C', pipelines: REGION_PIPELINES['Region C'] },
];

function pct(a, b) {
  return b > 0 ? (a / b * 100).toFixed(2) + '%' : 'No data';
}

// Build NL-by-pipeline map from DB response
function buildNlByPipeline(nlRows) {
  const map = {};
  for (const row of nlRows) {
    const pipeline = BRANCH_TO_PIPELINE[row.branch];
    if (pipeline) {
      map[pipeline] = (map[pipeline] || 0) + Number(row.nl);
    }
  }
  return map;
}

// Merge DB NL with Sheet CT/SU/ENR into unified per-pipeline map
function mergeData(nlByPipeline, sheetByPipeline, pipelines) {
  const result = {};
  for (const pip of pipelines) {
    const nl = nlByPipeline[pip] || 0;
    const sheet = sheetByPipeline[pip] || { CT: 0, SU: 0, ENR: 0 };
    result[pip] = { NL: nl, CT: sheet.CT, SU: sheet.SU, ENR: sheet.ENR };
  }
  return result;
}

function computeSectionMetrics(pipelines, merged) {
  const tot = { NL: 0, CT: 0, SU: 0, ENR: 0 };
  for (const pip of pipelines) {
    const r = merged[pip] || { NL: 0, CT: 0, SU: 0, ENR: 0 };
    tot.NL += r.NL; tot.CT += r.CT; tot.SU += r.SU; tot.ENR += r.ENR;
  }
  return {
    ...tot,
    convRate:   pct(tot.ENR, tot.NL),
    confRate:   pct(tot.CT, tot.NL),
    showUpRate: pct(tot.SU, tot.CT),
    enrolRate:  pct(tot.ENR, tot.SU),
  };
}

function MetricBox({ label, value }) {
  return (
    <div className="ldMetricBox">
      <div className="ldMetricLabel">{label}</div>
      <div className="ldMetricValue">{value}</div>
    </div>
  );
}

function RegionSummary({ label, pipelines, merged }) {
  const m = computeSectionMetrics(pipelines, merged);
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

function PipelineTable({ title, pipelines, merged }) {
  const totals = { NL: 0, CT: 0, SU: 0, ENR: 0 };
  const tableRows = pipelines.map(pip => {
    const r = merged[pip] || { NL: 0, CT: 0, SU: 0, ENR: 0 };
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

  const { date_from, date_to } = getApiDateRange(preset);

  // NL from database
  const { data: nlData, isLoading: nlLoading, isError: nlError, refetch: refetchNl } = useQuery({
    queryKey: ['leadsDashboardNl', date_from, date_to],
    queryFn: () => apiFetch(`/api/leads-centre/nl-by-branch?date_from=${date_from}&date_to=${date_to}`),
    staleTime: 3 * 60 * 1000,
  });

  // CT/SU/ENR from Google Sheet
  const { data: sheetRows = [], isLoading: sheetLoading, isError: sheetError, refetch: refetchSheet } = useQuery({
    queryKey: ['leadsSheet'],
    queryFn: fetchLeadsData,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

  const isLoading = nlLoading || sheetLoading;
  const isError = nlError || sheetError;

  const filtered = filterByPreset(sheetRows, preset);
  const sheetByPipeline = computeByPipeline(filtered);
  const nlByPipeline = buildNlByPipeline(nlData?.nl || []);
  const merged = mergeData(nlByPipeline, sheetByPipeline, ALL_PIPELINES);

  const dateLabel = formatDateRange(preset);

  const handleRefresh = () => { refetchNl(); refetchSheet(); };

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
            {p.label}
          </button>
        ))}
        <button className="btn btnGhost btnSmall" onClick={handleRefresh} style={{ marginLeft: 'auto' }}>
          ↺ Refresh
        </button>
      </div>

      {isLoading && (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div className="loadingDots"><span /><span /><span /></div>
          <p style={{ marginTop: 12, color: 'var(--muted)' }}>Loading data…</p>
        </div>
      )}

      {isError && (
        <div className="errorText">Failed to load data. Check DB connection and that the Google Sheet is public.</div>
      )}

      {!isLoading && !isError && (
        <>
          {/* Summary cards */}
          <div className="ldSummarySection">
            {SECTIONS.map(s => (
              <RegionSummary
                key={s.key}
                label={s.label}
                pipelines={s.pipelines}
                merged={merged}
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
                merged={merged}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
