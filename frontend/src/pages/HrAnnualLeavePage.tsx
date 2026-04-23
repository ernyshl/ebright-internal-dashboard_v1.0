import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { BackButton } from '../components/BackButton';
import { apiFetch } from '../lib/api';

const PAGE_SIZE = 50;

const POSITION_OPTIONS = ['HOD','Executive','Full-Time Branch Manager','Full-Time Coach','Full-Time','Part-Time','Intern'];
const DEPARTMENT_OPTIONS = ['Academy','Operation','Finance','Marketing','Industrial Organisation Psychology','Human Resource','Optimisation','Ampang','Bandar Baru Bangi','Bandar Rimbayu','Bandar Seri Putra','Bandar Tun Hussein Onn','Cyberjaya','Danau Kota','Denai Alam','Eco Grandeur','Kajang TTDI Grove','Klang','Kota Damansara','Kota Warisan','Putrajaya','Setia Alam','Shah Alam','Sri Petaling','Subang Taipan','Taman Sri Gombak'];
const DURATION_OPTIONS = ['1 Day','2 Days','3 Days','4 Days','5 Days','1 Week','2 Weeks'];

const EMPTY_FORM = { name: '', position: '', department_branch: '', al_date: '', al_duration: '' };

export function HrAnnualLeavePage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [posFilter, setPosFilter] = useState('');
  const [dept, setDept] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [deleteId, setDeleteId] = useState(null);

  useEffect(() => { setPage(1); }, [search, posFilter, dept, dateFrom, dateTo]);

  const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (search) params.set('search', search);
  if (posFilter) params.set('position', posFilter);
  if (dept) params.set('department_branch', dept);
  if (dateFrom) params.set('date_from', dateFrom);
  if (dateTo) params.set('date_to', dateTo);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['hrAnnualLeaveList', search, posFilter, dept, dateFrom, dateTo, page],
    queryFn: () => apiFetch(`/api/hr-annual-leave?${params}`),
    staleTime: 2 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const invalidate = () => { queryClient.invalidateQueries({ queryKey: ['hrAnnualLeaveList'] }); queryClient.invalidateQueries({ queryKey: ['hrAnnualLeaveDashboard'] }); };
  const createMutation = useMutation({ mutationFn: (body: any) => apiFetch('/api/hr-annual-leave', { method: 'POST', body }), onSuccess: () => { invalidate(); setShowForm(false); setForm({ ...EMPTY_FORM }); } });
  const updateMutation = useMutation({ mutationFn: ({ id, body }: { id: any; body: any }) => apiFetch(`/api/hr-annual-leave/${id}`, { method: 'PUT', body }), onSuccess: () => { invalidate(); setShowForm(false); setEditingId(null); setForm({ ...EMPTY_FORM }); } });
  const deleteMutation = useMutation({ mutationFn: (id: any) => apiFetch(`/api/hr-annual-leave/${id}`, { method: 'DELETE' }), onSuccess: () => { invalidate(); setDeleteId(null); } });

  const records = data?.records || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const isSaving = createMutation.isPending || updateMutation.isPending;

  const handleEdit = (r) => { setEditingId(r.id); setForm({ name: r.name || '', position: r.position || '', department_branch: r.department_branch || '', al_date: r.al_date ? r.al_date.split('T')[0] : '', al_duration: r.al_duration || '' }); setShowForm(true); };
  const handleAdd = () => { setEditingId(null); setForm({ ...EMPTY_FORM }); setShowForm(true); };
  const handleSubmit = (e) => { e.preventDefault(); if (editingId) updateMutation.mutate({ id: editingId, body: form }); else createMutation.mutate(form); };

  return (
    <div className="dashboardPage">
      <div className="dashboardHeader">
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16 }}><h1 className="pageHeaderTitle">Annual Leave</h1><p className="headerSubtitle">{total} records</p></div>
        <button className="btn btnPrimary btnSmall" onClick={handleAdd} style={{ marginLeft: 'auto' }}>+ Add Leave</button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>{editingId ? 'Edit Leave' : 'Add New Leave'}</h3>
            <button className="btn btnGhost btnSmall" onClick={() => { setShowForm(false); setEditingId(null); }}>✕ Cancel</button>
          </div>
          <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <label className="field"><div className="label">Name</div><input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></label>
            <label className="field"><div className="label">Position</div><select className="input" value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} required><option value="">Select</option>{POSITION_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}</select></label>
            <label className="field"><div className="label">Department / Branch</div><select className="input" value={form.department_branch} onChange={e => setForm({ ...form, department_branch: e.target.value })} required><option value="">Select</option>{DEPARTMENT_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}</select></label>
            <label className="field"><div className="label">AL Date</div><input className="input" type="date" value={form.al_date} onChange={e => setForm({ ...form, al_date: e.target.value })} required /></label>
            <label className="field"><div className="label">Duration</div><select className="input" value={form.al_duration} onChange={e => setForm({ ...form, al_duration: e.target.value })} required><option value="">Select</option>{DURATION_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}</select></label>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}><button className="btn btnPrimary" type="submit" disabled={isSaving}>{isSaving ? 'Saving...' : (editingId ? 'Save' : 'Add Leave')}</button></div>
            {(createMutation.isError || updateMutation.isError) && <div style={{ gridColumn: '1 / -1', color: 'var(--brand)', fontSize: 12 }}>{createMutation.error?.data?.error || updateMutation.error?.data?.error || 'Failed'}</div>}
          </form>
        </div>
      )}

      <div className="brRankFilters" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div className="brRankFilterGroup" style={{ flex: 1, minWidth: 180 }}><label className="brRankLabel">Search</label><input className="filterInput" placeholder="Name" value={search} onChange={e => setSearch(e.target.value)} style={{ width: '100%' }} /></div>
        <div className="brRankFilterGroup"><label className="brRankLabel">Position</label><select className="filterSelect" value={posFilter} onChange={e => setPosFilter(e.target.value)}><option value="">All</option>{POSITION_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
        <div className="brRankFilterGroup"><label className="brRankLabel">Dept / Branch</label><select className="filterSelect" value={dept} onChange={e => setDept(e.target.value)}><option value="">All</option>{DEPARTMENT_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}</select></div>
        <div className="brRankFilterGroup"><label className="brRankLabel">From</label><input type="date" className="filterInput" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
        <div className="brRankFilterGroup"><label className="brRankLabel">To</label><input type="date" className="filterInput" value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
        {(search || posFilter || dept || dateFrom || dateTo) && <div className="brRankFilterGroup" style={{ alignSelf: 'flex-end' }}><button className="btn btnGhost btnSmall" onClick={() => { setSearch(''); setPosFilter(''); setDept(''); setDateFrom(''); setDateTo(''); }}>Clear</button></div>}
        <div className="brRankFilterGroup" style={{ alignSelf: 'flex-end', marginLeft: 'auto' }}><button className="btn btnGhost btnSmall" onClick={() => refetch()}>↺ Refresh</button></div>
      </div>

      {isLoading ? (<div className="card" style={{ textAlign: 'center', padding: 40 }}><div className="loadingDots"><span /><span /><span /></div></div>
      ) : isError ? (<div className="errorText">Failed to load data.</div>
      ) : (
        <div className="card" style={{ overflowX: 'auto', padding: 0 }}>
          <table className="dataTable">
            <thead><tr><th>#</th><th>Name</th><th>Position</th><th>Dept / Branch</th><th>AL Date</th><th>Duration</th><th>Actions</th></tr></thead>
            <tbody>
              {records.length === 0 ? (<tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>No records</td></tr>
              ) : records.map((r, i) => (
                <tr key={r.id}>
                  <td style={{ color: 'var(--muted)', fontSize: 12 }}>{(page - 1) * PAGE_SIZE + i + 1}</td>
                  <td><strong>{r.name}</strong></td><td>{r.position}</td><td>{r.department_branch}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.al_date)}</td><td>{r.al_duration || '—'}</td>
                  <td><div style={{ display: 'flex', gap: 4 }}><button className="btn btnSmall btnSecondary" onClick={() => handleEdit(r)}>Edit</button><button className="btn btnSmall btnDanger" onClick={() => setDeleteId(r.id)}>Del</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
          {totalPages > 1 && (<div className="paginationBar"><button className="btn btnGhost btnSmall" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Prev</button><span className="paginationInfo">Page {page} of {totalPages}</span><button className="btn btnGhost btnSmall" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next →</button></div>)}
        </div>
      )}

      {deleteId && (
        <div className="modalOverlay" onClick={() => setDeleteId(null)}><div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}><div className="modalHeader"><div className="modalTitle">Delete Leave Record</div><button className="modalClose" onClick={() => setDeleteId(null)}>✕</button></div><div className="modalBody"><p>Delete this leave record?</p><div style={{ display: 'flex', gap: 10, marginTop: 16 }}><button className="btn btnDanger" onClick={() => deleteMutation.mutate(deleteId)} disabled={deleteMutation.isPending}>{deleteMutation.isPending ? 'Deleting...' : 'Delete'}</button><button className="btn btnGhost" onClick={() => setDeleteId(null)}>Cancel</button></div></div></div></div>
      )}
    </div>
  );
}
