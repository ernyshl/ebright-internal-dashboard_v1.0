import { useState, useCallback, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { useNavigate } from 'react-router-dom';
import { BackButton } from '../components/BackButton';
import { BRANCHES } from '../lib/studentTypes';
import { getFaCount, getPcmCount, getWorkbookCount, reconcileFa, faSummary } from '../lib/studentFaLogic';
import { getAgeGroup, getAgeGroupColor } from '../lib/ageGroup';
import { useAcademy } from '../context/AcademyContext';
import { apiFetch } from '../lib/api';
import AddStudentModal from '../components/StudentDB/AddStudentModal';
import EditStudentModal from '../components/StudentDB/EditStudentModal';
import DeleteConfirmModal from '../components/StudentDB/DeleteConfirmModal';
import ArchiveConfirmModal from '../components/StudentDB/ArchiveConfirmModal';
import HistoryPanel from '../components/StudentDB/HistoryPanel';

function toIsoDate(val: string): string {
  if (!val) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  return ''; // Don't guess year for non-ISO dates — backend COALESCE keeps existing
}

function sanitizeForPut(s: any) {
  return { ...s, enrollmentDate: toIsoDate(s.enrollmentDate), dob: toIsoDate(s.dob) };
}

const th = { padding:'10px 14px', textAlign:'left' as const, fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase' as const, whiteSpace:'nowrap' as const, letterSpacing:0.5 };
const td = { padding:'10px 14px', fontSize:12 };

const PAGE_SIZE = 50;

export function StudentDatabasePage() {
  const navigate = useNavigate();
  const { dbStudents: students, setDbStudents: setStudents, sharedBranch, setSharedBranch } = useAcademy();
  const [branchFilter, setBranchFilter] = useState(sharedBranch);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editStudent, setEditStudent] = useState<any>(null);
  const [deleteStudent, setDeleteStudent] = useState<any>(null);
  const [archiveStudent, setArchiveStudent] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [deleteAllLoading, setDeleteAllLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'students' | 'history'>('students');
  const [deleteAllBranch, setDeleteAllBranch] = useState('All');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  // Load from DB on mount
  useEffect(() => {
    setLoading(true);
    setApiError('');
    apiFetch('/api/student-records')
      .then(res => { if (res.data) setStudents(res.data); })
      .catch((err) => { setApiError(err?.message || 'Failed to load students'); })
      .finally(() => setLoading(false));
  }, []);

  // Reset to page 1 when filter/search changes so user doesn't land on an empty later page
  useEffect(() => { setCurrentPage(1); }, [branchFilter, searchQuery]);

  function handleBranchChange(branch: string) {
    setBranchFilter(branch);
    setSharedBranch(branch);
  }

  const branchFiltered = branchFilter === 'All' ? students : students.filter(s => s.branch === branchFilter);
  const activeFiltered = branchFiltered.filter(s => s.status === 'Active');

  const q = searchQuery.trim().toLowerCase();
  const displayed = q ? branchFiltered.filter(s => s.name.toLowerCase().includes(q)) : branchFiltered;

  const totalPages = Math.max(1, Math.ceil(displayed.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageEnd = Math.min(pageStart + PAGE_SIZE, displayed.length);
  const paginated = displayed.slice(pageStart, pageEnd);

  // FA stats computed from branch-filtered active students (not search-filtered)
  const faDue     = activeFiltered.reduce((acc, s) => acc + s.faAttended.length, 0);
  const faInvited = activeFiltered.reduce((acc, s) => acc + s.faAttended.filter(Boolean).length, 0);
  const faBacklog = faDue - faInvited;

  // PCM stats — same logic as FA but using pcmAttended
  const pcmDue     = activeFiltered.reduce((acc, s) => acc + s.pcmAttended.length, 0);
  const pcmInvited = activeFiltered.reduce((acc, s) => acc + s.pcmAttended.filter(Boolean).length, 0);
  const pcmBacklog = pcmDue - pcmInvited;

  // ── Add students (bulk insert) ────────────────────────────────────────────
  const addStudents = useCallback(async (newStudents: any[]) => {
    try {
      const res = await apiFetch('/api/student-records/bulk', { method: 'POST', body: { students: newStudents } });
      if (res.data) setStudents(res.data);
      setSuccessMsg(`✅ ${newStudents.length} student${newStudents.length !== 1 ? 's' : ''} saved successfully.`);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      setSuccessMsg(`❌ Save failed: ${err?.data?.error || err?.message || 'server error'}. Students not saved — please try again.`);
      setTimeout(() => setSuccessMsg(''), 8000);
    }
  }, [setStudents]);

  // ── After smart bulk upload completes — refresh list & show summary ──────
  const handleBulkUploadComplete = useCallback(async (counts: { added: number; restored: number; skipped: number; guardianFilled: number; dobFilled?: number; archived: number }) => {
    try {
      const res = await apiFetch('/api/student-records');
      if (res.data) setStudents(res.data);
    } catch { /* keep local state if refetch fails */ }
    setSuccessMsg(`✅ Upload complete — Added ${counts.added}, Restored ${counts.restored}, Guardian filled ${counts.guardianFilled ?? 0}, DOB filled ${counts.dobFilled ?? 0}, Skipped ${counts.skipped}, Archived ${counts.archived}.`);
    setTimeout(() => setSuccessMsg(''), 7000);
  }, [setStudents]);

  // ── Update student ────────────────────────────────────────────────────────
  const updateStudent = useCallback(async (updated: any) => {
    const reconciled = {
      ...updated,
      faAttended:       reconcileFa(updated.faAttended,       getFaCount(updated.grade, updated.chapter)),
      pcmAttended:      reconcileFa(updated.pcmAttended,      getPcmCount(updated.grade, updated.chapter)),
      workbookAttended: reconcileFa(updated.workbookAttended || [], getWorkbookCount(updated.grade, updated.chapter)),
    };
    try {
      const res = await apiFetch(`/api/student-records/${updated.id}`, { method: 'PUT', body: sanitizeForPut(reconciled) });
      if (res.data) {
        setStudents((prev: any[]) => prev.map(s => s.id === updated.id ? res.data : s));
      }
      setSuccessMsg('✅ Student saved successfully.');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      setStudents((prev: any[]) => prev.map(s => s.id === updated.id ? reconciled : s));
      setSuccessMsg(`❌ Save failed: ${err?.data?.error || err?.message || 'server error'}`);
      setTimeout(() => setSuccessMsg(''), 6000);
    }
    setEditStudent(null);
  }, [setStudents]);

  // ── Delete student ────────────────────────────────────────────────────────
  const deleteStudentById = useCallback(async (id: number) => {
    try {
      await apiFetch(`/api/student-records/${id}`, { method: 'DELETE' });
    } catch { /* continue regardless */ }
    setStudents((prev: any[]) => prev.filter(s => s.id !== id));
    setDeleteStudent(null);
  }, [setStudents]);

  // ── Archive student ───────────────────────────────────────────────────────
  const archiveStudentById = useCallback(async (student: any) => {
    try {
      await apiFetch(`/api/student-records/${student.id}/archive`, { method: 'POST' });
      setStudents((prev: any[]) => prev.filter(s => s.id !== student.id));
      setArchiveStudent(null);
      setSuccessMsg(`📦 ${student.name} archived. Redirecting…`);
      setTimeout(() => navigate('/archived-students'), 800);
    } catch (err: any) {
      setArchiveStudent(null);
      setSuccessMsg(`❌ Archive failed: ${err?.data?.error || err?.message || 'server error'}`);
      setTimeout(() => setSuccessMsg(''), 6000);
    }
  }, [setStudents, navigate]);

  // ── Delete ALL students ───────────────────────────────────────────────────
  const deleteAllStudents = useCallback(async (branch: string) => {
    setDeleteAllLoading(true);
    try {
      const url = branch && branch !== 'All'
        ? `/api/student-records?branch=${encodeURIComponent(branch)}`
        : '/api/student-records';
      await apiFetch(url, { method: 'DELETE' });
      if (branch && branch !== 'All') {
        setStudents((prev: any[]) => prev.filter(s => s.branch !== branch));
      } else {
        setStudents([]);
      }
      setShowDeleteAll(false);
      setSuccessMsg(branch && branch !== 'All' ? `All ${branch} records cleared.` : 'All records cleared successfully.');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch {
      setShowDeleteAll(false);
    } finally {
      setDeleteAllLoading(false);
    }
  }, [setStudents]);

  // ── Toggle FA checkbox (save to DB) ──────────────────────────────────────
  const toggleFa = useCallback((studentId: number, index: number) => {
    setStudents((prev: any[]) => {
      const next = prev.map(s => {
        if (s.id !== studentId) return s;
        const updated = [...s.faAttended];
        updated[index] = !updated[index];
        return { ...s, faAttended: updated };
      });
      const reconciled = next.find(s => s.id === studentId);
      if (reconciled) apiFetch(`/api/student-records/${studentId}`, { method: 'PUT', body: sanitizeForPut(reconciled) }).catch(() => {});
      return next;
    });
  }, [setStudents]);

  // ── Toggle PCM checkbox ───────────────────────────────────────────────────
  const togglePcm = useCallback((studentId: number, index: number) => {
    setStudents((prev: any[]) => {
      const next = prev.map(s => {
        if (s.id !== studentId) return s;
        const updated = [...s.pcmAttended];
        updated[index] = !updated[index];
        return { ...s, pcmAttended: updated };
      });
      const reconciled = next.find(s => s.id === studentId);
      if (reconciled) apiFetch(`/api/student-records/${studentId}`, { method: 'PUT', body: sanitizeForPut(reconciled) }).catch(() => {});
      return next;
    });
  }, [setStudents]);

  // ── Toggle Workbook checkbox ──────────────────────────────────────────────
  const toggleWorkbook = useCallback((studentId: number, index: number) => {
    setStudents((prev: any[]) => {
      const next = prev.map(s => {
        if (s.id !== studentId) return s;
        const arr = Array.isArray(s.workbookAttended) ? [...s.workbookAttended] : [];
        arr[index] = !arr[index];
        return { ...s, workbookAttended: arr };
      });
      const reconciled = next.find(s => s.id === studentId);
      if (reconciled) apiFetch(`/api/student-records/${studentId}`, { method: 'PUT', body: sanitizeForPut(reconciled) }).catch(() => {});
      return next;
    });
  }, [setStudents]);

  function exportToExcel() {
    // Turn a boolean array (e.g. [true, false, true]) into "G1, G3"
    const attendedList = (arr: any) =>
      Array.isArray(arr) && arr.length > 0
        ? arr.map((checked, i) => checked ? `G${i + 1}` : null).filter(Boolean).join(', ')
        : '';
    const totalStr = (arr: any) => {
      if (!Array.isArray(arr) || arr.length === 0) return '0/0';
      return `${arr.filter(Boolean).length}/${arr.length}`;
    };
    const data = displayed.map((s, i) => ({
      'No.':               i + 1,
      'Name':              s.name,
      'Gender':            s.gender,
      'Branch':            s.branch,
      'DOB':               s.dob || '',
      'Age Group':         getAgeGroup(s.dob || ''),
      'Coach Name':        s.coachName || '',
      'Enrollment Date':   s.enrollmentDate,
      'Grade':             s.grade,
      'Chapter':           s.chapter,
      'Status':            s.status,
      'FA Attended':       attendedList(s.faAttended),
      'FA Total':          totalStr(s.faAttended),
      'PCM Attended':      attendedList(s.pcmAttended),
      'PCM Total':         totalStr(s.pcmAttended),
      'Workbook Attended': attendedList(s.workbookAttended),
      'Workbook Total':    totalStr(s.workbookAttended),
      'Guardian Name':     s.guardianName  || '',
      'Guardian Mobile':   s.guardianMobile || '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Student Records');
    XLSX.writeFile(wb, `student-records-${branchFilter.toLowerCase()}-${new Date().toISOString().slice(0,10)}.xlsx`);
  }

  return (
    <div className="dashboardPage">
      {/* Header */}
      <div style={{ marginBottom:24 }}>
        <BackButton to="/" label="Back to Home" />
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:12, flexWrap:'wrap', gap:12 }}>
          <div>
            <h1 style={{ fontSize:28, fontWeight:900, color:'var(--text)', margin:0, letterSpacing:-0.5 }}>📚 Student Database</h1>
            <p style={{ fontSize:13, color:'var(--muted)', margin:'4px 0 0' }}>{students.length} total students</p>
          </div>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
            <button onClick={() => navigate('/archived-students')} style={{ fontSize:13, padding:'8px 16px', borderRadius:8, border:'1px solid var(--border)', background:'var(--panel)', color:'var(--text)', cursor:'pointer', fontWeight:500 }}>🗂 Archived Students</button>
            <button onClick={exportToExcel} disabled={displayed.length===0} style={{ fontSize:13, padding:'8px 16px', borderRadius:8, border:'none', background:'#10b981', color:'#fff', cursor:'pointer', fontWeight:600, opacity:displayed.length?1:0.4 }}>⬇ Export</button>
            <button onClick={() => setShowAdd(true)} style={{ fontSize:13, padding:'8px 20px', borderRadius:8, border:'none', background:'#4f46e5', color:'#fff', cursor:'pointer', fontWeight:600 }}>+ Add Students</button>
            <button onClick={() => { setDeleteAllBranch(branchFilter); setShowDeleteAll(true); }} disabled={students.length===0} style={{ fontSize:13, padding:'8px 16px', borderRadius:8, border:'1px solid #dc2626', background:'rgba(239,68,68,0.08)', color:'#dc2626', cursor:'pointer', fontWeight:600, opacity:students.length?1:0.4 }}>🗑 Delete All</button>
          </div>
        </div>
      </div>

      {apiError && <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:8, padding:'10px 16px', marginBottom:12, fontSize:13, color:'#dc2626' }}>⚠ API Error: {apiError}</div>}

      {/* Success notification */}
      {successMsg && (
        <div style={{ background:'#dcfce7', border:'1px solid #86efac', borderRadius:8, padding:'10px 16px', marginBottom:12, fontSize:13, color:'#16a34a', fontWeight:500 }}>
          ✅ {successMsg}
        </div>
      )}

      {/* Tab toggle */}
      <div style={{ display:'flex', gap:4, background:'var(--panel)', border:'1px solid var(--border)', borderRadius:10, padding:4, marginBottom:14, width:'fit-content' }}>
        {[
          { key: 'students' as const, label: '📚 Students',  icon: '📚' },
          { key: 'history'  as const, label: '📋 History',   icon: '📋' },
        ].map(t => {
          const active = activeTab === t.key;
          return (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              style={{ fontSize:13, padding:'8px 18px', borderRadius:8, border:'none', cursor:'pointer', fontWeight:700,
                       background: active ? '#4f46e5' : 'transparent',
                       color: active ? '#fff' : 'var(--text)' }}>
              {t.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'history' ? <HistoryPanel /> : (<>


      {/* Summary Stats — left side panel (Students/Active) + right detail grid (FA/PCM rows) */}
      {(() => {
        const totalStudents = students.length;
        const totalActive   = students.filter(s => s.status === 'Active').length;
        const statCard = (label: string, val: any, sub: string, color: string, icon: string) => (
          <div style={{ background:'var(--panel)', border:'1.5px solid #cbd5e1', borderRadius:12, padding:'16px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', boxShadow:'var(--shadow-sm)' }}>
            <div>
              <p style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.5, margin:'0 0 4px' }}>{label}</p>
              <p style={{ fontSize:24, fontWeight:800, color, margin:0 }}>{val}<span style={{ fontSize:14, fontWeight:500, color:'var(--muted)' }}>{sub}</span></p>
            </div>
            <div style={{ width:40, height:40, borderRadius:'50%', background:`${color}18`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>{icon}</div>
          </div>
        );
        return (
          <div style={{ display:'grid', gridTemplateColumns:'minmax(180px, 220px) 1fr', gap:12, marginBottom:16 }}>
            <div style={{ display:'grid', gridTemplateRows:'1fr 1fr', gap:12 }}>
              {statCard('Total Students', totalStudents, '',         '#6366f1', '👥')}
              {statCard('Total Active',   totalActive,   ' active',  '#10b981', '✅')}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gridTemplateRows:'1fr 1fr', gap:12 }}>
              {statCard('FA Attended',  faInvited,  `/${faDue}`,  '#4f46e5', '🎓')}
              {statCard('FA Due',       faDue,      '',           '#8b5cf6', '📅')}
              {statCard('FA Backlog',   faBacklog,  `/${faDue}`,  '#ef4444', '📋')}
              {statCard('PCM Attended', pcmInvited, `/${pcmDue}`, '#0ea5e9', '🧪')}
              {statCard('PCM Due',      pcmDue,     '',           '#06b6d4', '📅')}
              {statCard('PCM Backlog',  pcmBacklog, `/${pcmDue}`, '#f97316', '📋')}
            </div>
          </div>
        );
      })()}

      {/* Filters: Branch + Search */}
      <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 16px', marginBottom:14, display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
        <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>Filter by Branch:</span>
        <select value={branchFilter} onChange={e => handleBranchChange(e.target.value)} style={{ fontSize:13, border:'1px solid var(--border)', borderRadius:8, padding:'6px 12px', background:'var(--bg)', color:'var(--text)', outline:'none' }}>
          <option value="All">All Branches</option>
          {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
        </select>

        {/* Search input */}
        <div style={{ display:'flex', alignItems:'center', gap:6, flex:1, minWidth:180, maxWidth:320, border:'1px solid var(--border)', borderRadius:8, padding:'6px 10px', background:'var(--bg)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            placeholder="Search student name…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ border:'none', outline:'none', background:'transparent', fontSize:13, color:'var(--text)', flex:1, minWidth:0 }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:16, lineHeight:1, padding:0 }}>×</button>
          )}
        </div>

        {(branchFilter !== 'All' || q) && (
          <span style={{ fontSize:13, color:'#4f46e5', fontWeight:500 }}>
            Showing {displayed.length === 0 ? 0 : `${pageStart + 1}-${pageEnd}`} of {displayed.length} student{displayed.length!==1?'s':''}
            {branchFilter !== 'All' ? ` in ${branchFilter}` : ''}
            {q ? ` matching "${searchQuery.trim()}"` : ''}
          </span>
        )}
        {(branchFilter === 'All' && !q) && displayed.length > 0 && (
          <span style={{ fontSize:13, color:'var(--muted)', fontWeight:500 }}>
            Showing {pageStart + 1}-{pageEnd} of {displayed.length}
          </span>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign:'center', padding:48, color:'var(--muted)', fontSize:14 }}>Loading students…</div>
      ) : (
      <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ minWidth:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'var(--bg)', borderBottom:'1px solid var(--border)' }}>
                {['No.','Name','Gender','Branch','DOB','Age Group','Coach Name','Enrollment Date','Grade & Chapter','FA Progress','Total FA','PCM Progress','Total PCM','Workbook Progress','Total Workbook','Guardian Name','Guardian Mobile','Actions'].map(h => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayed.length === 0 ? (
                <tr><td colSpan={18} style={{ ...td, textAlign:'center', padding:'48px 16px', color:'var(--muted)' }}>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
                    <span style={{ fontSize:36 }}>{q ? '🔍' : '🎓'}</span>
                    <p style={{ fontWeight:600, color:'var(--text)', margin:0 }}>
                      {q ? 'No students match your search' : 'No students yet'}
                    </p>
                    <p style={{ fontSize:12, margin:0 }}>
                      {q ? `Try a different name or clear the search` : 'Click "Add Students" to import from Excel'}
                    </p>
                  </div>
                </td></tr>
              ) : paginated.map((student, idx) => {
                const fa  = faSummary(student.faAttended);
                const pcm = faSummary(student.pcmAttended);
                return (
                  <tr key={student.id} style={{ borderTop:'1px solid var(--border)' }}>
                    <td style={{ ...td, color:'var(--muted)' }}>{pageStart + idx + 1}</td>
                    <td style={td}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontWeight:600, color:'var(--text)', whiteSpace:'nowrap' }}>{student.name}</span>
                        <span style={{ fontSize:10, padding:'2px 7px', borderRadius:99, fontWeight:600, background:student.status==='Active'?'rgba(34,197,94,0.15)':'rgba(239,68,68,0.12)', color:student.status==='Active'?'#16a34a':'#dc2626' }}>{student.status}</span>
                      </div>
                    </td>
                    <td style={{ ...td, color:'var(--muted)', whiteSpace:'nowrap' }}>{student.gender}</td>
                    <td style={td}><span style={{ fontSize:11, padding:'2px 8px', borderRadius:6, fontWeight:600, background:'rgba(99,102,241,0.1)', color:'#6366f1' }}>{student.branch}</span></td>
                    <td style={{ ...td, whiteSpace:'nowrap', color: student.dob ? 'var(--text)' : 'var(--muted)', fontStyle: student.dob ? 'normal' : 'italic' }}>{student.dob || '—'}</td>
                    {(() => {
                      const ag = getAgeGroup(student.dob || '');
                      const c = getAgeGroupColor(ag);
                      return (
                        <td style={{ ...td, whiteSpace:'nowrap' }}>
                          {ag
                            ? <span style={{ fontSize:11, padding:'2px 8px', borderRadius:6, fontWeight:700, background:c.bg, color:c.fg }}>{ag}</span>
                            : <span style={{ color:'var(--muted)', fontStyle:'italic' }}>—</span>}
                        </td>
                      );
                    })()}
                    <td style={{ ...td, whiteSpace:'nowrap', color: student.coachName ? 'var(--text)' : 'var(--muted)', fontStyle: student.coachName ? 'normal' : 'italic' }}>{student.coachName || '—'}</td>
                    <td style={{ ...td, color:'var(--muted)', whiteSpace:'nowrap' }}>{student.enrollmentDate||'—'}</td>
                    <td style={td}><span style={{ fontSize:11, padding:'4px 8px', borderRadius:6, fontWeight:600, background:'rgba(139,92,246,0.1)', color:'#7c3aed', whiteSpace:'nowrap' }}>{student.grade} — {student.chapter}</span></td>

                    {/* FA checkboxes */}
                    <td style={{ ...td, borderLeft:'1px solid var(--border)' }}>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:4, minWidth:80 }}>
                        {student.faAttended.length===0 ? <span style={{ color:'var(--muted)', fontSize:11, fontStyle:'italic' }}>—</span>
                         : student.faAttended.map((checked: boolean, i: number) => (
                          <label key={i} style={{ display:'flex', alignItems:'center', gap:2, cursor:'pointer' }}>
                            <input type="checkbox" checked={checked} onChange={() => toggleFa(student.id,i)} style={{ accentColor:'#4f46e5', cursor:'pointer' }} />
                            <span style={{ fontSize:10, color:'var(--muted)' }}>G{i+1}</span>
                          </label>
                        ))}
                      </div>
                    </td>
                    <td style={td}><span style={{ fontSize:14, fontWeight:700, color:fa.total===0?'var(--muted)':fa.attended===fa.total?'#16a34a':'#4f46e5' }}>{fa.attended}/{fa.total}</span></td>

                    {/* PCM checkboxes */}
                    <td style={{ ...td, borderLeft:'1px solid var(--border)' }}>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:4, minWidth:80 }}>
                        {student.pcmAttended.length===0 ? <span style={{ color:'var(--muted)', fontSize:11, fontStyle:'italic' }}>—</span>
                         : student.pcmAttended.map((checked: boolean, i: number) => (
                          <label key={i} style={{ display:'flex', alignItems:'center', gap:2, cursor:'pointer' }}>
                            <input type="checkbox" checked={checked} onChange={() => togglePcm(student.id,i)} style={{ accentColor:'#f59e0b', cursor:'pointer' }} />
                            <span style={{ fontSize:10, color:'var(--muted)' }}>G{i+1}</span>
                          </label>
                        ))}
                      </div>
                    </td>
                    <td style={td}><span style={{ fontSize:14, fontWeight:700, color:pcm.total===0?'var(--muted)':pcm.attended===pcm.total?'#16a34a':'#f59e0b' }}>{pcm.attended}/{pcm.total}</span></td>

                    {/* Workbook checkboxes */}
                    {(() => {
                      const wb = Array.isArray(student.workbookAttended) ? student.workbookAttended : [];
                      const wbSummary = faSummary(wb);
                      return (
                        <>
                          <td style={{ ...td, borderLeft:'1px solid var(--border)' }}>
                            <div style={{ display:'flex', flexWrap:'wrap', gap:4, minWidth:80 }}>
                              {wb.length===0 ? <span style={{ color:'var(--muted)', fontSize:11, fontStyle:'italic' }}>—</span>
                               : wb.map((checked: boolean, i: number) => (
                                <label key={i} style={{ display:'flex', alignItems:'center', gap:2, cursor:'pointer' }}>
                                  <input type="checkbox" checked={checked} onChange={() => toggleWorkbook(student.id,i)} style={{ accentColor:'#10b981', cursor:'pointer' }} />
                                  <span style={{ fontSize:10, color:'var(--muted)' }}>G{i+1}</span>
                                </label>
                              ))}
                            </div>
                          </td>
                          <td style={td}><span style={{ fontSize:14, fontWeight:700, color:wbSummary.total===0?'var(--muted)':wbSummary.attended===wbSummary.total?'#16a34a':'#10b981' }}>{wbSummary.attended}/{wbSummary.total}</span></td>
                        </>
                      );
                    })()}

                    {/* Guardian */}
                    <td style={{ ...td, borderLeft:'1px solid var(--border)', whiteSpace:'nowrap', color: student.guardianName ? 'var(--text)' : 'var(--muted)', fontStyle: student.guardianName ? 'normal' : 'italic' }}>{student.guardianName || '—'}</td>
                    <td style={{ ...td, whiteSpace:'nowrap', color: student.guardianMobile ? 'var(--text)' : 'var(--muted)', fontStyle: student.guardianMobile ? 'normal' : 'italic' }}>{student.guardianMobile || '—'}</td>

                    {/* Actions */}
                    <td style={{ ...td, borderLeft:'1px solid var(--border)' }}>
                      <div style={{ display:'flex', gap:8 }}>
                        <button onClick={() => setEditStudent(student)} style={{ fontSize:11, padding:'4px 10px', borderRadius:6, border:'none', background:'rgba(59,130,246,0.12)', color:'#2563eb', cursor:'pointer', fontWeight:600 }}>Edit</button>
                        <button onClick={() => setArchiveStudent(student)} style={{ fontSize:11, padding:'4px 10px', borderRadius:6, border:'none', background:'rgba(245,158,11,0.12)', color:'#d97706', cursor:'pointer', fontWeight:600 }}>Archive</button>
                        <button onClick={() => setDeleteStudent(student)} style={{ fontSize:11, padding:'4px 10px', borderRadius:6, border:'none', background:'rgba(239,68,68,0.1)', color:'#dc2626', cursor:'pointer', fontWeight:600 }}>Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {displayed.length > PAGE_SIZE && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderTop:'1px solid var(--border)', flexWrap:'wrap', gap:12 }}>
            <span style={{ fontSize:12, color:'var(--muted)' }}>
              Page {safePage} of {totalPages} · {displayed.length} students
            </span>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              <button
                onClick={() => setCurrentPage(1)}
                disabled={safePage === 1}
                style={{ fontSize:12, padding:'5px 10px', borderRadius:6, border:'1px solid var(--border)', background:'var(--panel)', color:'var(--text)', cursor:safePage===1?'not-allowed':'pointer', opacity:safePage===1?0.4:1, fontWeight:500 }}
              >« First</button>
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={safePage === 1}
                style={{ fontSize:12, padding:'5px 10px', borderRadius:6, border:'1px solid var(--border)', background:'var(--panel)', color:'var(--text)', cursor:safePage===1?'not-allowed':'pointer', opacity:safePage===1?0.4:1, fontWeight:500 }}
              >‹ Prev</button>
              {(() => {
                const windowSize = 5;
                const half = Math.floor(windowSize / 2);
                let start = Math.max(1, safePage - half);
                const end = Math.min(totalPages, start + windowSize - 1);
                start = Math.max(1, end - windowSize + 1);
                const pages = [];
                for (let p = start; p <= end; p++) pages.push(p);
                return pages.map(p => (
                  <button
                    key={p}
                    onClick={() => setCurrentPage(p)}
                    style={{ fontSize:12, padding:'5px 10px', borderRadius:6, border:'1px solid var(--border)', background:p===safePage?'#4f46e5':'var(--panel)', color:p===safePage?'#fff':'var(--text)', cursor:'pointer', fontWeight:p===safePage?700:500, minWidth:32 }}
                  >{p}</button>
                ));
              })()}
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                style={{ fontSize:12, padding:'5px 10px', borderRadius:6, border:'1px solid var(--border)', background:'var(--panel)', color:'var(--text)', cursor:safePage===totalPages?'not-allowed':'pointer', opacity:safePage===totalPages?0.4:1, fontWeight:500 }}
              >Next ›</button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={safePage === totalPages}
                style={{ fontSize:12, padding:'5px 10px', borderRadius:6, border:'1px solid var(--border)', background:'var(--panel)', color:'var(--text)', cursor:safePage===totalPages?'not-allowed':'pointer', opacity:safePage===totalPages?0.4:1, fontWeight:500 }}
              >Last »</button>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Modals */}
      {showAdd     && <AddStudentModal    onClose={() => setShowAdd(false)}      onAdd={addStudents} onBulkComplete={handleBulkUploadComplete} />}
      {editStudent && <EditStudentModal   student={editStudent} onClose={() => setEditStudent(null)}   onSave={updateStudent} />}
      {deleteStudent && <DeleteConfirmModal student={deleteStudent} onClose={() => setDeleteStudent(null)} onConfirm={() => deleteStudentById(deleteStudent.id)} />}
      {archiveStudent && <ArchiveConfirmModal student={archiveStudent} onClose={() => setArchiveStudent(null)} onConfirm={() => archiveStudentById(archiveStudent)} />}

      {/* Delete All Confirmation Modal */}
      {showDeleteAll && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'var(--panel)', borderRadius:16, boxShadow:'0 25px 50px rgba(0,0,0,0.25)', width:'100%', maxWidth:460 }}>
            <div style={{ padding:28 }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
                <span style={{ fontSize:28 }}>⚠️</span>
                <h2 style={{ fontSize:18, fontWeight:700, color:'var(--text)', margin:0 }}>Confirm Bulk Deletion</h2>
              </div>

              {/* Branch selector */}
              <div style={{ marginBottom:16 }}>
                <label style={{ fontSize:12, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.5, display:'block', marginBottom:6 }}>
                  Select Branch to Clear
                </label>
                <select
                  value={deleteAllBranch}
                  onChange={e => setDeleteAllBranch(e.target.value)}
                  style={{ width:'100%', fontSize:13, padding:'9px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg)', color:'var(--text)', outline:'none', cursor:'pointer' }}
                >
                  <option value="All">All Branches</option>
                  {[...BRANCHES].sort().map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>

              {/* Dynamic warning */}
              <p style={{ fontSize:13, color:'var(--muted)', margin:0, lineHeight:1.6, background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:8, padding:'10px 14px' }}>
                Are you sure you want to delete{' '}
                <strong style={{ color:'#dc2626' }}>
                  {deleteAllBranch === 'All' ? `all ${students.length} student records` : `all students in ${deleteAllBranch}`}
                </strong>?{' '}
                This action is <strong>permanent and cannot be undone.</strong>
              </p>
            </div>
            <div style={{ padding:'0 24px 24px', display:'flex', gap:12 }}>
              <button
                onClick={() => setShowDeleteAll(false)}
                disabled={deleteAllLoading}
                style={{ flex:1, fontSize:13, padding:'10px 16px', borderRadius:8, border:'1px solid var(--border)', background:'transparent', color:'var(--text)', cursor:'pointer', fontWeight:500 }}
              >
                Cancel
              </button>
              <button
                onClick={() => deleteAllStudents(deleteAllBranch)}
                disabled={deleteAllLoading}
                style={{ flex:1, fontSize:13, padding:'10px 16px', borderRadius:8, border:'none', background:'#dc2626', color:'#fff', cursor:'pointer', fontWeight:600, opacity:deleteAllLoading?0.6:1 }}
              >
                {deleteAllLoading ? 'Deleting…' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
      </>)}
    </div>
  );
}
