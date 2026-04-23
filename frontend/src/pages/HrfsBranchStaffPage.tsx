import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BackButton } from '../components/BackButton';
import { apiFetch } from '../lib/api';

const PAGE_SIZE = 50;

export function HrfsBranchStaffPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [department, setDepartment] = useState('');
  const [position, setPosition] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [search, status, department, position]);

  const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (search) params.set('search', search);
  if (status) params.set('status', status);
  if (department) params.set('department', department);
  if (position) params.set('position', position);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['hrfsBranchStaff', search, status, department, position, page],
    queryFn: () => apiFetch(`/api/hrfs/branch-staff?${params}`),
    staleTime: 2 * 60 * 1000,
  });

  const records = data?.records || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const STATUS_COLORS = {
    active: { bg: 'var(--successLight)', color: 'var(--success)' },
    inactive: { bg: 'var(--brandLight)', color: 'var(--brand)' },
    probation: { bg: 'var(--warningLight)', color: 'var(--warning)' },
  };

  return (
    <div className="dashboardPage">
      <div className="dashboardHeader">
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16 }}><h1 className="pageHeaderTitle">Branch Staff</h1><p className="headerSubtitle">{total} records</p></div>
        <button className="btn btnGhost btnSmall" onClick={() => refetch()} style={{ marginLeft: 'auto' }}>↺ Refresh</button>
      </div>

      <div className="brRankFilters" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div className="brRankFilterGroup" style={{ flex: 1, minWidth: 180 }}><label className="brRankLabel">Search</label><input className="filterInput" placeholder="Name / Nickname / NRIC / Email" value={search} onChange={e => setSearch(e.target.value)} style={{ width: '100%' }} /></div>
        <div className="brRankFilterGroup"><label className="brRankLabel">Status</label><select className="filterSelect" value={status} onChange={e => setStatus(e.target.value)}><option value="">All</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="probation">Probation</option></select></div>
        <div className="brRankFilterGroup"><label className="brRankLabel">Department</label><input className="filterInput" placeholder="Department" value={department} onChange={e => setDepartment(e.target.value)} /></div>
        <div className="brRankFilterGroup"><label className="brRankLabel">Position</label><input className="filterInput" placeholder="Position" value={position} onChange={e => setPosition(e.target.value)} /></div>
        {(search || status || department || position) && <div className="brRankFilterGroup" style={{ alignSelf: 'flex-end' }}><button className="btn btnGhost btnSmall" onClick={() => { setSearch(''); setStatus(''); setDepartment(''); setPosition(''); }}>Clear</button></div>}
      </div>

      {isLoading ? (<div className="card" style={{ textAlign: 'center', padding: 40 }}><div className="loadingDots"><span /><span /><span /></div></div>
      ) : isError ? (<div className="errorText">Failed to load data.</div>
      ) : (
        <div className="card" style={{ overflowX: 'auto', padding: 0 }}>
          <table className="dataTable">
            <thead><tr><th>#</th><th>Name</th><th>Nickname</th><th>Email</th><th>Phone</th><th>Branch</th><th>Department</th><th>Position</th><th>Status</th><th>Employment Type</th><th>Start Date</th></tr></thead>
            <tbody>
              {records.length === 0 ? (<tr><td colSpan={11} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>No records</td></tr>
              ) : records.map((r, i) => {
                const sc = STATUS_COLORS[(r.status || '').toLowerCase()] || {};
                return (
                  <tr key={r.id}>
                    <td style={{ color: 'var(--muted)', fontSize: 11 }}>{(page - 1) * PAGE_SIZE + i + 1}</td>
                    <td><strong>{r.name}</strong></td>
                    <td>{r.nickname || '—'}</td>
                    <td style={{ fontSize: 12 }}>{r.email || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{r.phone || '—'}</td>
                    <td>{r.branch || '—'}</td>
                    <td>{r.department || '—'}</td>
                    <td>{r.position || '—'}</td>
                    <td>{sc.bg ? <span style={{ background: sc.bg, color: sc.color, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{r.status}</span> : (r.status || '—')}</td>
                    <td>{r.employment_type || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.start_date)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {totalPages > 1 && (<div className="paginationBar"><button className="btn btnGhost btnSmall" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Prev</button><span className="paginationInfo">Page {page} of {totalPages}</span><button className="btn btnGhost btnSmall" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next →</button></div>)}
        </div>
      )}
    </div>
  );
}
