import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BackButton } from '../components/BackButton';
import { apiFetch } from '../lib/api';

const PAGE_SIZE = 50;

export function HrHiringPage() {
  const [search, setSearch] = useState('');
  const [empType, setEmpType] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [search, empType]);

  const params = new URLSearchParams({ page, limit: PAGE_SIZE });
  if (search) params.set('search', search);
  if (empType) params.set('employment_type', empType);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['hrHiring', search, empType, page],
    queryFn: () => apiFetch(`/api/hr-hiring?${params}`),
    staleTime: 2 * 60 * 1000,
  });

  const records = data?.records || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  return (
    <div className="dashboardPage">
      <div className="dashboardHeader">
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16 }}><h1 className="pageHeaderTitle">Hiring Data</h1><p className="headerSubtitle">{total} records</p></div>
        <button className="btn btnGhost btnSmall" onClick={() => refetch()} style={{ marginLeft: 'auto' }}>↺ Refresh</button>
      </div>

      <div className="brRankFilters" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div className="brRankFilterGroup" style={{ flex: 1, minWidth: 180 }}><label className="brRankLabel">Search</label><input className="filterInput" placeholder="Name / Tags / Contact ID" value={search} onChange={e => setSearch(e.target.value)} style={{ width: '100%' }} /></div>
        <div className="brRankFilterGroup"><label className="brRankLabel">Employment Type</label><select className="filterSelect" value={empType} onChange={e => setEmpType(e.target.value)}><option value="">All</option><option value="Full-Time">Full-Time</option><option value="Part-Time">Part-Time</option><option value="Intern">Intern</option><option value="Contract">Contract</option></select></div>
        {(search || empType) && <div className="brRankFilterGroup" style={{ alignSelf: 'flex-end' }}><button className="btn btnGhost btnSmall" onClick={() => { setSearch(''); setEmpType(''); }}>Clear</button></div>}
      </div>

      {isLoading ? (<div className="card" style={{ textAlign: 'center', padding: 40 }}><div className="loadingDots"><span /><span /><span /></div></div>
      ) : isError ? (<div className="errorText">Failed to load data.</div>
      ) : (
        <div className="card" style={{ overflowX: 'auto', padding: 0 }}>
          <table className="dataTable">
            <thead><tr><th>#</th><th>First Name</th><th>Last Name</th><th>Employment Type</th><th>Tags</th><th>Synced At</th></tr></thead>
            <tbody>
              {records.length === 0 ? (<tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>No records</td></tr>
              ) : records.map((r, i) => (
                <tr key={r.contact_id}>
                  <td style={{ color: 'var(--muted)', fontSize: 11 }}>{(page - 1) * PAGE_SIZE + i + 1}</td>
                  <td><strong>{r.first_name || '—'}</strong></td>
                  <td>{r.last_name || '—'}</td>
                  <td>{r.employment_type || '—'}</td>
                  <td style={{ fontSize: 11, maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.tags || '—'}</td>
                  <td style={{ fontSize: 11, color: 'var(--muted)' }}>{fmtDate(r.synced_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {totalPages > 1 && (<div className="paginationBar"><button className="btn btnGhost btnSmall" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Prev</button><span className="paginationInfo">Page {page} of {totalPages}</span><button className="btn btnGhost btnSmall" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next →</button></div>)}
        </div>
      )}
    </div>
  );
}
