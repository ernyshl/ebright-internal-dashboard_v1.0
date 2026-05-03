import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BackButton } from '../components/BackButton';
import { apiFetch } from '../lib/api';

const PAGE_SIZE = 50;

const TYPE_COLORS = {
  error:  { bg: 'var(--brandLight)', color: 'var(--brand)' },
  change: { bg: 'var(--successLight)', color: 'var(--success)' },
  info:   { bg: 'var(--infoLight)', color: 'var(--info)' },
};

export function AuditLogPage() {
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [type, search, dateFrom, dateTo]);

  const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (type) params.set('type', type);
  if (search) params.set('search', search);
  if (dateFrom) params.set('date_from', dateFrom);
  if (dateTo) params.set('date_to', dateTo);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['auditLog', type, search, dateFrom, dateTo, page],
    queryFn: () => apiFetch(`/api/audit-log?${params}`),
    staleTime: 30 * 1000,
  });

  const records = data?.records || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;
  const types = data?.types || [];

  const fmtDate = (d) => d ? new Date(d).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZone: 'Asia/Kuala_Lumpur'
  }) : '—';

  return (
    <div className="dashboardPage">
      <div className="dashboardHeader">
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16 }}>
          <h1 className="pageHeaderTitle">Audit Log</h1>
          <p className="headerSubtitle">{total} log entries</p>
        </div>
        <button className="btn btnGhost btnSmall" onClick={() => refetch()} style={{ marginLeft: 'auto' }}>↺ Refresh</button>
      </div>

      <div className="brRankFilters" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div className="brRankFilterGroup">
          <label className="brRankLabel">Type</label>
          <select className="filterSelect" value={type} onChange={e => setType(e.target.value)}>
            <option value="">All Types</option>
            {types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="brRankFilterGroup" style={{ flex: 1, minWidth: 200 }}>
          <label className="brRankLabel">Search</label>
          <input className="filterInput" placeholder="Message / User / Details" value={search} onChange={e => setSearch(e.target.value)} style={{ width: '100%' }} />
        </div>
        <div className="brRankFilterGroup">
          <label className="brRankLabel">From</label>
          <input type="date" className="filterInput" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div className="brRankFilterGroup">
          <label className="brRankLabel">To</label>
          <input type="date" className="filterInput" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
        {(type || search || dateFrom || dateTo) && (
          <div className="brRankFilterGroup" style={{ alignSelf: 'flex-end' }}>
            <button className="btn btnGhost btnSmall" onClick={() => { setType(''); setSearch(''); setDateFrom(''); setDateTo(''); }}>Clear</button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}><div className="loadingDots"><span /><span /><span /></div></div>
      ) : isError ? (
        <div className="errorText">Failed to load logs.</div>
      ) : (
        <div className="card" style={{ overflowX: 'auto', padding: 0 }}>
          <table className="dataTable">
            <thead>
              <tr>
                <th>#</th>
                <th>Timestamp (MYT)</th>
                <th>Type</th>
                <th>User</th>
                <th>Method</th>
                <th>Endpoint</th>
                <th>Message</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>No logs found</td></tr>
              ) : records.map((r, i) => {
                const ts = TYPE_COLORS[r.log_type] || TYPE_COLORS.info;
                return (
                  <tr key={r.id}>
                    <td style={{ color: 'var(--muted)', fontSize: 11 }}>{(page - 1) * PAGE_SIZE + i + 1}</td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 11 }}>{fmtDate(r.created_at_local)}</td>
                    <td>
                      <span style={{ background: ts.bg, color: ts.color, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
                        {r.log_type}
                      </span>
                    </td>
                    <td style={{ fontSize: 12 }}>{r.user_email || '—'}</td>
                    <td style={{ fontSize: 11 }}>
                      <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{r.method}</span>
                    </td>
                    <td style={{ fontSize: 11, fontFamily: 'monospace', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.endpoint || '—'}</td>
                    <td style={{ fontSize: 12, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.message || '—'}</td>
                    <td style={{ fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--muted)' }} title={r.details}>{r.details || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="paginationBar">
              <button className="btn btnGhost btnSmall" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Prev</button>
              <span className="paginationInfo">Page {page} of {totalPages} ({total} entries)</span>
              <button className="btn btnGhost btnSmall" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next →</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
