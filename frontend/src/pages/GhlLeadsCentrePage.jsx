import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { BackButton } from '../components/BackButton';
import { apiFetch } from '../lib/api';
import { PIPELINE_REGION, PIPELINE_TO_BRANCH, REGION_PIPELINES } from '../lib/leadsSheet';

const PRESETS = [
  { key: 'today',      label: 'Today' },
  { key: 'yesterday',  label: 'Yesterday' },
  { key: 'this_week',  label: 'This Week' },
  { key: 'last_week',  label: 'Last Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'my_filter',  label: 'My Filter (Sat–Sun)' },
];

const STAGES = [
  { key: '',    label: 'All Stages' },
  { key: 'NL',  label: 'New Lead (NL)' },
  { key: 'CT',  label: 'Confirmed (CT)' },
  { key: 'SU',  label: 'Show Up (SU)' },
  { key: 'ENR', label: 'Enrolled (ENR)' },
];

const STAGE_COLORS = {
  NL:  { bg: '#eff6ff', color: '#1d4ed8' },
  CT:  { bg: '#fefce8', color: '#854d0e' },
  SU:  { bg: '#f0fdf4', color: '#166534' },
  ENR: { bg: '#fdf4ff', color: '#7e22ce' },
};

const PAGE_SIZE = 50;

function fmt(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getDateRange(preset) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (preset === 'today') return { date_from: fmt(today), date_to: fmt(today) };
  if (preset === 'yesterday') {
    const y = new Date(today); y.setDate(y.getDate() - 1);
    return { date_from: fmt(y), date_to: fmt(y) };
  }
  if (preset === 'this_week') {
    const day = today.getDay();
    const mon = new Date(today); mon.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
    return { date_from: fmt(mon), date_to: fmt(today) };
  }
  if (preset === 'last_week') {
    const day = today.getDay();
    const thisMon = new Date(today); thisMon.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
    const lastMon = new Date(thisMon); lastMon.setDate(thisMon.getDate() - 7);
    const lastSun = new Date(thisMon); lastSun.setDate(thisMon.getDate() - 1);
    return { date_from: fmt(lastMon), date_to: fmt(lastSun) };
  }
  if (preset === 'this_month') {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    return { date_from: fmt(first), date_to: fmt(today) };
  }
  if (preset === 'last_month') {
    const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const last  = new Date(today.getFullYear(), today.getMonth(), 0);
    return { date_from: fmt(first), date_to: fmt(last) };
  }
  if (preset === 'my_filter') {
    const sat = new Date(today);
    const daysAgo = (today.getDay() - 6 + 7) % 7;
    sat.setDate(today.getDate() - daysAgo);
    const nextSun = new Date(sat);
    nextSun.setDate(sat.getDate() + 8);
    return { date_from: fmt(sat), date_to: fmt(nextSun) };
  }
  return { date_from: fmt(today), date_to: fmt(today) };
}

export function GhlLeadsCentrePage() {
  const [searchParams] = useSearchParams();

  const [preset,   setPreset]   = useState(searchParams.get('preset')   || 'this_month');
  const [stage,    setStage]    = useState(searchParams.get('stage')    || '');
  const [pipeline, setPipeline] = useState(searchParams.get('pipeline') || '');
  const [region,   setRegion]   = useState(searchParams.get('region')   || '');
  const [search,   setSearch]   = useState('');
  const [page,     setPage]     = useState(1);

  useEffect(() => { setPage(1); }, [preset, stage, pipeline, region, search]);

  // Filter pipelines by region
  const filteredPipelines = region ? (REGION_PIPELINES[region] || []) : Object.keys(PIPELINE_REGION).sort();
  // Reset pipeline if it's not in the current region
  useEffect(() => {
    if (pipeline && region && !filteredPipelines.includes(pipeline)) setPipeline('');
  }, [region, pipeline, filteredPipelines]);

  const { date_from, date_to } = getDateRange(preset);

  const params = new URLSearchParams({ date_from, date_to, page, limit: PAGE_SIZE });
  if (stage)    params.set('stage', stage);
  if (pipeline) params.set('pipeline', pipeline);
  if (!pipeline && region) {
    // Send all pipelines in the region as comma-separated
    params.set('pipelines', filteredPipelines.join(','));
  }
  if (search)   params.set('search', search);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['ghlLeadsCentre', date_from, date_to, stage, pipeline, region, search, page],
    queryFn: () => apiFetch(`/api/ghl-stages?${params}`),
    staleTime: 2 * 60 * 1000,
    keepPreviousData: true,
  });

  const records    = data?.records || [];
  const total      = data?.total || 0;
  const totalPages = data?.totalPages || 1;

  const fmtDate = (d) => d ? new Date(d).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }) : '—';

  return (
    <div className="dashboardPage">
      <div className="dashboardHeader">
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16 }}>
          <h1 className="pageHeaderTitle">GHL Lead Centre</h1>
          <p className="headerSubtitle">{total} records · from GHL webhook data</p>
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
          <label className="brRankLabel">Stage</label>
          <select className="filterSelect" value={stage} onChange={e => setStage(e.target.value)}>
            {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
        <div className="brRankFilterGroup">
          <label className="brRankLabel">Region</label>
          <select className="filterSelect" value={region} onChange={e => setRegion(e.target.value)}>
            <option value="">All Regions</option>
            <option value="Region A">Region A</option>
            <option value="Region B">Region B</option>
            <option value="Region C">Region C</option>
          </select>
        </div>
        <div className="brRankFilterGroup">
          <label className="brRankLabel">Branch</label>
          <select className="filterSelect" value={pipeline} onChange={e => setPipeline(e.target.value)}>
            <option value="">All Branches</option>
            {filteredPipelines.map(p => <option key={p} value={p}>{PIPELINE_TO_BRANCH[p] || p}</option>)}
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
        {(stage || pipeline || region || search) && (
          <div className="brRankFilterGroup" style={{ alignSelf: 'flex-end' }}>
            <button className="btn btnGhost btnSmall" onClick={() => { setStage(''); setPipeline(''); setRegion(''); setSearch(''); }}>Clear</button>
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
                <th>Branch</th>
                <th>Region</th>
                <th>Student Name</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>No records found</td></tr>
              ) : records.map((r, i) => {
                const stageStyle = STAGE_COLORS[r.stage_key] || {};
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
                    <td>{PIPELINE_TO_BRANCH[r.pipeline_name] || r.pipeline_name || '—'}</td>
                    <td>{region}</td>
                    <td>{r.student_name || '—'}</td>
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
