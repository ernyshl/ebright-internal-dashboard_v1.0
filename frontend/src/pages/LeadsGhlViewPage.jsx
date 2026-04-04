import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { BackButton } from '../components/BackButton';
import { apiFetch } from '../lib/api';
import {
  fetchLeadsData,
  filterByPreset,
  formatDateRange,
  REGION_PIPELINES,
  PIPELINE_REGION,
} from '../lib/leadsSheet';

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

const REGIONS = [
  { key: '',         label: 'All Regions' },
  { key: 'Region A', label: 'Region A' },
  { key: 'Region B', label: 'Region B' },
  { key: 'Region C', label: 'Region C' },
];

const PAGE_SIZE = 50;

const DB_MATCH_OPTIONS = [
  { key: '',      label: 'All' },
  { key: 'yes',   label: '✓ In DB' },
  { key: 'no',    label: '✗ Not in DB' },
];

const STAGE_COLORS = {
  NL:  { bg: '#eff6ff', color: '#1d4ed8' },
  CT:  { bg: '#fefce8', color: '#854d0e' },
  SU:  { bg: '#f0fdf4', color: '#166534' },
  ENR: { bg: '#fdf4ff', color: '#7e22ce' },
};

export function LeadsGhlViewPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [preset, setPreset]   = useState(searchParams.get('preset') || 'today');
  const [stage, setStage]     = useState(searchParams.get('stage') || '');
  const [region, setRegion]   = useState(searchParams.get('region') || '');
  const [pipeline, setPipeline] = useState(searchParams.get('pipeline') || '');
  const [search, setSearch]   = useState('');
  const [dbMatch, setDbMatch] = useState('');
  const [page, setPage]       = useState(1);

  // Sync URL params when filters set externally (e.g. dashboard link)
  useEffect(() => {
    const p = searchParams.get('preset');
    const s = searchParams.get('stage');
    const r = searchParams.get('region');
    const pip = searchParams.get('pipeline');
    if (p) setPreset(p);
    if (s) setStage(s);
    if (r) setRegion(r);
    if (pip) setPipeline(pip);
  }, []);

  // Available pipelines for selected region
  const availablePipelines = region ? REGION_PIPELINES[region] || [] : Object.keys(PIPELINE_REGION).sort();

  const { data: allRows = [], isLoading: sheetLoading, isError: sheetError, refetch: refetchSheet } = useQuery({
    queryKey: ['leadsSheet'],
    queryFn: fetchLeadsData,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

  const { data: emailData, isLoading: emailLoading, refetch: refetchEmails } = useQuery({
    queryKey: ['dbEmails'],
    queryFn: () => apiFetch('/api/leads-centre/emails'),
    staleTime: 10 * 60 * 1000,
  });

  const dbEmailSet = useMemo(() => {
    const emails = emailData?.emails || [];
    return new Set(emails.map(e => e.toLowerCase().trim()));
  }, [emailData]);

  const isLoading = sheetLoading || emailLoading;
  const isError = sheetError;

  const refetch = () => { refetchSheet(); refetchEmails(); };

  const filtered = useMemo(() => {
    let rows = filterByPreset(allRows, preset);

    if (stage)    rows = rows.filter(r => r.stage === stage);
    if (region)   rows = rows.filter(r => r.region === region);
    if (pipeline) rows = rows.filter(r => r.pipeline === pipeline);

    if (dbMatch) {
      rows = rows.filter(r => {
        const inDb = r.email ? dbEmailSet.has(r.email.toLowerCase().trim()) : false;
        return dbMatch === 'yes' ? inDb : !inDb;
      });
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(r =>
        (r.lastName || '').toLowerCase().includes(q) ||
        (r.email || '').toLowerCase().includes(q) ||
        (r.phone || '').toLowerCase().includes(q)
      );
    }

    return rows;
  }, [allRows, preset, stage, region, pipeline, dbMatch, search, dbEmailSet]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handlePreset = (key) => { setPreset(key); setPage(1); };
  const handleStage = (key) => { setStage(key); setPage(1); };
  const handleRegion = (val) => { setRegion(val); setPipeline(''); setPage(1); };
  const handlePipeline = (val) => { setPipeline(val); setPage(1); };
  const handleSearch = (val) => { setSearch(val); setPage(1); };

  const stageLabel = STAGES.find(s => s.key === stage)?.label || 'All Stages';
  const dateLabel  = formatDateRange(preset);

  const fmtDate = (d) => d ? d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <div className="dashboardPage">
      <div className="dashboardHeader">
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16 }}>
          <h1 className="pageHeaderTitle">Leads GHL View</h1>
          <p className="headerSubtitle">{stageLabel} · {dateLabel} · {filtered.length} records</p>
        </div>
      </div>

      {/* Date preset filter */}
      <div className="ldFilterBar">
        {PRESETS.map(p => (
          <button
            key={p.key}
            className={`btn ${preset === p.key ? 'btnPrimary' : 'btnGhost'} btnSmall`}
            onClick={() => handlePreset(p.key)}
          >
            {p.label}
          </button>
        ))}
        <button className="btn btnGhost btnSmall" onClick={() => refetch()} style={{ marginLeft: 'auto' }}>
          ↺ Refresh
        </button>
      </div>

      {/* Secondary filters */}
      <div className="brRankFilters" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        {/* Stage */}
        <div className="brRankFilterGroup">
          <label className="brRankLabel">Stage</label>
          <select className="filterSelect" value={stage} onChange={e => handleStage(e.target.value)}>
            {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>

        {/* Region */}
        <div className="brRankFilterGroup">
          <label className="brRankLabel">Region</label>
          <select className="filterSelect" value={region} onChange={e => handleRegion(e.target.value)}>
            {REGIONS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </div>

        {/* Pipeline */}
        <div className="brRankFilterGroup">
          <label className="brRankLabel">Pipeline</label>
          <select className="filterSelect" value={pipeline} onChange={e => handlePipeline(e.target.value)}>
            <option value="">All Pipelines</option>
            {availablePipelines.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {/* DB Match */}
        <div className="brRankFilterGroup">
          <label className="brRankLabel">In DB?</label>
          <select className="filterSelect" value={dbMatch} onChange={e => { setDbMatch(e.target.value); setPage(1); }}>
            {DB_MATCH_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>

        {/* Search */}
        <div className="brRankFilterGroup" style={{ flex: 1, minWidth: 180 }}>
          <label className="brRankLabel">Search</label>
          <input
            className="filterInput"
            placeholder="Name / Email / Phone"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>

        {/* Clear */}
        {(stage || region || pipeline || dbMatch || search) && (
          <div className="brRankFilterGroup" style={{ alignSelf: 'flex-end' }}>
            <button className="btn btnGhost btnSmall" onClick={() => { setStage(''); setRegion(''); setPipeline(''); setDbMatch(''); setSearch(''); setPage(1); }}>
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div className="loadingDots"><span /><span /><span /></div>
          <p style={{ marginTop: 12, color: 'var(--muted)' }}>Loading GHL data…</p>
        </div>
      ) : isError ? (
        <div className="errorText">Failed to load Google Sheet data. Check that the sheet is public.</div>
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
                <th title="Is this email found in master_leads_powerbi (DB)?">In DB?</th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>No records found</td></tr>
              ) : paginated.map((r, i) => {
                const stageStyle = STAGE_COLORS[r.stage] || {};
                const inDb = r.email ? dbEmailSet.has(r.email.toLowerCase().trim()) : false;
                return (
                  <tr key={i}>
                    <td style={{ color: 'var(--muted)', fontSize: 12 }}>{(page - 1) * PAGE_SIZE + i + 1}</td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDate(r.date)}</td>
                    <td>{r.lastName || '—'}</td>
                    <td style={{ fontSize: 12 }}>{r.email || '—'}</td>
                    <td style={{ fontSize: 12 }}>{r.phone || '—'}</td>
                    <td>
                      <span style={{
                        background: stageStyle.bg,
                        color: stageStyle.color,
                        borderRadius: 4,
                        padding: '2px 8px',
                        fontSize: 12,
                        fontWeight: 600,
                      }}>
                        {r.stage}
                      </span>
                    </td>
                    <td>{r.pipeline || '—'}</td>
                    <td>{r.region || '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      {r.email ? (
                        <span style={{
                          fontWeight: 600,
                          fontSize: 12,
                          color: inDb ? '#16a34a' : '#dc2626',
                        }}>
                          {inDb ? '✓ In DB' : '✗ Not in DB'}
                        </span>
                      ) : <span style={{ color: 'var(--muted)', fontSize: 12 }}>No email</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="paginationBar">
              <button className="btn btnGhost btnSmall" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Prev</button>
              <span className="paginationInfo">Page {page} of {totalPages} ({filtered.length} records)</span>
              <button className="btn btnGhost btnSmall" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next →</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
