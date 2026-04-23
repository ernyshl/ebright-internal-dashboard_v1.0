import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BackButton } from '../components/BackButton';
import { apiFetch } from '../lib/api';

const PAGE_SIZE = 50;

export function HrfsLeaveTransactionPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [leaveType, setLeaveType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [search, status, leaveType, dateFrom, dateTo]);

  const params = new URLSearchParams({ page, limit: PAGE_SIZE });
  if (search) params.set('search', search);
  if (status) params.set('status', status);
  if (leaveType) params.set('leave_type', leaveType);
  if (dateFrom) params.set('date_from', dateFrom);
  if (dateTo) params.set('date_to', dateTo);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['hrfsLeaveTransactions', search, status, leaveType, dateFrom, dateTo, page],
    queryFn: () => apiFetch(`/api/hrfs/leave-transactions?${params}`),
    staleTime: 2 * 60 * 1000,
  });

  const records = data?.records || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const STATUS_COLORS = {
    Approved: { bg: 'var(--successLight)', color: 'var(--success)' },
    Pending: { bg: 'var(--warningLight)', color: 'var(--warning)' },
    Rejected: { bg: 'var(--brandLight)', color: 'var(--brand)' },
  };

  return (
    <div className="dashboardPage">
      <div className="dashboardHeader">
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16 }}><h1 className="pageHeaderTitle">Leave Transactions</h1><p className="headerSubtitle">{total} records</p></div>
        <button className="btn btnGhost btnSmall" onClick={() => refetch()} style={{ marginLeft: 'auto' }}>↺ Refresh</button>
      </div>

      <div className="brRankFilters" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div className="brRankFilterGroup" style={{ flex: 1, minWidth: 180 }}><label className="brRankLabel">Search</label><input className="filterInput" placeholder="Employee Code" value={search} onChange={e => setSearch(e.target.value)} style={{ width: '100%' }} /></div>
        <div className="brRankFilterGroup"><label className="brRankLabel">Status</label><select className="filterSelect" value={status} onChange={e => setStatus(e.target.value)}><option value="">All</option><option value="Approved">Approved</option><option value="Pending">Pending</option><option value="Rejected">Rejected</option></select></div>
        <div className="brRankFilterGroup"><label className="brRankLabel">Leave Type</label><input className="filterInput" placeholder="Leave Type Code" value={leaveType} onChange={e => setLeaveType(e.target.value)} /></div>
        <div className="brRankFilterGroup"><label className="brRankLabel">From</label><input type="date" className="filterInput" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
        <div className="brRankFilterGroup"><label className="brRankLabel">To</label><input type="date" className="filterInput" value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
        {(search || status || leaveType || dateFrom || dateTo) && <div className="brRankFilterGroup" style={{ alignSelf: 'flex-end' }}><button className="btn btnGhost btnSmall" onClick={() => { setSearch(''); setStatus(''); setLeaveType(''); setDateFrom(''); setDateTo(''); }}>Clear</button></div>}
      </div>

      {isLoading ? (<div className="card" style={{ textAlign: 'center', padding: 40 }}><div className="loadingDots"><span /><span /><span /></div></div>
      ) : isError ? (<div className="errorText">Failed to load data.</div>
      ) : (
        <div className="card" style={{ overflowX: 'auto', padding: 0 }}>
          <table className="dataTable">
            <thead><tr><th>#</th><th>Employee Code</th><th>Employee Name</th><th>Leave Type</th><th>Apply Date</th><th>Leave Date</th><th>Days</th><th>Reason</th><th>Status</th><th>Remark</th></tr></thead>
            <tbody>
              {records.length === 0 ? (<tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>No records</td></tr>
              ) : records.map((r, i) => {
                const sc = STATUS_COLORS[r.ApplyStatus] || {};
                return (
                  <tr key={r.id}>
                    <td style={{ color: 'var(--muted)', fontSize: 11 }}>{(page - 1) * PAGE_SIZE + i + 1}</td>
                    <td><strong>{r.EmployeeCode}</strong></td>
                    <td>{r.employee_name || '—'}</td>
                    <td>{r.LeaveTypeCode || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.ApplyDate)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.LeaveDate)}</td>
                    <td>{r.Days ?? r.DayNo ?? '—'}</td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.ApplyReason || '—'}</td>
                    <td>{sc.bg ? <span style={{ background: sc.bg, color: sc.color, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{r.ApplyStatus}</span> : (r.ApplyStatus || '—')}</td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.ActionRemark || '—'}</td>
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
