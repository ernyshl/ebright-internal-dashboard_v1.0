import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BackButton } from '../components/BackButton';
import { apiFetch } from '../lib/api';
import { formatDateRange, getApiDateRange } from '../lib/leadsSheet';

const PRESETS = [
  { key: 'today',      label: 'Today' },
  { key: 'yesterday',  label: 'Yesterday' },
  { key: 'this_week',  label: 'This Week' },
  { key: 'last_week',  label: 'Last Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
];

const REGIONS = ['Overall', 'Region A', 'Region B', 'Region C'];

function pct(a: number, b: number): string {
  return b > 0 ? (a / b * 100).toFixed(1) + '%' : '-';
}

type BranchRow = {
  key: string;
  label: string;
  region: string;
  NL: number;
  CT: number;
  SU: number;
  ENR: number;
  error?: boolean;
};

function sumRows(rows: BranchRow[]) {
  return rows.reduce(
    (acc, r) => ({ NL: acc.NL + r.NL, CT: acc.CT + r.CT, SU: acc.SU + r.SU, ENR: acc.ENR + r.ENR }),
    { NL: 0, CT: 0, SU: 0, ENR: 0 }
  );
}

function RegionSummaryCard({ label, rows }: { label: string; rows: BranchRow[] }) {
  const m = sumRows(rows);
  return (
    <div className="ldRegionRow">
      <div className="ldRegionLabel">{label}</div>
      <div className="ldRegionRight">
        <div className="ldMetricGrid">
          <div className="ldMetricBox"><div className="ldMetricLabel">NL</div><div className="ldMetricValue">{m.NL}</div></div>
          <div className="ldMetricBox"><div className="ldMetricLabel">CT</div><div className="ldMetricValue">{m.CT}</div></div>
          <div className="ldMetricBox"><div className="ldMetricLabel">SU</div><div className="ldMetricValue">{m.SU}</div></div>
          <div className="ldMetricBox"><div className="ldMetricLabel">ENR</div><div className="ldMetricValue">{m.ENR}</div></div>
        </div>
        <div className="ldMetricGrid">
          <div className="ldMetricBox"><div className="ldMetricLabel">Conv Rate</div><div className="ldMetricValue">{pct(m.ENR, m.NL)}</div></div>
          <div className="ldMetricBox"><div className="ldMetricLabel">CT Rate</div><div className="ldMetricValue">{pct(m.CT, m.NL)}</div></div>
          <div className="ldMetricBox"><div className="ldMetricLabel">Show Up Rate</div><div className="ldMetricValue">{pct(m.SU, m.CT)}</div></div>
          <div className="ldMetricBox"><div className="ldMetricLabel">Enrol Rate</div><div className="ldMetricValue">{pct(m.ENR, m.SU)}</div></div>
        </div>
      </div>
    </div>
  );
}

function BranchTable({ title, rows }: { title: string; rows: BranchRow[] }) {
  const totals = sumRows(rows);
  const visible = rows.filter((r) => r.NL + r.CT + r.SU + r.ENR > 0 || r.error);

  return (
    <div className="card ldTableCard">
      <h3 className="ldTableTitle">{title}</h3>
      <div style={{ overflowX: 'auto' }}>
        <table className="dataTable">
          <thead>
            <tr>
              <th>Branch</th>
              <th>NL <span className="ldColHint">(created)</span></th>
              <th>CT <span className="ldColHint">(updated)</span></th>
              <th>SU <span className="ldColHint">(updated)</span></th>
              <th>ENR <span className="ldColHint">(updated)</span></th>
              <th>Conv%</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)' }}>No data</td></tr>
            ) : visible.map((r) => (
              <tr key={r.key} style={r.error ? { opacity: 0.5 } : undefined}>
                <td>{r.label}{r.error && <span style={{ color: 'var(--danger)', marginLeft: 6 }}>⚠</span>}</td>
                <td>{r.NL}</td>
                <td>{r.CT} <span className="ldPct">({pct(r.CT, r.NL)})</span></td>
                <td>{r.SU} <span className="ldPct">({pct(r.SU, r.CT)})</span></td>
                <td>{r.ENR} <span className="ldPct">({pct(r.ENR, r.SU)})</span></td>
                <td><span className="ldPct">{pct(r.ENR, r.NL)}</span></td>
              </tr>
            ))}
          </tbody>
          {visible.length > 0 && (
            <tfoot>
              <tr className="ldTotalRow">
                <td><strong>Total</strong></td>
                <td><strong>{totals.NL}</strong></td>
                <td><strong>{totals.CT}</strong> <span className="ldPct">({pct(totals.CT, totals.NL)})</span></td>
                <td><strong>{totals.SU}</strong> <span className="ldPct">({pct(totals.SU, totals.CT)})</span></td>
                <td><strong>{totals.ENR}</strong> <span className="ldPct">({pct(totals.ENR, totals.SU)})</span></td>
                <td><strong><span className="ldPct">{pct(totals.ENR, totals.NL)}</span></strong></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

export function GhlTagDashboardPage() {
  const [preset, setPreset] = useState('today');
  const { date_from, date_to } = getApiDateRange(preset);
  const dateLabel = formatDateRange(preset);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['ghlTagDashboard', date_from, date_to],
    queryFn: () => apiFetch(`/api/ghl-live-tags/by-branch?date_from=${date_from}&date_to=${date_to}`),
    staleTime: 5 * 60 * 1000,
  });

  const branches: BranchRow[] = data?.branches || [];
  const fetchedAt = data?.fetchedAt
    ? new Date(data.fetchedAt).toLocaleString('en-MY', {
        timeZone: 'Asia/Kuala_Lumpur',
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false,
      })
    : null;

  const byRegion: Record<string, BranchRow[]> = {
    'Overall':  branches,
    'Region A': branches.filter((b) => b.region === 'Region A'),
    'Region B': branches.filter((b) => b.region === 'Region B'),
    'Region C': branches.filter((b) => b.region === 'Region C'),
  };

  return (
    <div className="dashboardPage">
      <div className="dashboardHeader">
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16 }}>
          <h1 className="pageHeaderTitle">GHL Tag Dashboard</h1>
          <p className="headerSubtitle">
            NL (created) · CT / SU / ENR (updated) · {dateLabel} · Source: GHL API live tags
            {fetchedAt && <span style={{ marginLeft: 8, opacity: 0.6 }}>· Last updated: {fetchedAt}</span>}
          </p>
        </div>
      </div>

      <div className="ldFilterBar">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            className={`btn ${preset === p.key ? 'btnPrimary' : 'btnGhost'} btnSmall`}
            onClick={() => setPreset(p.key)}
          >
            {p.label}
          </button>
        ))}
        <button
          className="btn btnGhost btnSmall"
          onClick={() => refetch()}
          style={{ marginLeft: 'auto' }}
          disabled={isFetching}
        >
          {isFetching ? '...' : '↺ Refresh'}
        </button>
      </div>

      {isLoading ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div className="loadingDots"><span /><span /><span /></div>
          <p style={{ marginTop: 12, color: 'var(--muted)' }}>
            Fetching live from GHL API (23 branches)…
          </p>
        </div>
      ) : (
        <>
          <div className="ldSummarySection">
            {REGIONS.map((r) => (
              <RegionSummaryCard key={r} label={r} rows={byRegion[r]} />
            ))}
          </div>
          <div className="ldTablesSection">
            {REGIONS.map((r) => (
              <BranchTable key={r} title={r} rows={byRegion[r]} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
