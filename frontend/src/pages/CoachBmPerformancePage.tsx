import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BackButton } from '../components/BackButton';
import { BRANCHES } from '../lib/studentTypes';
import { apiFetch } from '../lib/api';

const PAGE_SIZE = 50;

const th = { padding:'10px 14px', textAlign:'left' as const, fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase' as const, whiteSpace:'nowrap' as const, letterSpacing:0.5 };
const td = { padding:'10px 14px', fontSize:12 };

type CoachRow = {
  id: number;
  name: string;
  gender: string | null;
  branch: string | null;
  start_date: string | null;
  contract: string | null;
  status: string | null;
  weekly_training: boolean;
  atcl_diploma: boolean;
  toastmasters: boolean;
};

function fmtStartDate(raw: string | null): string {
  if (!raw) return '—';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw; // fall back to raw text — start_date is inconsistent in BranchStaff
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function CoachBmPerformancePage() {
  const [branchFilter, setBranchFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [branchFilter, searchQuery]);

  const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (branchFilter !== 'All') params.set('branch', branchFilter);
  if (searchQuery.trim())     params.set('search', searchQuery.trim());

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['coachBmPerformance', branchFilter, searchQuery, page],
    queryFn: () => apiFetch(`/api/coach-bm-performance?${params}`),
    staleTime: 2 * 60 * 1000,
  });

  const { data: stats } = useQuery({
    queryKey: ['coachBmPerformanceStats', branchFilter],
    queryFn: () => apiFetch(`/api/coach-bm-performance/stats${branchFilter !== 'All' ? `?branch=${encodeURIComponent(branchFilter)}` : ''}`),
    staleTime: 2 * 60 * 1000,
  });

  const queryClient = useQueryClient();

  const toggleMutation = useMutation({
    mutationFn: ({ id, program, enrolled }: { id: number; program: 'weekly_training' | 'atcl_diploma' | 'toastmasters'; enrolled: boolean }) =>
      apiFetch(`/api/coach-bm-performance/${id}/program`, {
        method: 'PUT',
        body: { program, enrolled },
      }),
    onMutate: async ({ id, program, enrolled }) => {
      // Optimistic update: flip the row in the cached list immediately.
      await queryClient.cancelQueries({ queryKey: ['coachBmPerformance'] });
      const queryKey = ['coachBmPerformance', branchFilter, searchQuery, page];
      const previous = queryClient.getQueryData<any>(queryKey);
      if (previous) {
        queryClient.setQueryData(queryKey, {
          ...previous,
          records: previous.records.map((r: CoachRow) => r.id === id ? { ...r, [program]: enrolled } : r),
        });
      }
      return { previous, queryKey };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous && ctx?.queryKey) {
        queryClient.setQueryData(ctx.queryKey, ctx.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['coachBmPerformance'] });
      queryClient.invalidateQueries({ queryKey: ['coachBmPerformanceStats'] });
    },
  });

  const records: CoachRow[] = data?.records || [];
  const total: number = data?.total || 0;
  const totalPages: number = data?.totalPages || 1;
  const pageStart = (page - 1) * PAGE_SIZE;
  const pageEnd = Math.min(pageStart + PAGE_SIZE, pageStart + records.length);

  const statCard = (label: string, val: number | string, sub: string, color: string, icon: string) => (
    <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:12, padding:'16px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', boxShadow:'var(--shadow-sm)' }}>
      <div>
        <p style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.5, margin:'0 0 4px' }}>{label}</p>
        <p style={{ fontSize:24, fontWeight:800, color, margin:0 }}>{val}<span style={{ fontSize:14, fontWeight:500, color:'var(--muted)' }}>{sub}</span></p>
      </div>
      <div style={{ width:40, height:40, borderRadius:'50%', background:`${color}18`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>{icon}</div>
    </div>
  );

  const wtCount   = stats?.weekly_training ?? 0;
  const atclCount = stats?.atcl_diploma    ?? 0;
  const tmCount   = stats?.toastmasters    ?? 0;
  const statsTotal = stats?.total ?? 0;

  return (
    <div className="dashboardPage">
      {/* Header */}
      <div style={{ marginBottom:24 }}>
        <BackButton to="/" label="Back to Home" />
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:12, flexWrap:'wrap', gap:12 }}>
          <div>
            <h1 style={{ fontSize:28, fontWeight:900, color:'var(--text)', margin:0, letterSpacing:-0.5 }}>🎯 Coach & BM Performance</h1>
            <p style={{ fontSize:13, color:'var(--muted)', margin:'4px 0 0' }}>{total} total coaches & BMs</p>
          </div>
        </div>
      </div>

      {isError && (
        <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:8, padding:'10px 16px', marginBottom:12, fontSize:13, color:'#dc2626' }}>
          ⚠ {(error as any)?.message || 'Failed to load coaches & BMs'}
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:12, marginBottom:16 }}>
        {statCard('Weekly Training', wtCount,   `/${statsTotal}`, '#4f46e5', '🏋️')}
        {statCard('ATCL Diploma',    atclCount, `/${statsTotal}`, '#8b5cf6', '🎓')}
        {statCard('Toastmasters',    tmCount,   `/${statsTotal}`, '#10b981', '🎤')}
      </div>

      {/* Filters */}
      <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 16px', marginBottom:14, display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
        <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>Filter by Branch:</span>
        <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)} style={{ fontSize:13, border:'1px solid var(--border)', borderRadius:8, padding:'6px 12px', background:'var(--bg)', color:'var(--text)', outline:'none' }}>
          <option value="All">All Branches</option>
          {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
        </select>

        <div style={{ display:'flex', alignItems:'center', gap:6, flex:1, minWidth:180, maxWidth:320, border:'1px solid var(--border)', borderRadius:8, padding:'6px 10px', background:'var(--bg)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            placeholder="Search name…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ border:'none', outline:'none', background:'transparent', fontSize:13, color:'var(--text)', flex:1, minWidth:0 }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:16, lineHeight:1, padding:0 }}>×</button>
          )}
        </div>

        {total > 0 && (
          <span style={{ fontSize:13, color:'var(--muted)', fontWeight:500 }}>
            Showing {pageStart + 1}-{pageEnd} of {total}
          </span>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div style={{ textAlign:'center', padding:48, color:'var(--muted)', fontSize:14 }}>Loading coaches & BMs…</div>
      ) : (
        <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ minWidth:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:'var(--bg)', borderBottom:'1px solid var(--border)' }}>
                  {['No.','Name','Gender','Branch','Start Date','Contract Period','Programs','No. of Lessons','No. of Students'].map(h => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.length === 0 ? (
                  <tr><td colSpan={9} style={{ ...td, textAlign:'center', padding:'48px 16px', color:'var(--muted)' }}>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:36 }}>🎯</span>
                      <p style={{ fontWeight:600, color:'var(--text)', margin:0 }}>
                        {searchQuery || branchFilter !== 'All' ? 'No coaches or BMs match your filters' : 'No active coaches or BMs'}
                      </p>
                    </div>
                  </td></tr>
                ) : records.map((r, idx) => (
                  <tr key={r.id} style={{ borderTop:'1px solid var(--border)' }}>
                    <td style={{ ...td, color:'var(--muted)' }}>{pageStart + idx + 1}</td>
                    <td style={td}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontWeight:600, color:'var(--text)', whiteSpace:'nowrap' }}>{r.name}</span>
                        <span style={{ fontSize:10, padding:'2px 7px', borderRadius:99, fontWeight:600, background:r.status==='Active'?'rgba(34,197,94,0.15)':'rgba(239,68,68,0.12)', color:r.status==='Active'?'#16a34a':'#dc2626' }}>{r.status}</span>
                      </div>
                    </td>
                    <td style={{ ...td, color:'var(--muted)', whiteSpace:'nowrap' }}>{r.gender || '—'}</td>
                    <td style={td}><span style={{ fontSize:11, padding:'2px 8px', borderRadius:6, fontWeight:600, background:'rgba(99,102,241,0.1)', color:'#6366f1' }}>{r.branch || '—'}</span></td>
                    <td style={{ ...td, color:'var(--muted)', whiteSpace:'nowrap' }}>{fmtStartDate(r.start_date)}</td>
                    <td style={{ ...td, color: r.contract ? 'var(--text)' : 'var(--muted)' }}>{r.contract || '—'}</td>
                    <td style={td}>
                      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                        {([
                          { key: 'weekly_training' as const, label: 'Weekly Training', color: '#4f46e5' },
                          { key: 'atcl_diploma'    as const, label: 'ATCL Diploma',    color: '#8b5cf6' },
                          { key: 'toastmasters'    as const, label: 'Toastmasters',    color: '#10b981' },
                        ]).map(p => (
                          <label key={p.key} style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', fontSize:11 }}>
                            <input
                              type="checkbox"
                              checked={r[p.key]}
                              onChange={() => toggleMutation.mutate({ id: r.id, program: p.key, enrolled: !r[p.key] })}
                              style={{ accentColor: p.color, cursor:'pointer' }}
                            />
                            <span style={{ color: r[p.key] ? p.color : 'var(--muted)', fontWeight: r[p.key] ? 600 : 400 }}>{p.label}</span>
                          </label>
                        ))}
                      </div>
                    </td>
                    <td style={{ ...td, color:'var(--muted)' }}>—</td>
                    <td style={{ ...td, color:'var(--muted)' }}>—</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderTop:'1px solid var(--border)', flexWrap:'wrap', gap:12 }}>
              <span style={{ fontSize:12, color:'var(--muted)' }}>Page {page} of {totalPages} · {total} records</span>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                <button onClick={() => setPage(1)} disabled={page === 1} style={{ fontSize:12, padding:'5px 10px', borderRadius:6, border:'1px solid var(--border)', background:'var(--panel)', color:'var(--text)', cursor:page===1?'not-allowed':'pointer', opacity:page===1?0.4:1, fontWeight:500 }}>« First</button>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ fontSize:12, padding:'5px 10px', borderRadius:6, border:'1px solid var(--border)', background:'var(--panel)', color:'var(--text)', cursor:page===1?'not-allowed':'pointer', opacity:page===1?0.4:1, fontWeight:500 }}>‹ Prev</button>
                <span style={{ fontSize:12, padding:'5px 10px', color:'var(--text)', fontWeight:600 }}>{page}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ fontSize:12, padding:'5px 10px', borderRadius:6, border:'1px solid var(--border)', background:'var(--panel)', color:'var(--text)', cursor:page===totalPages?'not-allowed':'pointer', opacity:page===totalPages?0.4:1, fontWeight:500 }}>Next ›</button>
                <button onClick={() => setPage(totalPages)} disabled={page === totalPages} style={{ fontSize:12, padding:'5px 10px', borderRadius:6, border:'1px solid var(--border)', background:'var(--panel)', color:'var(--text)', cursor:page===totalPages?'not-allowed':'pointer', opacity:page===totalPages?0.4:1, fontWeight:500 }}>Last »</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
