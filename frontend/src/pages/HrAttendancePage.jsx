import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BackButton } from '../components/BackButton';
import { apiFetch } from '../lib/api';

const PAGE_SIZE = 50;

export function HrAttendancePage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [search, status, dateFrom, dateTo]);

  const params = new URLSearchParams({ page, limit: PAGE_SIZE });
  if (search) params.set('search', search);
  if (status) params.set('status', status);
  if (dateFrom) params.set('date_from', dateFrom);
  if (dateTo) params.set('date_to', dateTo);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['hrAttendance', search, status, dateFrom, dateTo, page],
    queryFn: () => apiFetch(`/api/hr-attendance?${params}`),
    staleTime: 2 * 60 * 1000,
  });

  const records = data?.records || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const fmtTime = (d) => d ? new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—';

  const STATUS_COLORS = {
    P: { bg: 'var(--successLight)', color: 'var(--success)' },
    A: { bg: 'var(--brandLight)', color: 'var(--brand)' },
    L: { bg: 'var(--warningLight)', color: 'var(--warning)' },
  };

  return (
    <div className="dashboardPage">
      <div className="dashboardHeader">
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16 }}><h1 className="pageHeaderTitle">Attendance</h1><p className="headerSubtitle">{total} records</p></div>
        <button className="btn btnGhost btnSmall" onClick={() => refetch()} style={{ marginLeft: 'auto' }}>↺ Refresh</button>
      </div>

      <div className="brRankFilters" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div className="brRankFilterGroup" style={{ flex: 1, minWidth: 180 }}><label className="brRankLabel">Search</label><input className="filterInput" placeholder="Employee Code / Company ID" value={search} onChange={e => setSearch(e.target.value)} style={{ width: '100%' }} /></div>
        <div className="brRankFilterGroup"><label className="brRankLabel">Status</label><select className="filterSelect" value={status} onChange={e => setStatus(e.target.value)}><option value="">All</option><option value="P">Present</option><option value="A">Absent</option><option value="L">Leave</option></select></div>
        <div className="brRankFilterGroup"><label className="brRankLabel">From</label><input type="date" className="filterInput" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
        <div className="brRankFilterGroup"><label className="brRankLabel">To</label><input type="date" className="filterInput" value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
        {(search || status || dateFrom || dateTo) && <div className="brRankFilterGroup" style={{ alignSelf: 'flex-end' }}><button className="btn btnGhost btnSmall" onClick={() => { setSearch(''); setStatus(''); setDateFrom(''); setDateTo(''); }}>Clear</button></div>}
      </div>

      {isLoading ? (<div className="card" style={{ textAlign: 'center', padding: 40 }}><div className="loadingDots"><span /><span /><span /></div></div>
      ) : isError ? (<div className="errorText">Failed to load data.</div>
      ) : (
        <div className="card" style={{ overflowX: 'auto', padding: 0 }}>
          <table className="dataTable">
            <thead><tr><th>#</th><th>Employee Code</th><th>Company ID</th><th>Date</th><th>Clock In</th><th>Clock Out</th><th>Status</th><th>Last Synced</th></tr></thead>
            <tbody>
              {records.length === 0 ? (<tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>No records</td></tr>
              ) : records.map((r, i) => {
                const sc = STATUS_COLORS[r.attendance_status] || {};
                return (
                  <tr key={r.id}>
                    <td style={{ color: 'var(--muted)', fontSize: 11 }}>{(page - 1) * PAGE_SIZE + i + 1}</td>
                    <td><strong>{r.employee_code}</strong></td>
                    <td style={{ fontSize: 12 }}>{r.company_id}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.attendance_date)}</td>
                    <td>{fmtTime(r.clock_in)}</td>
                    <td>{fmtTime(r.clock_out)}</td>
                    <td><span style={{ background: sc.bg, color: sc.color, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{r.attendance_status}</span></td>
                    <td style={{ fontSize: 11, color: 'var(--muted)' }}>{fmtDate(r.last_synced_at)}</td>
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
