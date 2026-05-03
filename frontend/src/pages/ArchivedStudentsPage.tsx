import { useState, useCallback, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { BackButton } from '../components/BackButton';
import { BRANCHES } from '../lib/studentTypes';
import AddArchivedStudentModal from '../components/StudentDB/AddArchivedStudentModal';
import { apiFetch } from '../lib/api';

const SORTED_BRANCHES = [...BRANCHES].sort();
const th = { padding:'10px 14px', textAlign:'left' as const, fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase' as const, whiteSpace:'nowrap' as const, letterSpacing:0.5 };
const td = { padding:'10px 14px', fontSize:12 };
const inp = { fontSize:13, border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', background:'var(--bg)', color:'var(--text)', outline:'none', width:'100%', boxSizing:'border-box' as const };

function EditArchivedModal({ student, onClose, onSave }: { student: any; onClose: () => void; onSave: (s: any) => void }) {
  const [form, setForm] = useState({ ...student });
  const [saving, setSaving] = useState(false);
  const set = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));
  const labelStyle = { fontSize:12, fontWeight:600 as const, color:'var(--muted)' as const, textTransform:'uppercase' as const, letterSpacing:0.5, marginBottom:4, display:'block' as const };
  const fieldWrap = { display:'flex', flexDirection:'column' as const, gap:4 };

  async function handleSave() {
    setSaving(true);
    await onSave(form);
    setSaving(false);
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'var(--panel)', borderRadius:16, boxShadow:'0 25px 50px rgba(0,0,0,0.25)', width:'100%', maxWidth:700, maxHeight:'90vh', display:'flex', flexDirection:'column' }}>
        <div style={{ padding:'16px 24px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <h2 style={{ fontSize:17, fontWeight:700, color:'var(--text)', margin:0 }}>Edit Archived Student</h2>
            <p style={{ fontSize:11, color:'var(--muted)', margin:'2px 0 0' }}>{form.name}</p>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:22, color:'var(--muted)', cursor:'pointer' }}>&times;</button>
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:24, display:'flex', flexDirection:'column', gap:16 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            <div style={fieldWrap}>
              <label style={labelStyle}>Student ID</label>
              <input type="text" value={form.studentId||''} onChange={e => set('studentId', e.target.value)} style={inp} />
            </div>
            <div style={fieldWrap}>
              <label style={labelStyle}>Name</label>
              <input type="text" value={form.name||''} onChange={e => set('name', e.target.value)} style={inp} />
            </div>
            <div style={fieldWrap}>
              <label style={labelStyle}>Gender</label>
              <select value={form.gender||'Male'} onChange={e => set('gender', e.target.value)} style={{ ...inp, cursor:'pointer' }}>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
            <div style={fieldWrap}>
              <label style={labelStyle}>Branch</label>
              <select value={form.branch||'ONL'} onChange={e => set('branch', e.target.value)} style={{ ...inp, cursor:'pointer' }}>
                {SORTED_BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div style={fieldWrap}>
              <label style={labelStyle}>Enrollment Date</label>
              <input type="date" value={form.enrollmentDate||''} onChange={e => set('enrollmentDate', e.target.value)} style={inp} />
            </div>
            <div style={fieldWrap}>
              <label style={labelStyle}>Date of Birth</label>
              <input type="date" value={form.dateOfBirth||''} onChange={e => set('dateOfBirth', e.target.value)} style={inp} />
            </div>
            <div style={fieldWrap}>
              <label style={labelStyle}>Created On</label>
              <input type="date" value={form.createdOn||''} onChange={e => set('createdOn', e.target.value)} style={inp} />
            </div>
            <div style={fieldWrap}>
              <label style={labelStyle}>Archived On</label>
              <input type="date" value={form.archivedOn||''} onChange={e => set('archivedOn', e.target.value)} style={inp} />
            </div>
            <div style={{ ...fieldWrap, gridColumn:'1 / -1' }}>
              <label style={labelStyle}>Guardian Name</label>
              <input type="text" value={form.guardianName||''} onChange={e => set('guardianName', e.target.value)} style={inp} />
            </div>
            <div style={fieldWrap}>
              <label style={labelStyle}>Guardian Mobile</label>
              <input type="tel" value={form.guardianMobile||''} onChange={e => set('guardianMobile', e.target.value)} style={inp} />
            </div>
            <div style={fieldWrap}>
              <label style={labelStyle}>Guardian Email</label>
              <input type="email" value={form.guardianEmail||''} onChange={e => set('guardianEmail', e.target.value)} style={inp} />
            </div>
          </div>
        </div>
        <div style={{ padding:'14px 24px', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'flex-end', gap:12 }}>
          <button onClick={onClose} style={{ fontSize:13, padding:'9px 20px', borderRadius:8, border:'1px solid var(--border)', background:'transparent', color:'var(--text)', cursor:'pointer' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ fontSize:13, padding:'9px 28px', borderRadius:8, border:'none', background:'#2563eb', color:'#fff', cursor:'pointer', fontWeight:700, opacity:saving?0.6:1 }}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ArchivedStudentsPage() {
  const [students, setStudents] = useState<any[]>([]);
  const [branch, setBranch] = useState('All');
  const [search, setSearch] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [confirm, setConfirm] = useState<any>(null);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [deleteAllBranch, setDeleteAllBranch] = useState('All');
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [editStudent, setEditStudent] = useState<any>(null);

  const filtered = students.filter(s => {
    const branchOk = branch === 'All' || s.branch === branch;
    const searchOk = !search || s.name.toLowerCase().includes(search.toLowerCase());
    return branchOk && searchOk;
  });

  function flash(text: string, ms = 4000) {
    setMsg(text);
    setTimeout(() => setMsg(''), ms);
  }

  async function loadStudents() {
    try {
      const r = await apiFetch('/api/archived-students');
      setStudents(r.data || []);
    } catch (err: any) {
      flash('❌ Failed to load: ' + (err?.data?.error || err?.message || 'server error'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadStudents(); }, []);

  const handleImport = useCallback(async (incoming: any[]) => {
    try {
      await apiFetch('/api/archived-students/import', { method: 'POST', body: { students: incoming } });
      await loadStudents();
      flash(`✅ Imported ${incoming.length} student${incoming.length !== 1 ? 's' : ''} successfully.`);
    } catch (err: any) {
      flash('❌ Import failed: ' + (err?.data?.error || err?.message || 'server error'));
    }
    setShowImport(false);
  }, []);

  async function handleDelete(student: any) {
    try {
      await apiFetch(`/api/archived-students/${encodeURIComponent(student.studentId)}`, { method: 'DELETE' });
      setStudents(prev => prev.filter(s => s.studentId !== student.studentId));
      flash('✅ Student permanently deleted.');
    } catch (err: any) {
      flash('❌ Delete failed: ' + (err?.data?.error || err?.message || 'server error'));
    }
    setConfirm(null);
  }

  async function handleRestore(student: any) {
    if (student?.no === undefined || student?.no === null) {
      flash('❌ Restore failed: missing archive id (please reload the page).');
      setConfirm(null);
      return;
    }
    try {
      await apiFetch(`/api/archived-students/${student.no}/restore`, { method: 'POST' });
      setStudents(prev => prev.filter(s => s.no !== student.no));
      flash('✅ Student restored to Student Database.');
    } catch (err: any) {
      flash('❌ Restore failed: ' + (err?.data?.error || err?.message || 'server error'));
    }
    setConfirm(null);
  }

  async function handleEdit(updated: any) {
    try {
      await apiFetch(`/api/archived-students/${encodeURIComponent(updated.studentId)}`, { method: 'PUT', body: updated });
      setStudents(prev => prev.map(s => s.studentId === updated.studentId ? { ...s, ...updated } : s));
      flash('✅ Student updated successfully.');
    } catch (err: any) {
      flash('❌ Update failed: ' + (err?.data?.error || err?.message || 'server error'));
    }
    setEditStudent(null);
  }

  async function handleDeleteAll() {
    try {
      const url = deleteAllBranch && deleteAllBranch !== 'All'
        ? `/api/archived-students?branch=${encodeURIComponent(deleteAllBranch)}`
        : '/api/archived-students';
      await apiFetch(url, { method: 'DELETE' });
      if (deleteAllBranch && deleteAllBranch !== 'All') {
        setStudents(prev => prev.filter((s: any) => s.branch !== deleteAllBranch));
        flash(`✅ All ${deleteAllBranch} archived records permanently deleted.`);
      } else {
        setStudents([]);
        flash('✅ All archived records permanently deleted.');
      }
    } catch (err: any) {
      flash('❌ Delete all failed: ' + (err?.data?.error || err?.message || 'server error'));
    }
    setShowDeleteAll(false);
  }

  function exportToExcel() {
    const data = filtered.map((s, i) => ({
      'No.': i + 1, 'Student ID': s.studentId, 'Name': s.name, 'Gender': s.gender,
      'Branch': s.branch, 'Enrollment Date': s.enrollmentDate, 'Date of Birth': s.dateOfBirth,
      'Created On': s.createdOn, 'Archived On': s.archivedOn,
      'Guardian Name': s.guardianName, 'Guardian Mobile': s.guardianMobile, 'Guardian Email': s.guardianEmail,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Archived Students');
    XLSX.writeFile(wb, `archived-students-${branch.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const summaryCards = [
    { label: 'Total Archived', value: students.length,                                    color: '#4f46e5' },
    { label: 'Male',           value: students.filter(s => s.gender === 'Male').length,   color: '#2563eb' },
    { label: 'Female',         value: students.filter(s => s.gender === 'Female').length, color: '#db2777' },
    { label: 'Branches',       value: new Set(students.map(s => s.branch)).size,          color: '#7c3aed' },
  ];

  return (
    <div className="dashboardPage">
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <BackButton to="/student-database" label="Back to Student Records" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 900, color: 'var(--text)', margin: 0, letterSpacing: -0.5 }}>🗂 Archived Students</h1>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0' }}>
              {loading ? 'Loading…' : `${filtered.length} record${filtered.length !== 1 ? 's' : ''} found`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={exportToExcel} disabled={filtered.length === 0} style={{ fontSize: 13, padding: '8px 16px', borderRadius: 8, border: 'none', background: '#10b981', color: '#fff', cursor: 'pointer', fontWeight: 600, opacity: filtered.length ? 1 : 0.4 }}>⬇ Export</button>
            <button onClick={() => { setDeleteAllBranch(branch); setShowDeleteAll(true); }} disabled={students.length === 0} style={{ fontSize: 13, padding: '8px 16px', borderRadius: 8, border: '1.5px solid #dc2626', background: 'transparent', color: '#dc2626', cursor: 'pointer', fontWeight: 600, opacity: students.length ? 1 : 0.4 }}>🗑 Delete All</button>
            <button onClick={() => setShowImport(true)} style={{ fontSize: 13, padding: '8px 20px', borderRadius: 8, border: 'none', background: '#4f46e5', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>+ Add Archived Students</button>
          </div>
        </div>
      </div>

      {/* Flash message */}
      {msg && (
        <div style={{ marginBottom: 12, padding: '10px 16px', borderRadius: 8, background: msg.startsWith('✅') ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${msg.startsWith('✅') ? '#10b981' : '#ef4444'}`, fontSize: 13, color: msg.startsWith('✅') ? '#059669' : '#dc2626', fontWeight: 600 }}>
          {msg}
        </div>
      )}

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: 12, marginBottom: 16 }}>
        {summaryCards.map(c => (
          <div key={c.label} style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', boxShadow: 'var(--shadow-sm)' }}>
            <p style={{ fontSize: 24, fontWeight: 800, color: c.color, margin: '0 0 4px' }}>{loading ? '—' : c.value}</p>
            <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>{c.label}</p>
          </div>
        ))}
      </div>

      {/* Filters: branch + search */}
      <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>Branch</span>
        <select value={branch} onChange={e => setBranch(e.target.value)} style={{ fontSize: 13, border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', background: 'var(--bg)', color: 'var(--text)', outline: 'none' }}>
          <option value="All">All Branches</option>
          {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        {branch !== 'All' && (
          <button onClick={() => setBranch('All')} style={{ fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>Clear</button>
        )}
        <div style={{ marginLeft: 'auto', position: 'relative', display: 'flex', alignItems: 'center' }}>
          <span style={{ position: 'absolute', left: 10, fontSize: 14, color: 'var(--muted)', pointerEvents: 'none' }}>🔍</span>
          <input
            type="text"
            placeholder="Search by name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ fontSize: 13, border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px 6px 32px', background: 'var(--bg)', color: 'var(--text)', outline: 'none', width: 200 }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, background: 'none', border: 'none', fontSize: 14, color: 'var(--muted)', cursor: 'pointer', lineHeight: 1 }}>×</button>
          )}
        </div>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ minWidth: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                {['No.','Student ID','Name','Gender','Branch','Enrollment Date','Date of Birth','Created On','Archived On','Guardian Name','Guardian Mobile','Guardian Email','Actions'].map(h => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={13} style={{ ...td, textAlign: 'center', padding: 48, color: 'var(--muted)' }}>Loading archived students…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={13} style={{ ...td, textAlign: 'center', padding: 48, color: 'var(--muted)' }}>
                  {search || branch !== 'All' ? `No results for "${search}"${branch !== 'All' ? ` in ${branch}` : ''}.` : 'No archived students yet. '}
                  {!search && branch === 'All' && <button onClick={() => setShowImport(true)} style={{ color: '#4f46e5', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontSize: 12 }}>Import from Excel</button>}
                </td></tr>
              ) : filtered.map((s, i) => (
                <tr key={s.studentId || i} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ ...td, color: 'var(--muted)' }}>{i + 1}</td>
                  <td style={{ ...td, color: 'var(--muted)', fontFamily: 'monospace' }}>{s.studentId || '—'}</td>
                  <td style={{ ...td, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>{s.name}</td>
                  <td style={td}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 600, background: s.gender === 'Male' ? 'rgba(37,99,235,0.12)' : 'rgba(219,39,119,0.12)', color: s.gender === 'Male' ? '#2563eb' : '#db2777' }}>{s.gender}</span>
                  </td>
                  <td style={td}><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 600, background: 'rgba(99,102,241,0.12)', color: '#6366f1' }}>{s.branch}</span></td>
                  <td style={{ ...td, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{s.enrollmentDate || '—'}</td>
                  <td style={{ ...td, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{s.dateOfBirth || '—'}</td>
                  <td style={{ ...td, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{s.createdOn || '—'}</td>
                  <td style={td}><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 600, background: 'rgba(245,158,11,0.12)', color: '#d97706', whiteSpace: 'nowrap' }}>{s.archivedOn || '—'}</span></td>
                  <td style={{ ...td, color: 'var(--text)', whiteSpace: 'nowrap' }}>{s.guardianName || '—'}</td>
                  <td style={{ ...td, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{s.guardianMobile || '—'}</td>
                  <td style={{ ...td, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{s.guardianEmail || '—'}</td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => setEditStudent(s)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: 'none', background: 'rgba(37,99,235,0.12)', color: '#2563eb', cursor: 'pointer', fontWeight: 600 }}>Edit</button>
                      <button onClick={() => setConfirm({ type: 'restore', student: s })} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: 'none', background: 'rgba(34,197,94,0.12)', color: '#16a34a', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>Restore</button>
                      <button onClick={() => setConfirm({ type: 'delete', student: s })} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: 'none', background: 'rgba(239,68,68,0.1)', color: '#dc2626', cursor: 'pointer', fontWeight: 600 }}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showImport && <AddArchivedStudentModal onClose={() => setShowImport(false)} onImport={handleImport} />}

      {/* Edit modal */}
      {editStudent && <EditArchivedModal student={editStudent} onClose={() => setEditStudent(null)} onSave={handleEdit} />}

      {/* Single student confirm modal */}
      {confirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--panel)', borderRadius: 16, boxShadow: '0 25px 50px rgba(0,0,0,0.25)', width: '100%', maxWidth: 400, padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: '0 0 8px' }}>
              {confirm.type === 'restore' ? 'Restore Student' : 'Permanently Delete'}
            </h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 20px' }}>
              {confirm.type === 'restore'
                ? <><strong style={{ color: 'var(--text)' }}>{confirm.student.name}</strong> will be removed from the archive.</>
                : <>Permanently delete <strong style={{ color: 'var(--text)' }}>{confirm.student.name}</strong>? This cannot be undone.</>}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button onClick={() => setConfirm(null)} style={{ fontSize: 13, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }}>Cancel</button>
              {confirm.type === 'restore'
                ? <button onClick={() => handleRestore(confirm.student)} style={{ fontSize: 13, background: '#16a34a', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Restore</button>
                : <button onClick={() => handleDelete(confirm.student)} style={{ fontSize: 13, background: '#dc2626', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Delete</button>}
            </div>
          </div>
        </div>
      )}

      {/* Delete All confirmation modal */}
      {showDeleteAll && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--panel)', borderRadius: 16, boxShadow: '0 25px 50px rgba(0,0,0,0.3)', width: '100%', maxWidth: 460, padding: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 28 }}>⚠️</span>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: '#dc2626', margin: 0 }}>Delete Archived Records</h3>
            </div>

            {/* Branch selector */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
                Select Branch to Clear
              </label>
              <select
                value={deleteAllBranch}
                onChange={e => setDeleteAllBranch(e.target.value)}
                style={{ width: '100%', fontSize: 13, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', cursor: 'pointer' }}
              >
                <option value="All">All Branches</option>
                {[...BRANCHES].sort().map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>

            {/* Dynamic warning */}
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 20px', lineHeight: 1.6, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,38,0.2)', borderRadius: 8, padding: '10px 14px' }}>
              Are you sure you want to permanently delete{' '}
              <strong style={{ color: '#dc2626' }}>
                {deleteAllBranch === 'All' ? `all ${students.length} archived records` : `all archived students in ${deleteAllBranch}`}
              </strong>?{' '}
              This action <strong>cannot be undone.</strong>
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button onClick={() => setShowDeleteAll(false)} style={{ fontSize: 13, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', padding: '8px 20px', borderRadius: 8, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleDeleteAll} style={{ fontSize: 13, background: '#dc2626', color: '#fff', border: 'none', padding: '8px 24px', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>Yes, Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
