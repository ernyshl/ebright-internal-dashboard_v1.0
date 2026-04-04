import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BackButton } from '../components/BackButton';
import { apiFetch } from '../lib/api';
import { formatDateRange, getApiDateRange } from '../lib/leadsSheet';

const PRESETS = [
  { key: 'today',      label: 'Today' },
  { key: 'yesterday',  label: 'Yesterday' },
  { key: 'this_week',  label: 'This Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'my_filter',  label: 'My Filter (Sat–Sun)' },
];

function pct(a, b) {
  return b > 0 ? (a / b * 100).toFixed(2) + '%' : 'No data';
}

export function PlatformBreakdownPage() {
  const [preset, setPreset] = useState('today');
  const { date_from, date_to } = getApiDateRange(preset);

  const { data: nlData, isLoading: nlLoading, refetch: refetchNl } = useQuery({
    queryKey: ['nlBySource', date_from, date_to],
    queryFn: () => apiFetch(`/api/leads-centre/nl-by-source?date_from=${date_from}&date_to=${date_to}`),
    staleTime: 3 * 60 * 1000,
  });

  const { data: ghlData, isLoading: ghlLoading, refetch: refetchGhl } = useQuery({
    queryKey: ['ghlBySource', date_from, date_to],
    queryFn: () => apiFetch(`/api/ghl-stages/by-source?date_from=${date_from}&date_to=${date_to}`),
    staleTime: 3 * 60 * 1000,
  });

  const isLoading = nlLoading || ghlLoading;
  const handleRefresh = () => { refetchNl(); refetchGhl(); };

  // Merge NL (from DB by lead_source) + CT/SU/ENR (from ghl_stages joined by email)
  const nlBySource  = {};
  for (const r of (nlData?.nl || [])) nlBySource[r.lead_source] = Number(r.nl);

  const ghlBySource = {};
  for (const r of (ghlData?.bySource || [])) {
    ghlBySource[r.lead_source] = { CT: Number(r.ct), SU: Number(r.su), ENR: Number(r.enr) };
  }

  const allSources = new Set([...Object.keys(nlBySource), ...Object.keys(ghlBySource)]);
  const rows = Array.from(allSources).map(source => ({
    source,
    NL:  nlBySource[source]       || 0,
    CT:  ghlBySource[source]?.CT  || 0,
    SU:  ghlBySource[source]?.SU  || 0,
    ENR: ghlBySource[source]?.ENR || 0,
  })).filter(r => r.NL + r.CT + r.SU + r.ENR > 0)
    .sort((a, b) => b.NL - a.NL);

  const total = rows.reduce(
    (acc, r) => ({ NL: acc.NL + r.NL, CT: acc.CT + r.CT, SU: acc.SU + r.SU, ENR: acc.ENR + r.ENR }),
    { NL: 0, CT: 0, SU: 0, ENR: 0 }
  );

  const dateLabel = formatDateRange(preset);

  return (
    <div className="dashboardPage">
      <div className="dashboardHeader">
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16 }}>
          <h1 className="pageHeaderTitle">Platform Breakdown</h1>
          <p className="headerSubtitle">NL / CT / SU / ENR by lead source · {dateLabel}</p>
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
        <button className="btn btnGhost btnSmall" onClick={handleRefresh} style={{ marginLeft: 'auto' }}>↺ Refresh</button>
      </div>

      {isLoading ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div className="loadingDots"><span /><span /><span /></div>
          <p style={{ marginTop: 12, color: 'var(--muted)' }}>Loading data…</p>
        </div>
      ) : (
        <div className="card ldTableCard">
          <h3 className="ldTableTitle">NL / CT / SU / ENR by Platform</h3>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
            NL from database · CT/SU/ENR from GHL webhook (matched by email to identify platform)
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table className="dataTable">
              <thead>
                <tr>
                  <th>Platform / Lead Source</th>
                  <th>NL <span className="ldColHint">(Conv%)</span></th>
                  <th>CT <span className="ldColHint">(Conf%)</span></th>
                  <th>SU <span className="ldColHint">(ShowUp%)</span></th>
                  <th>ENR <span className="ldColHint">(Enrol%)</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>No data</td></tr>
                ) : rows.map(r => (
                  <tr key={r.source}>
                    <td><strong>{r.source}</strong></td>
                    <td>{r.NL}  <span className="ldPct">({pct(r.ENR, r.NL)})</span></td>
                    <td>{r.CT}  <span className="ldPct">({pct(r.CT,  r.NL)})</span></td>
                    <td>{r.SU}  <span className="ldPct">({pct(r.SU,  r.CT)})</span></td>
                    <td>{r.ENR} <span className="ldPct">({pct(r.ENR, r.SU)})</span></td>
                  </tr>
                ))}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className="ldTotalRow">
                    <td><strong>Total</strong></td>
                    <td><strong>{total.NL}</strong>  <span className="ldPct">({pct(total.ENR, total.NL)})</span></td>
                    <td><strong>{total.CT}</strong>  <span className="ldPct">({pct(total.CT,  total.NL)})</span></td>
                    <td><strong>{total.SU}</strong>  <span className="ldPct">({pct(total.SU,  total.CT)})</span></td>
                    <td><strong>{total.ENR}</strong> <span className="ldPct">({pct(total.ENR, total.SU)})</span></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 12 }}>
            * "Unknown" = GHL leads whose email was not found in the database (manually added in GHL, no form submission)
          </p>
        </div>
      )}
    </div>
  );
}
