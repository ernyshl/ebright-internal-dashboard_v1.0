import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../../lib/api';
import { BRANCHES } from '../../lib/studentTypes';
import { getUser } from '../../lib/auth';

type LogRow = {
  id: number;
  student_id: number | null;
  student_name: string;
  branch: string;
  action: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  user_email: string;
  note: string | null;
  changed_at_local: string; // "2026-05-15 14:35:22.123456" (Asia/Kuala_Lumpur)
};

type ListResponse = {
  records: LogRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  branches: string[];
  actions: string[];
};

const ACTION_COLORS: Record<string, { fg: string; bg: string; label: string }> = {
  create:  { fg: '#16a34a', bg: 'rgba(34,197,94,0.10)',   label: 'Create'   },
  edit:    { fg: '#2563eb', bg: 'rgba(59,130,246,0.10)',  label: 'Edit'     },
  delete:  { fg: '#dc2626', bg: 'rgba(220,38,38,0.10)',   label: 'Delete'   },
  archive: { fg: '#d97706', bg: 'rgba(245,158,11,0.10)',  label: 'Archive'  },
  restore: { fg: '#0891b2', bg: 'rgba(8,145,178,0.10)',   label: 'Restore'  },
  tick:    { fg: '#16a34a', bg: 'rgba(34,197,94,0.10)',   label: 'Tick'     },
  untick:  { fg: '#64748b', bg: 'rgba(100,116,139,0.10)', label: 'Untick'   },
  revert:  { fg: '#7c3aed', bg: 'rgba(124,58,237,0.10)',  label: 'Revert'   },
};

const REVERTABLE = new Set(['edit', 'tick', 'untick']);

function formatLocal(s: string): { date: string; time: string } {
  // "2026-05-15 14:35:22.123456+08" or similar
  const [d, rest] = s.split(' ');
  const t = (rest || '').split('.')[0]; // strip microseconds
  return { date: d || s, time: t || '' };
}

const th = { padding:'10px 14px', textAlign:'left' as const, fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase' as const, whiteSpace:'nowrap' as const, letterSpacing:0.5 };
const td = { padding:'10px 14px', fontSize:12 };
const inputStyle = { fontSize:13, border:'1px solid var(--border)', borderRadius:8, padding:'6px 12px', background:'var(--bg)', color:'var(--text)', outline:'none' };

export default function HistoryPanel() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<string[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [filters, setFilters] = useState({ branch: 'All', action: '', search: '', date_from: '', date_to: '' });

  const [viewing, setViewing] = useState<LogRow | null>(null);
  const [editingNote, setEditingNote] = useState<LogRow | null>(null);
  const [deleting, setDeleting]   = useState<LogRow | null>(null);
  const [reverting, setReverting] = useState<LogRow | null>(null);
  const [busy, setBusy] = useState(false);

  const user = getUser();
  const isSuperAdmin = user?.role === 'super_admin';

  const load = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.branch && filters.branch !== 'All') params.set('branch', filters.branch);
      if (filters.action) params.set('action', filters.action);
      if (filters.search) params.set('search', filters.search);
      if (filters.date_from) params.set('date_from', filters.date_from);
      if (filters.date_to)   params.set('date_to',   filters.date_to);
      params.set('page', String(p));
      params.set('limit', '50');
      const res: ListResponse = await apiFetch(`/api/student-change-log?${params.toString()}`);
      setRows(res.records || []);
      setTotal(res.total || 0);
      setTotalPages(res.totalPages || 1);
      setBranches(res.branches || []);
      setActions(res.actions || []);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[history] load failed', err);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => { setPage(1); load(1); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filters.branch, filters.action, filters.search, filters.date_from, filters.date_to]);
  useEffect(() => { load(page); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [page]);

  async function saveNote() {
    if (!editingNote) return;
    setBusy(true);
    try {
      await apiFetch(`/api/student-change-log/${editingNote.id}`, { method: 'PUT', body: { note: editingNote.note || '' } });
      setEditingNote(null);
      load(page);
    } catch (err: any) {
      alert(err?.data?.error || err?.message || 'Failed to save note');
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await apiFetch(`/api/student-change-log/${deleting.id}`, { method: 'DELETE' });
      setDeleting(null);
      load(page);
    } catch (err: any) {
      alert(err?.data?.error || err?.message || 'Failed to delete');
    } finally {
      setBusy(false);
    }
  }

  async function confirmRevert() {
    if (!reverting) return;
    setBusy(true);
    try {
      await apiFetch(`/api/student-change-log/${reverting.id}/revert`, { method: 'POST' });
      setReverting(null);
      load(page);
    } catch (err: any) {
      alert(err?.data?.error || err?.message || 'Failed to revert');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {/* Filters */}
      <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 16px', marginBottom:14, display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
        <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>Branch:</span>
        <select value={filters.branch} onChange={e => setFilters(f => ({ ...f, branch: e.target.value }))} style={inputStyle}>
          <option value="All">All Branches</option>
          {[...new Set([...BRANCHES, ...branches])].sort().map(b => <option key={b} value={b}>{b}</option>)}
        </select>

        <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>Action:</span>
        <select value={filters.action} onChange={e => setFilters(f => ({ ...f, action: e.target.value }))} style={inputStyle}>
          <option value="">All Actions</option>
          {actions.map(a => <option key={a} value={a}>{ACTION_COLORS[a]?.label || a}</option>)}
        </select>

        <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>From:</span>
        <input type="date" value={filters.date_from} onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))} style={inputStyle} title="Start of date range" />
        <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>To:</span>
        <input type="date" value={filters.date_to}   onChange={e => setFilters(f => ({ ...f, date_to:   e.target.value }))} style={inputStyle} title="End of date range" />

        <input
          type="text"
          placeholder="Search student name…"
          value={filters.search}
          onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
          style={{ ...inputStyle, flex:1, minWidth:180 }}
        />

        {(filters.branch !== 'All' || filters.action || filters.date_from || filters.date_to || filters.search) && (
          <button onClick={() => setFilters({ branch: 'All', action: '', search: '', date_from: '', date_to: '' })}
            style={{ fontSize:12, padding:'6px 12px', borderRadius:8, border:'1px solid var(--border)', background:'transparent', color:'var(--muted)', cursor:'pointer' }}>
            Clear
          </button>
        )}

        <span style={{ fontSize:13, color:'var(--muted)', fontWeight:500, marginLeft:'auto' }}>
          {loading ? 'Loading…' : `${total} entr${total === 1 ? 'y' : 'ies'}`}
        </span>
      </div>

      {/* Table */}
      <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ minWidth:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'var(--bg)', borderBottom:'1px solid var(--border)' }}>
                {['Date','Time','Branch','Student','Action','Field','Change','User','Note','Actions'].map(h => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} style={{ ...td, textAlign:'center', padding:'48px 16px', color:'var(--muted)' }}>Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={10} style={{ ...td, textAlign:'center', padding:'48px 16px', color:'var(--muted)' }}>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
                    <span style={{ fontSize:36 }}>📋</span>
                    <p style={{ fontWeight:600, color:'var(--text)', margin:0 }}>No history entries</p>
                    <p style={{ fontSize:12, margin:0 }}>Try clearing filters or wait for edits to be made</p>
                  </div>
                </td></tr>
              ) : rows.map(row => {
                const { date, time } = formatLocal(row.changed_at_local);
                const colors = ACTION_COLORS[row.action] || { fg: '#64748b', bg: 'rgba(100,116,139,0.10)', label: row.action };
                return (
                  <tr key={row.id} style={{ borderTop:'1px solid var(--border)' }}>
                    <td style={{ ...td, color:'var(--muted)', whiteSpace:'nowrap' }}>{date}</td>
                    <td style={{ ...td, color:'var(--muted)', whiteSpace:'nowrap', fontFamily:'monospace' }}>{time}</td>
                    <td style={td}><span style={{ fontSize:11, padding:'2px 8px', borderRadius:6, fontWeight:600, background:'rgba(99,102,241,0.1)', color:'#6366f1' }}>{row.branch}</span></td>
                    <td style={{ ...td, fontWeight:600, color:'var(--text)', whiteSpace:'nowrap' }}>{row.student_name}</td>
                    <td style={td}><span style={{ fontSize:11, padding:'2px 8px', borderRadius:6, fontWeight:700, background:colors.bg, color:colors.fg }}>{colors.label}</span></td>
                    <td style={{ ...td, color:'var(--text)', whiteSpace:'nowrap' }}>{row.field || '—'}</td>
                    <td style={td}>
                      {row.action === 'tick' || row.action === 'untick' ? (
                        <span style={{ color:'var(--muted)' }}>—</span>
                      ) : row.old_value || row.new_value ? (
                        <span style={{ fontSize:11, color:'var(--text)' }}>
                          <span style={{ color:'#dc2626' }}>{row.old_value || '—'}</span>
                          {' → '}
                          <span style={{ color:'#16a34a' }}>{row.new_value || '—'}</span>
                        </span>
                      ) : (
                        <span style={{ color:'var(--muted)' }}>—</span>
                      )}
                    </td>
                    <td style={{ ...td, fontSize:11, color:'var(--muted)' }}>{row.user_email}</td>
                    <td style={{ ...td, fontSize:11, color: row.note ? 'var(--text)' : 'var(--muted)', fontStyle: row.note ? 'normal' : 'italic', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{row.note || '—'}</td>
                    <td style={td}>
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                        <button onClick={() => setViewing(row)} style={{ fontSize:11, padding:'4px 10px', borderRadius:6, border:'1px solid #2563eb', background:'rgba(59,130,246,0.08)', color:'#2563eb', cursor:'pointer', fontWeight:600 }}>View</button>
                        {REVERTABLE.has(row.action) && (
                          <button onClick={() => setReverting(row)} title="Undo this change" style={{ fontSize:11, padding:'4px 10px', borderRadius:6, border:'1px solid #7c3aed', background:'rgba(124,58,237,0.08)', color:'#7c3aed', cursor:'pointer', fontWeight:600 }}>↩ Revert</button>
                        )}
                        {isSuperAdmin && (
                          <>
                            <button onClick={() => setEditingNote({ ...row, note: row.note || '' })} style={{ fontSize:11, padding:'4px 10px', borderRadius:6, border:'1px solid #d97706', background:'rgba(245,158,11,0.08)', color:'#d97706', cursor:'pointer', fontWeight:600 }}>Edit</button>
                            <button onClick={() => setDeleting(row)} style={{ fontSize:11, padding:'4px 10px', borderRadius:6, border:'1px solid #dc2626', background:'rgba(220,38,38,0.08)', color:'#dc2626', cursor:'pointer', fontWeight:600 }}>Del</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderTop:'1px solid var(--border)', fontSize:13 }}>
            <span style={{ color:'var(--muted)' }}>Page {page} of {totalPages}</span>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                style={{ fontSize:12, padding:'6px 12px', borderRadius:6, border:'1px solid var(--border)', background:'transparent', color: page <= 1 ? 'var(--muted)' : 'var(--text)', cursor: page <= 1 ? 'not-allowed' : 'pointer' }}>← Prev</button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                style={{ fontSize:12, padding:'6px 12px', borderRadius:6, border:'1px solid var(--border)', background:'transparent', color: page >= totalPages ? 'var(--muted)' : 'var(--text)', cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}>Next →</button>
            </div>
          </div>
        )}
      </div>

      {/* View modal */}
      {viewing && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:60, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'var(--panel)', borderRadius:14, boxShadow:'0 25px 50px rgba(0,0,0,0.25)', width:'100%', maxWidth:520, padding:24 }}>
            <h2 style={{ fontSize:18, fontWeight:700, color:'var(--text)', margin:'0 0 16px' }}>Change Details</h2>
            <div style={{ display:'grid', gridTemplateColumns:'120px 1fr', gap:'10px 16px', fontSize:13 }}>
              <div style={{ color:'var(--muted)' }}>When:</div><div>{viewing.changed_at_local}</div>
              <div style={{ color:'var(--muted)' }}>Branch:</div><div>{viewing.branch}</div>
              <div style={{ color:'var(--muted)' }}>Student:</div><div><strong>{viewing.student_name}</strong></div>
              <div style={{ color:'var(--muted)' }}>Action:</div><div>{ACTION_COLORS[viewing.action]?.label || viewing.action}</div>
              <div style={{ color:'var(--muted)' }}>Field:</div><div>{viewing.field || '—'}</div>
              <div style={{ color:'var(--muted)' }}>Old value:</div><div style={{ color:'#dc2626' }}>{viewing.old_value ?? '—'}</div>
              <div style={{ color:'var(--muted)' }}>New value:</div><div style={{ color:'#16a34a' }}>{viewing.new_value ?? '—'}</div>
              <div style={{ color:'var(--muted)' }}>User:</div><div>{viewing.user_email}</div>
              <div style={{ color:'var(--muted)' }}>Note:</div><div style={{ fontStyle: viewing.note ? 'normal' : 'italic', color: viewing.note ? 'var(--text)' : 'var(--muted)' }}>{viewing.note || '—'}</div>
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', marginTop:20 }}>
              <button onClick={() => setViewing(null)} style={{ fontSize:13, padding:'8px 20px', borderRadius:8, border:'none', background:'#4f46e5', color:'#fff', cursor:'pointer', fontWeight:600 }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit-note modal */}
      {editingNote && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:60, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'var(--panel)', borderRadius:14, boxShadow:'0 25px 50px rgba(0,0,0,0.25)', width:'100%', maxWidth:480, padding:24 }}>
            <h2 style={{ fontSize:18, fontWeight:700, color:'var(--text)', margin:'0 0 16px' }}>Add / edit note</h2>
            <p style={{ fontSize:12, color:'var(--muted)', margin:'0 0 12px' }}>Annotate this log entry. The change itself cannot be edited (audit integrity).</p>
            <textarea
              value={editingNote.note || ''}
              onChange={e => setEditingNote(prev => prev ? { ...prev, note: e.target.value } : prev)}
              maxLength={1000}
              rows={4}
              placeholder="e.g. Reverted by branch manager because student name was misspelt"
              style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg)', color:'var(--text)', fontSize:13, outline:'none', resize:'vertical', boxSizing:'border-box' }}
            />
            <div style={{ display:'flex', justifyContent:'flex-end', gap:12, marginTop:16 }}>
              <button onClick={() => setEditingNote(null)} disabled={busy} style={{ fontSize:13, padding:'8px 18px', borderRadius:8, border:'1px solid var(--border)', background:'transparent', color:'var(--text)', cursor: busy ? 'not-allowed' : 'pointer' }}>Cancel</button>
              <button onClick={saveNote} disabled={busy} style={{ fontSize:13, padding:'8px 22px', borderRadius:8, border:'none', background:'#4f46e5', color:'#fff', cursor: busy ? 'not-allowed' : 'pointer', fontWeight:700 }}>{busy ? 'Saving…' : 'Save Note'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Revert confirm modal */}
      {reverting && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:60, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'var(--panel)', borderRadius:14, boxShadow:'0 25px 50px rgba(0,0,0,0.25)', width:'100%', maxWidth:480, padding:24 }}>
            <h2 style={{ fontSize:18, fontWeight:700, color:'#7c3aed', margin:'0 0 12px' }}>↩ Revert this change?</h2>
            <p style={{ fontSize:13, color:'var(--text)', margin:'0 0 12px' }}>This will undo the change to the student record. A new history entry will be created to record the revert.</p>
            <div style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:12 }}>
              <div style={{ marginBottom:4 }}><strong>Student:</strong> {reverting.student_name}</div>
              <div style={{ marginBottom:4 }}><strong>Action:</strong> {ACTION_COLORS[reverting.action]?.label || reverting.action} {reverting.field && <span style={{ color:'var(--muted)' }}>({reverting.field})</span>}</div>
              {(reverting.action === 'edit') && (
                <div><strong>Will restore:</strong> <span style={{ color:'#16a34a' }}>{reverting.old_value || '(blank)'}</span> ← was changed from this</div>
              )}
              {(reverting.action === 'tick' || reverting.action === 'untick') && (
                <div><strong>Will:</strong> {reverting.action === 'tick' ? 'Untick' : 'Re-tick'} this box</div>
              )}
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:12 }}>
              <button onClick={() => setReverting(null)} disabled={busy} style={{ fontSize:13, padding:'8px 18px', borderRadius:8, border:'1px solid var(--border)', background:'transparent', color:'var(--text)', cursor: busy ? 'not-allowed' : 'pointer' }}>Cancel</button>
              <button onClick={confirmRevert} disabled={busy} style={{ fontSize:13, padding:'8px 22px', borderRadius:8, border:'none', background:'#7c3aed', color:'#fff', cursor: busy ? 'not-allowed' : 'pointer', fontWeight:700 }}>{busy ? 'Reverting…' : '↩ Yes, revert'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {deleting && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:60, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'var(--panel)', borderRadius:14, boxShadow:'0 25px 50px rgba(0,0,0,0.25)', width:'100%', maxWidth:440, padding:24 }}>
            <h2 style={{ fontSize:18, fontWeight:700, color:'#dc2626', margin:'0 0 12px' }}>⚠️ Delete history entry?</h2>
            <p style={{ fontSize:13, color:'var(--text)', margin:'0 0 8px' }}>This will permanently remove this audit log row.</p>
            <p style={{ fontSize:12, color:'var(--muted)', margin:'0 0 4px' }}><strong>Student:</strong> {deleting.student_name}</p>
            <p style={{ fontSize:12, color:'var(--muted)', margin:'0 0 4px' }}><strong>Action:</strong> {ACTION_COLORS[deleting.action]?.label || deleting.action} {deleting.field && `(${deleting.field})`}</p>
            <p style={{ fontSize:12, color:'var(--muted)', margin:'0 0 16px' }}><strong>When:</strong> {deleting.changed_at_local}</p>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:12 }}>
              <button onClick={() => setDeleting(null)} disabled={busy} style={{ fontSize:13, padding:'8px 18px', borderRadius:8, border:'1px solid var(--border)', background:'transparent', color:'var(--text)', cursor: busy ? 'not-allowed' : 'pointer' }}>Cancel</button>
              <button onClick={confirmDelete} disabled={busy} style={{ fontSize:13, padding:'8px 22px', borderRadius:8, border:'none', background:'#dc2626', color:'#fff', cursor: busy ? 'not-allowed' : 'pointer', fontWeight:700 }}>{busy ? 'Deleting…' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
