import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
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
  { key: 'my_filter',  label: 'My Filter (Sat-Sun)' },
  { key: 'custom',     label: 'Custom Range' },
];

const STAGE_OPTIONS = [
  { key: 'New Lead (NL)',   label: 'New Lead (NL)' },
  { key: 'Confirmed (CT)',  label: 'Confirmed (CT)' },
  { key: 'Show-Up (SU)',    label: 'Show-Up (SU)' },
  { key: 'Enrolled (ENR)',  label: 'Enrolled (ENR)' },
];

const FILTER_STAGES = [
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

const ALL_PIPELINES = Object.keys(PIPELINE_REGION).sort();
const PAGE_SIZE = 50;

const EMPTY_FORM = { email: '', opportunity_name: '', last_name: '', phone: '', stage_raw: 'New Lead (NL)', pipeline_name: '', student_name: '', lead_source: '' };

function fmtD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getDateRange(preset) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (preset === 'today') return { date_from: fmtD(today), date_to: fmtD(today) };
  if (preset === 'yesterday') {
    const y = new Date(today); y.setDate(y.getDate() - 1);
    return { date_from: fmtD(y), date_to: fmtD(y) };
  }
  if (preset === 'this_week') {
    const day = today.getDay();
    const mon = new Date(today); mon.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
    return { date_from: fmtD(mon), date_to: fmtD(today) };
  }
  if (preset === 'last_week') {
    const day = today.getDay();
    const thisMon = new Date(today); thisMon.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
    const lastMon = new Date(thisMon); lastMon.setDate(thisMon.getDate() - 7);
    const lastSun = new Date(thisMon); lastSun.setDate(thisMon.getDate() - 1);
    return { date_from: fmtD(lastMon), date_to: fmtD(lastSun) };
  }
  if (preset === 'this_month') {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    return { date_from: fmtD(first), date_to: fmtD(today) };
  }
  if (preset === 'last_month') {
    const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const last  = new Date(today.getFullYear(), today.getMonth(), 0);
    return { date_from: fmtD(first), date_to: fmtD(last) };
  }
  if (preset === 'my_filter') {
    const sat = new Date(today);
    const daysAgo = (today.getDay() - 6 + 7) % 7;
    sat.setDate(today.getDate() - daysAgo);
    const nextSun = new Date(sat);
    nextSun.setDate(sat.getDate() + 8);
    return { date_from: fmtD(sat), date_to: fmtD(nextSun) };
  }
  return { date_from: fmtD(today), date_to: fmtD(today) };
}

export function GhlLeadsCentrePage() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const [preset,     setPreset]     = useState(searchParams.get('preset') || 'this_month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo,   setCustomTo]   = useState('');
  const [stage,      setStage]      = useState(searchParams.get('stage')    || '');
  const [pipeline,   setPipeline]   = useState(searchParams.get('pipeline') || '');
  const [region,     setRegion]     = useState(searchParams.get('region')   || '');
  const [search,     setSearch]     = useState('');
  const [page,       setPage]       = useState(1);

  // CRUD state
  const [showForm,   setShowForm]   = useState(false);
  const [editingId,  setEditingId]  = useState(null);
  const [form,       setForm]       = useState({ ...EMPTY_FORM });
  const [deleteId,   setDeleteId]   = useState(null);

  useEffect(() => { setPage(1); }, [preset, customFrom, customTo, stage, pipeline, region, search]);

  const filteredPipelines = region ? (REGION_PIPELINES[region] || []) : ALL_PIPELINES;
  useEffect(() => {
    if (pipeline && region && !filteredPipelines.includes(pipeline)) setPipeline('');
  }, [region, pipeline, filteredPipelines]);

  // Compute date range
  let date_from, date_to;
  if (preset === 'custom') {
    date_from = customFrom;
    date_to = customTo;
  } else {
    const range = getDateRange(preset);
    date_from = range.date_from;
    date_to = range.date_to;
  }

  const handlePresetClick = (key) => {
    setPreset(key);
    if (key !== 'custom') {
      setCustomFrom('');
      setCustomTo('');
    }
  };

  const params = new URLSearchParams({ date_from, date_to, page: String(page), limit: String(PAGE_SIZE) });
  if (stage)    params.set('stage', stage);
  if (pipeline) params.set('pipeline', pipeline);
  if (!pipeline && region) params.set('pipelines', filteredPipelines.join(','));
  if (search)   params.set('search', search);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['ghlLeadsCentre', date_from, date_to, stage, pipeline, region, search, page],
    queryFn: () => apiFetch(`/api/ghl-stages?${params}`),
    staleTime: 2 * 60 * 1000,
    placeholderData: keepPreviousData,
    enabled: preset !== 'custom' || (!!customFrom && !!customTo),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['ghlLeadsCentre'] });

  const createMutation = useMutation({
    mutationFn: (body: any) => apiFetch('/api/ghl-stages', { method: 'POST', body }),
    onSuccess: () => { invalidate(); setShowForm(false); setForm({ ...EMPTY_FORM }); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: any; body: any }) => apiFetch(`/api/ghl-stages/${id}`, { method: 'PUT', body }),
    onSuccess: () => { invalidate(); setShowForm(false); setEditingId(null); setForm({ ...EMPTY_FORM }); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: any) => apiFetch(`/api/ghl-stages/${id}`, { method: 'DELETE' }),
    onSuccess: () => { invalidate(); setDeleteId(null); },
  });

  const records    = data?.records || [];
  const total      = data?.total || 0;
  const totalPages = data?.totalPages || 1;

  const fmtDate = (d) => d ? new Date(d).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }) : '—';

  const handleEdit = (r) => {
    setEditingId(r.id);
    setForm({
      email: r.email || '',
      opportunity_name: r.opportunity_name || '',
      last_name: r.last_name || '',
      phone: r.phone || '',
      stage_raw: r.stage_raw || 'New Lead (NL)',
      pipeline_name: r.pipeline_name || '',
      student_name: r.student_name || '',
      lead_source: r.lead_source || '',
    });
    setShowForm(true);
  };

  const handleAdd = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setShowForm(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingId) {
      updateMutation.mutate({ id: editingId, body: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="dashboardPage">
      <div className="dashboardHeader">
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16 }}>
          <h1 className="pageHeaderTitle">GHL Lead Centre</h1>
          <p className="headerSubtitle">{total} records · from GHL webhook data</p>
        </div>
        <button className="btn btnPrimary btnSmall" onClick={handleAdd} style={{ marginLeft: 'auto' }}>+ Add Record</button>
      </div>

      {/* Create / Edit Form */}
      {showForm && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>{editingId ? 'Edit Record' : 'Add New Record'}</h3>
            <button className="btn btnGhost btnSmall" onClick={() => { setShowForm(false); setEditingId(null); }}>✕ Cancel</button>
          </div>
          <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <label className="field">
              <div className="label">Opportunity Name</div>
              <input className="input" value={form.opportunity_name} onChange={e => setForm({ ...form, opportunity_name: e.target.value })} required />
            </label>
            <label className="field">
              <div className="label">Email</div>
              <input className="input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
            </label>
            <label className="field">
              <div className="label">Phone</div>
              <input className="input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            </label>
            <label className="field">
              <div className="label">Stage</div>
              <select className="input" value={form.stage_raw} onChange={e => setForm({ ...form, stage_raw: e.target.value })}>
                {STAGE_OPTIONS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </label>
            <label className="field">
              <div className="label">Branch</div>
              <select className="input" value={form.pipeline_name} onChange={e => setForm({ ...form, pipeline_name: e.target.value })} required>
                <option value="">Select Branch</option>
                {ALL_PIPELINES.map(p => <option key={p} value={p}>{PIPELINE_TO_BRANCH[p] || p}</option>)}
              </select>
            </label>
            <label className="field">
              <div className="label">Student Name</div>
              <input className="input" value={form.student_name} onChange={e => setForm({ ...form, student_name: e.target.value })} />
            </label>
            <label className="field">
              <div className="label">Lead Source</div>
              <input className="input" value={form.lead_source} onChange={e => setForm({ ...form, lead_source: e.target.value })} placeholder="e.g. Facebook, TikTok" />
            </label>
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, alignItems: 'center' }}>
              <button className="btn btnPrimary" type="submit" disabled={isSaving}>
                {isSaving ? 'Saving...' : (editingId ? 'Save Changes' : 'Add Record')}
              </button>
              {(createMutation.isError || updateMutation.isError) && (
                <span style={{ color: 'var(--brand)', fontSize: 12 }}>
                  {createMutation.error?.data?.error || updateMutation.error?.data?.error || 'Failed'}
                </span>
              )}
            </div>
          </form>
        </div>
      )}

      {/* Date presets + custom range */}
      <div className="ldFilterBar" style={{ flexWrap: 'wrap' }}>
        {PRESETS.map(p => (
          <button
            key={p.key}
            className={`btn ${preset === p.key ? 'btnPrimary' : 'btnGhost'} btnSmall`}
            onClick={() => handlePresetClick(p.key)}
          >
            {p.label}
          </button>
        ))}
        <button className="btn btnGhost btnSmall" onClick={() => refetch()} style={{ marginLeft: 'auto' }}>↺ Refresh</button>
      </div>

      {preset === 'custom' && (
        <div className="brRankFilters" style={{ marginBottom: 0, gap: 12 }}>
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

      {/* Filters */}
      <div className="brRankFilters" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div className="brRankFilterGroup">
          <label className="brRankLabel">Stage</label>
          <select className="filterSelect" value={stage} onChange={e => setStage(e.target.value)}>
            {FILTER_STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
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
            placeholder="Opportunity / Email / Phone"
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

      {/* Table */}
      {isLoading ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div className="loadingDots"><span /><span /><span /></div>
          <p style={{ marginTop: 12, color: 'var(--muted)' }}>Loading...</p>
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
                <th>Opportunity</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Stage</th>
                <th>Branch</th>
                <th>Region</th>
                <th>Student Name</th>
                <th>Source</th>
                <th>Pref. Day</th>
                <th>Time Slot</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr><td colSpan={13} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>No records found</td></tr>
              ) : records.map((r, i) => {
                const stageStyle = STAGE_COLORS[r.stage_key] || {};
                const rowRegion = PIPELINE_REGION[r.pipeline_name] || '—';
                return (
                  <tr key={r.id}>
                    <td style={{ color: 'var(--muted)', fontSize: 12 }}>{(page - 1) * PAGE_SIZE + i + 1}</td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDate(r.received_at_local)}</td>
                    <td>{r.opportunity_name || r.last_name || '—'}</td>
                    <td style={{ fontSize: 12 }}>{r.email || '—'}</td>
                    <td style={{ fontSize: 12 }}>{r.phone || '—'}</td>
                    <td>
                      <span style={{ background: stageStyle.bg, color: stageStyle.color, borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>
                        {r.stage_key}
                      </span>
                    </td>
                    <td>{PIPELINE_TO_BRANCH[r.pipeline_name] || r.pipeline_name || '—'}</td>
                    <td>{rowRegion}</td>
                    <td>{r.student_name || '—'}</td>
                    <td style={{ fontSize: 12 }}>{r.lead_source || '—'}</td>
                    <td style={{ fontSize: 12 }}>{r.preferred_day || '—'}</td>
                    <td style={{ fontSize: 12 }}>{r.time_slot || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btnSmall btnSecondary" onClick={() => handleEdit(r)}>Edit</button>
                        <button
                          className="btn btnSmall btnDanger"
                          onClick={() => setDeleteId(r.id)}
                          disabled={deleteMutation.isPending}
                        >
                          Del
                        </button>
                      </div>
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

      {/* Delete confirmation modal */}
      {deleteId && (
        <div className="modalOverlay" onClick={() => setDeleteId(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modalHeader">
              <div className="modalTitle">Delete Record</div>
              <button className="modalClose" onClick={() => setDeleteId(null)}>✕</button>
            </div>
            <div className="modalBody">
              <p>Are you sure you want to delete this record? This cannot be undone.</p>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button
                  className="btn btnDanger"
                  onClick={() => deleteMutation.mutate(deleteId)}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                </button>
                <button className="btn btnGhost" onClick={() => setDeleteId(null)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
