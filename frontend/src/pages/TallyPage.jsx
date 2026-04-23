import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BackButton } from '../components/BackButton';
import { apiFetch } from '../lib/api';
import { getApiDateRange, formatDateRange, PIPELINE_TO_BRANCH, BRANCH_TO_PIPELINE } from '../lib/leadsSheet';

const PRESETS = [
  { key: 'today',      label: 'Today' },
  { key: 'yesterday',  label: 'Yesterday' },
  { key: 'this_week',  label: 'This Week' },
  { key: 'last_week',  label: 'Last Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'my_filter',  label: 'My Filter (Sat-Sun)' },
];

const ALL_BRANCHES = Object.keys(BRANCH_TO_PIPELINE).filter(b => b !== 'Kajang'); // avoid duplicate

export function TallyPage() {
  const [preset, setPreset] = useState('today');
  const [branch, setBranch] = useState('');
  const [source, setSource] = useState('');
  const { date_from, date_to } = getApiDateRange(preset);

  const params = new URLSearchParams({ date_from, date_to });
  if (branch) {
    // For tally, raw side filters by branch name, GHL side by pipeline code
    params.set('pipeline', branch);
  }
  if (source) params.set('lead_source', source);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['tally', date_from, date_to, branch, source],
    queryFn: () => apiFetch(`/api/ghl-stages/tally?${params}`),
    staleTime: 2 * 60 * 1000,
  });

  const rawLeads = data?.rawLeads || [];
  const ghlLeads = data?.ghlLeads || [];

  // Build sets for matching
  const { rawOnly, ghlOnly, matched, allSources } = useMemo(() => {
    const ghlEmails = new Set(ghlLeads.map(r => r.email).filter(Boolean));
    const rawEmails = new Set(rawLeads.map(r => r.email).filter(Boolean));

    const rawOnly = rawLeads.filter(r => r.email && !ghlEmails.has(r.email));
    const ghlOnly = ghlLeads.filter(r => r.email && !rawEmails.has(r.email));
    const matched = rawLeads.filter(r => r.email && ghlEmails.has(r.email));

    const sources = new Set();
    rawLeads.forEach(r => { if (r.lead_source) sources.add(r.lead_source); });
    ghlLeads.forEach(r => { if (r.lead_source) sources.add(r.lead_source); });

    return { rawOnly, ghlOnly, matched, allSources: Array.from(sources).sort() };
  }, [rawLeads, ghlLeads]);

  const dateLabel = formatDateRange(preset);

  const fmtDate = (d) => d ? new Date(d).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
  }) : '';

  return (
    <div className="dashboardPage">
      <div className="dashboardHeader">
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16 }}>
          <h1 className="pageHeaderTitle">To Tally</h1>
          <p className="headerSubtitle">Raw Data vs GHL Data · {dateLabel}</p>
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
        <button className="btn btnGhost btnSmall" onClick={() => refetch()} style={{ marginLeft: 'auto' }}>↺ Refresh</button>
      </div>

      <div className="brRankFilters" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div className="brRankFilterGroup">
          <label className="brRankLabel">Branch</label>
          <select className="filterSelect" value={branch} onChange={e => setBranch(e.target.value)}>
            <option value="">All Branches</option>
            {ALL_BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div className="brRankFilterGroup">
          <label className="brRankLabel">Lead Source</label>
          <select className="filterSelect" value={source} onChange={e => setSource(e.target.value)}>
            <option value="">All Sources</option>
            {allSources.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {(branch || source) && (
          <div className="brRankFilterGroup" style={{ alignSelf: 'flex-end' }}>
            <button className="btn btnGhost btnSmall" onClick={() => { setBranch(''); setSource(''); }}>Clear</button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div className="loadingDots"><span /><span /><span /></div>
          <p style={{ marginTop: 12, color: 'var(--muted)' }}>Loading…</p>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div className="card" style={{ textAlign: 'center', padding: 16 }}>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{rawLeads.length}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Raw (DB)</div>
            </div>
            <div className="card" style={{ textAlign: 'center', padding: 16 }}>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{ghlLeads.length}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>GHL</div>
            </div>
            <div className="card" style={{ textAlign: 'center', padding: 16 }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--success)' }}>{matched.length}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Matched</div>
            </div>
            <div className="card" style={{ textAlign: 'center', padding: 16 }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--brand)' }}>{rawOnly.length}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Missing from GHL</div>
            </div>
          </div>

          {/* Side by side tables */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Raw Data (left) */}
            <div className="card" style={{ overflowX: 'auto', padding: 0 }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>
                Raw Data (DB) — {rawLeads.length} leads
              </div>
              <table className="dataTable">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Branch</th>
                    <th>Source</th>
                    <th>Date</th>
                    <th>In GHL?</th>
                  </tr>
                </thead>
                <tbody>
                  {rawLeads.length === 0 ? (
                    <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>No raw leads</td></tr>
                  ) : rawLeads.map((r, i) => {
                    const inGhl = r.email && ghlLeads.some(g => g.email === r.email);
                    return (
                      <tr key={i} style={!inGhl ? { background: 'var(--brandLight)' } : {}}>
                        <td style={{ fontSize: 11, color: 'var(--muted)' }}>{i + 1}</td>
                        <td style={{ fontSize: 12 }}>{r.full_name || '—'}</td>
                        <td style={{ fontSize: 11 }}>{r.email || '—'}</td>
                        <td style={{ fontSize: 12 }}>{r.branch || '—'}</td>
                        <td style={{ fontSize: 11 }}>{r.lead_source || '—'}</td>
                        <td style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{fmtDate(r.submitted_at)}</td>
                        <td style={{ textAlign: 'center' }}>
                          {inGhl
                            ? <span style={{ color: 'var(--success)', fontWeight: 600, fontSize: 12 }}>Yes</span>
                            : <span style={{ color: 'var(--brand)', fontWeight: 600, fontSize: 12 }}>No</span>
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* GHL Data (right) */}
            <div className="card" style={{ overflowX: 'auto', padding: 0 }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>
                GHL Data — {ghlLeads.length} leads
              </div>
              <table className="dataTable">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Last Name</th>
                    <th>Email</th>
                    <th>Pipeline</th>
                    <th>Stage</th>
                    <th>Source</th>
                    <th>Date</th>
                    <th>In DB?</th>
                  </tr>
                </thead>
                <tbody>
                  {ghlLeads.length === 0 ? (
                    <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>No GHL leads</td></tr>
                  ) : ghlLeads.map((r, i) => {
                    const inDb = r.email && rawLeads.some(d => d.email === r.email);
                    return (
                      <tr key={i} style={!inDb ? { background: 'var(--warningLight, #fefce8)' } : {}}>
                        <td style={{ fontSize: 11, color: 'var(--muted)' }}>{i + 1}</td>
                        <td style={{ fontSize: 12 }}>{r.last_name || '—'}</td>
                        <td style={{ fontSize: 11 }}>{r.email || '—'}</td>
                        <td style={{ fontSize: 12 }}>{PIPELINE_TO_BRANCH[r.pipeline_name] || r.pipeline_name || '—'}</td>
                        <td style={{ fontSize: 12 }}>{r.stage_key || '—'}</td>
                        <td style={{ fontSize: 11 }}>{r.lead_source || '—'}</td>
                        <td style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{fmtDate(r.received_at)}</td>
                        <td style={{ textAlign: 'center' }}>
                          {inDb
                            ? <span style={{ color: 'var(--success)', fontWeight: 600, fontSize: 12 }}>Yes</span>
                            : <span style={{ color: 'var(--warning, #854d0e)', fontWeight: 600, fontSize: 12 }}>No</span>
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
