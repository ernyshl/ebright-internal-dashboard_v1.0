import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { BackButton } from '../components/BackButton';
import { apiFetch } from '../lib/api';
import { formatDateRange, getApiDateRange, PIPELINE_REGION } from '../lib/leadsSheet';

const PRESETS = [
  { key: 'today',      label: 'Today' },
  { key: 'yesterday',  label: 'Yesterday' },
  { key: 'this_week',  label: 'This Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'my_filter',  label: 'My Filter (Sat–Sun)' },
];

const STAGES = [
  { key: '',    label: 'All Stages' },
  { key: 'NL',  label: 'New Lead (NL)' },
  { key: 'CT',  label: 'Confirmed (CT)' },
  { key: 'SU',  label: 'Show Up (SU)' },
  { key: 'ENR', label: 'Enrolled (ENR)' },
];

const DB_MATCH_OPTIONS = [
  { key: '',    label: 'All' },
  { key: 'yes', label: '✓ In DB' },
  { key: 'no',  label: '✗ Not in DB' },
];

const STAGE_COLORS = {
  NL:  { bg: '#eff6ff', color: '#1d4ed8' },
  CT:  { bg: '#fefce8', color: '#854d0e' },
  SU:  { bg: '#f0fdf4', color: '#166534' },
  ENR: { bg: '#fdf4ff', color: '#7e22ce' },
};

const PAGE_SIZE = 50;

export function LeadsGhlViewPage() {
  const [searchParams] = useSearchParams();

  const [preset,   setPreset]   = useState(searchParams.get('preset')   || 'today');
  const [stage,    setStage]    = useState(searchParams.get('stage')    || '');
  const [pipeline, setPipeline] = useState(searchParams.get('pipeline') || '');
  const [search,   setSearch]   = useState('');
  const [dbMatch,  setDbMatch]  = useState('');
  const [page,     setPage]     = useState(1);

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [preset, stage, pipeline, search, dbMatch]);

  const { date_from, date_to } = getApiDateRange(preset);

  // DB emails for cross-reference
  const { data: emailData } = useQuery({
    queryKey: ['dbEmails'],
    queryFn: () => apiFetch('/api/leads-centre/emails'),
    staleTime: 10 * 60 * 1000,
  });
  const dbEmailSet = new Set((emailData?.emails || []).map(e => e.toLowerCase().trim()));

  // Build query params
  const params = new URLSearchParams({ date_from, date_to, page, limit: PAGE_SIZE });
  if (stage)    params.set('stage', stage);
  if (pipeline) params.set('pipeline', pipeline);
  if (search)   params.set('search', search);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['ghlStages', date_from, date_to, stage, pipeline, search, page],
    queryFn: () => apiFetch(`/api/ghl-stages?${params}`),
    staleTime: 2 * 60 * 1000,
    keepPreviousData: true,
  });

  const allRecords = data?.records || [];
  // Apply dbMatch client-side (fast, data already paginated)
  const records = dbMatch
    ? allRecords.filter(r => {
        const inDb = r.email ? dbEmailSet.has(r.email.toLowerCase().trim()) : false;
        return dbMatch === 'yes' ? inDb : !inDb;
      })
    : allRecords;

  const total      = data?.total || 0;
  const totalPages = data?.totalPages || 1;

  const availablePipelines = Object.keys(PIPELINE_REGION).sort();
  const dateLabel  = formatDateRange(preset);
  const stageLabel = STAGES.find(s => s.key === stage)?.label || 'All Stages';

  const fmtDate = (d) => d ? new Date(d).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }) : '—';

  return (
    <div className="dashboardPage">
      <div className="dashboardHeader">
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16 }}>
          <h1 className="pageHeaderTitle">Leads GHL View</h1>
          <p className="headerSubtitle">{stageLabel} · {dateLabel} · {total} records (server)</p>
        </div>
      </div>

      {/* Date preset */}
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

      {/* Secondary filters */}
      <div className="brRankFilters" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div className="brRankFilterGroup">
          <label className="brRankLabel">Stage</label>
          <select className="filterSelect" value={stage} onChange={e => setStage(e.target.value)}>
            {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
        <div className="brRankFilterGroup">
          <label className="brRankLabel">Pipeline</label>
          <select className="filterSelect" value={pipeline} onChange={e => setPipeline(e.target.value)}>
            <option value="">All Pipelines</option>
            {availablePipelines.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="brRankFilterGroup">
          <label className="brRankLabel">In DB?</label>
          <select className="filterSelect" value={dbMatch} onChange={e => setDbMatch(e.target.value)}>
            {DB_MATCH_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>
        <div className="brRankFilterGroup" style={{ flex: 1, minWidth: 180 }}>
          <label className="brRankLabel">Search</label>
          <input
            className="filterInput"
            placeholder="Name / Email / Phone"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>
        {(stage || pipeline || dbMatch || search) && (
          <div className="brRankFilterGroup" style={{ alignSelf: 'flex-end' }}>
            <button className="btn btnGhost btnSmall" onClick={() => { setStage(''); setPipeline(''); setDbMatch(''); setSearch(''); }}>Clear</button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div className="loadingDots"><span /><span /><span /></div>
          <p style={{ marginTop: 12, color: 'var(--muted)' }}>Loading…</p>
        </div>
      ) : isError ? (
        <div className="errorText">Failed to load GHL data.</div>
      ) : (
        <div className="card" style={{ overflowX: 'auto', padding: 0 }}>
          <table className="dataTable">
            <thead>
              <tr>
                <th>#</th>
                <th>Date / Time</th>
                <th>Last Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Stage</th>
                <th>Pipeline</th>
                <th>Region</th>
                <th title="Email found in master_leads_powerbi?">In DB?</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>No records found</td></tr>
              ) : records.map((r, i) => {
                const stageStyle = STAGE_COLORS[r.stage_key] || {};
                const inDb = r.email ? dbEmailSet.has(r.email.toLowerCase().trim()) : false;
                const region = PIPELINE_REGION[r.pipeline_name] || '—';
                return (
                  <tr key={r.id}>
                    <td style={{ color: 'var(--muted)', fontSize: 12 }}>{(page - 1) * PAGE_SIZE + i + 1}</td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDate(r.received_at_local)}</td>
                    <td>{r.last_name || '—'}</td>
                    <td style={{ fontSize: 12 }}>{r.email || '—'}</td>
                    <td style={{ fontSize: 12 }}>{r.phone || '—'}</td>
                    <td>
                      <span style={{ background: stageStyle.bg, color: stageStyle.color, borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>
                        {r.stage_key}
                      </span>
                    </td>
                    <td>{r.pipeline_name || '—'}</td>
                    <td>{region}</td>
                    <td style={{ textAlign: 'center' }}>
                      {r.email ? (
                        <span style={{ fontWeight: 600, fontSize: 12, color: inDb ? '#16a34a' : '#dc2626' }}>
                          {inDb ? '✓ In DB' : '✗ Not in DB'}
                        </span>
                      ) : <span style={{ color: 'var(--muted)', fontSize: 12 }}>No email</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="paginationBar">
              <button className="btn btnGhost btnSmall" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Prev</button>
              <span className="paginationInfo">Page {page} of {totalPages} ({total} records)</span>
              <button className="btn btnGhost btnSmall" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next →</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
