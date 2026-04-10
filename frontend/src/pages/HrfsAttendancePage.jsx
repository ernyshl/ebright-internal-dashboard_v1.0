import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BackButton } from '../components/BackButton';
import { apiFetch } from '../lib/api';

const PAGE_SIZE = 50;

export function HrfsAttendancePage() {
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [search, dateFrom, dateTo]);

  const params = new URLSearchParams({ page, limit: PAGE_SIZE });
  if (search) params.set('search', search);
  if (dateFrom) params.set('date_from', dateFrom);
  if (dateTo) params.set('date_to', dateTo);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['hrfsAttendance', search, dateFrom, dateTo, page],
    queryFn: () => apiFetch(`/api/hrfs/attendance?${params}`),
    staleTime: 2 * 60 * 1000,
  });

  const records = data?.records || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const fmtTime = (d) => d ? new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—';

  const emailStatus = (inSent, outSent) => {
    if (inSent && outSent) return { label: 'Both Sent', bg: 'var(--successLight)', color: 'var(--success)' };
    if (inSent || outSent) return { label: 'Partial', bg: 'var(--warningLight)', color: 'var(--warning)' };
    return { label: 'Not Sent', bg: 'var(--brandLight)', color: 'var(--brand)' };
  };

  return (
    <div className="dashboardPage">
      <div className="dashboardHeader">
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16 }}><h1 className="pageHeaderTitle">Attendance Log</h1><p className="headerSubtitle">{total} records</p></div>
        <button className="btn btnGhost btnSmall" onClick={() => refetch()} style={{ marginLeft: 'auto' }}>↺ Refresh</button>
      </div>

      <div className="brRankFilters" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div className="brRankFilterGroup" style={{ flex: 1, minWidth: 180 }}><label className="brRankLabel">Search</label><input className="filterInput" placeholder="Employee No / Name" value={search} onChange={e => setSearch(e.target.value)} style={{ width: '100%' }} /></div>
        <div className="brRankFilterGroup"><label className="brRankLabel">From</label><input type="date" className="filterInput" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
        <div className="brRankFilterGroup"><label className="brRankLabel">To</label><input type="date" className="filterInput" value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
        {(search || dateFrom || dateTo) && <div className="brRankFilterGroup" style={{ alignSelf: 'flex-end' }}><button className="btn btnGhost btnSmall" onClick={() => { setSearch(''); setDateFrom(''); setDateTo(''); }}>Clear</button></div>}
      </div>

      {isLoading ? (<div className="card" style={{ textAlign: 'center', padding: 40 }}><div className="loadingDots"><span /><span /><span /></div></div>
      ) : isError ? (<div className="errorText">Failed to load data.</div>
      ) : (
        <div className="card" style={{ overflowX: 'auto', padding: 0 }}>
          <table className="dataTable">
            <thead><tr><th>#</th><th>Employee No</th><th>Employee Name</th><th>Branch</th><th>Date</th><th>Clock In</th><th>Clock Out</th><th>Status</th></tr></thead>
            <tbody>
              {records.length === 0 ? (<tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>No records</td></tr>
              ) : records.map((r, i) => {
                const st = emailStatus(r.clockInEmailSent, r.clockOutEmailSent);
                return (
                  <tr key={r.id}>
                    <td style={{ color: 'var(--muted)', fontSize: 11 }}>{(page - 1) * PAGE_SIZE + i + 1}</td>
                    <td><strong>{r.empNo}</strong></td>
                    <td>{r.empName || r.staff_name || '—'}</td>
                    <td style={{ fontSize: 12 }}>{r.branch || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.date)}</td>
                    <td>{fmtTime(r.clockInTime)}</td>
                    <td>{fmtTime(r.clockOutTime)}</td>
                    <td><span style={{ background: st.bg, color: st.color, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{st.label}</span></td>
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
