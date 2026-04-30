import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { BackButton } from '../components/BackButton';
import { apiFetch } from '../lib/api';

const PAGE_SIZE = 50;

const SHOW_OPTIONS = [
  { key: 'pending',  label: 'Pending' },
  { key: 'replayed', label: 'Replayed' },
  { key: 'all',      label: 'All' },
];

export function GhlIgnoredPayloadsPage() {
  const queryClient = useQueryClient();
  const [show,     setShow]     = useState('pending');
  const [search,   setSearch]   = useState('');
  const [page,     setPage]     = useState(1);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [confirmReplay, setConfirmReplay] = useState<any | null>(null);
  const [error,    setError]    = useState('');

  useEffect(() => { setPage(1); }, [show, search]);

  const params = new URLSearchParams({ show, page: String(page), limit: String(PAGE_SIZE) });
  if (search) params.set('search', search);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['ghlIgnoredPayloads', show, search, page],
    queryFn: () => apiFetch(`/api/ghl-stages/ignored?${params}`),
    staleTime: 30 * 1000,
    placeholderData: keepPreviousData,
  });

  const replayMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/ghl-stages/ignored/${id}/replay`, { method: 'POST' }),
    onSuccess: () => {
      setError('');
      setConfirmReplay(null);
      queryClient.invalidateQueries({ queryKey: ['ghlIgnoredPayloads'] });
    },
    onError: (err: any) => {
      setError(err?.data?.error || err?.message || 'Replay failed');
    },
  });

  const records = data?.records || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;

  const fmt = (d: string | null) =>
    d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <div className="dashboardPage">
      <div className="dashboardHeader">
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16 }}>
          <h1 className="pageHeaderTitle">GHL Ignored Payloads</h1>
          <p className="headerSubtitle">{total} records · webhooks dropped by the dedup rule, replay to merge into Lead Centre</p>
        </div>
        <button className="btn btnGhost btnSmall" onClick={() => refetch()} style={{ marginLeft: 'auto' }}>↺ Refresh</button>
      </div>

      <div className="ldFilterBar" style={{ marginBottom: 8 }}>
        {SHOW_OPTIONS.map(o => (
          <button key={o.key} className={`btn ${show === o.key ? 'btnPrimary' : 'btnGhost'} btnSmall`} onClick={() => setShow(o.key)}>
            {o.label}
          </button>
        ))}
      </div>

      <div className="brRankFilters" style={{ marginBottom: 16, gap: 12 }}>
        <div className="brRankFilterGroup" style={{ flex: 1, minWidth: 220 }}>
          <label className="brRankLabel">Search</label>
          <input className="filterInput" placeholder="Opportunity name / email / stage / reason" value={search} onChange={e => setSearch(e.target.value)} style={{ width: '100%' }} />
        </div>
        {(search) && (
          <div className="brRankFilterGroup" style={{ alignSelf: 'flex-end' }}>
            <button className="btn btnGhost btnSmall" onClick={() => setSearch('')}>Clear</button>
          </div>
        )}
      </div>

      {error && <div className="errorText" style={{ marginBottom: 12 }}>{error}</div>}

      {isLoading ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div className="loadingDots"><span /><span /><span /></div>
          <p style={{ marginTop: 12, color: 'var(--muted)' }}>Loading…</p>
        </div>
      ) : isError ? (
        <div className="errorText">Failed to load ignored payloads.</div>
      ) : (
        <div className="card" style={{ overflowX: 'auto', padding: 0 }}>
          <table className="dataTable">
            <thead>
              <tr>
                <th>#</th>
                <th>Received</th>
                <th>Opportunity</th>
                <th>Email</th>
                <th>Stage</th>
                <th>Reason</th>
                <th>Replayed</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>No records</td></tr>
              ) : records.map((r: any, i: number) => {
                const isOpen = expanded === r.id;
                return (
                  <>
                    <tr key={r.id} style={r.replayed_at ? { background: 'var(--bg2)', color: 'var(--muted)' } : {}}>
                      <td style={{ color: 'var(--muted)', fontSize: 11 }}>{(page - 1) * PAGE_SIZE + i + 1}</td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{fmt(r.created_at)}</td>
                      <td style={{ fontSize: 12, fontWeight: 600 }}>{r.opportunity_name || '—'}</td>
                      <td style={{ fontSize: 12 }}>{r.email || '—'}</td>
                      <td style={{ fontSize: 12 }}>
                        <span style={{ background: 'var(--inputBg)', borderRadius: 4, padding: '2px 8px', fontWeight: 600 }}>{r.stage_key || '—'}</span>{' '}
                        <span style={{ color: 'var(--muted)' }}>{r.stage_raw || ''}</span>
                      </td>
                      <td style={{ fontSize: 12 }}>{r.reason || '—'}</td>
                      <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmt(r.replayed_at)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btnSmall btnSecondary" onClick={() => setExpanded(isOpen ? null : r.id)}>
                            {isOpen ? 'Hide' : 'View'}
                          </button>
                          <button
                            className="btn btnSmall btnPrimary"
                            disabled={!!r.replayed_at || replayMutation.isPending}
                            onClick={() => setConfirmReplay(r)}
                            title={r.replayed_at ? 'Already replayed' : 'Push payload into ghl_stages'}
                          >
                            Push to GHL
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={`${r.id}-payload`}>
                        <td colSpan={8} style={{ background: 'var(--bg2)', padding: 16 }}>
                          <pre style={{ margin: 0, fontSize: 11, lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {JSON.stringify(r.payload, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </>
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

      {confirmReplay && (
        <div className="modalOverlay" onClick={() => setConfirmReplay(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modalHeader">
              <div className="modalTitle">Push to GHL Lead Centre?</div>
              <button className="modalClose" onClick={() => setConfirmReplay(null)}>✕</button>
            </div>
            <div className="modalBody">
              <p style={{ marginTop: 0 }}>
                This will merge the ignored payload into <strong>ghl_stages</strong> for{' '}
                <strong>{confirmReplay.email}</strong> at stage <strong>{confirmReplay.stage_key}</strong>.
              </p>
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>
                Non-empty fields from the payload overwrite the existing row; empty fields preserve what's already there.
                The log row is then marked as replayed and disappears from Pending.
              </p>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button
                  className="btn btnPrimary"
                  onClick={() => replayMutation.mutate(confirmReplay.id)}
                  disabled={replayMutation.isPending}
                >
                  {replayMutation.isPending ? 'Pushing…' : 'Push to GHL'}
                </button>
                <button className="btn btnGhost" onClick={() => setConfirmReplay(null)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
