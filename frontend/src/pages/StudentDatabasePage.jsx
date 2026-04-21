import { useState, useCallback, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { useNavigate } from 'react-router-dom';
import { BackButton } from '../components/BackButton';
import { BRANCHES } from '../lib/studentTypes';
import { getFaCount, getPcmCount, reconcileFa, faSummary } from '../lib/studentFaLogic';
import { useAcademy } from '../context/AcademyContext';
import { apiFetch } from '../lib/api';
import AddStudentModal from '../components/StudentDB/AddStudentModal';
import EditStudentModal from '../components/StudentDB/EditStudentModal';
import DeleteConfirmModal from '../components/StudentDB/DeleteConfirmModal';

const th = { padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', whiteSpace:'nowrap', letterSpacing:0.5 };
const td = { padding:'10px 14px', fontSize:12 };

export function StudentDatabasePage() {
  const navigate = useNavigate();
  const { dbStudents: students, setDbStudents: setStudents, sharedBranch, setSharedBranch } = useAcademy();
  const [branchFilter, setBranchFilter] = useState(sharedBranch);
  const [showAdd, setShowAdd] = useState(false);
  const [editStudent, setEditStudent] = useState(null);
  const [deleteStudent, setDeleteStudent] = useState(null);
  const [loading, setLoading] = useState(false);

  // Load from DB on mount
  useEffect(() => {
    setLoading(true);
    apiFetch('/api/student-records')
      .then(res => { if (res.data) setStudents(res.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function handleBranchChange(branch) {
    setBranchFilter(branch);
    setSharedBranch(branch);
  }

  const filtered = branchFilter === 'All' ? students : students.filter(s => s.branch === branchFilter);
  const activeFiltered = filtered.filter(s => s.status === 'Active');

  // FA stats computed from student records
  const faDue     = activeFiltered.reduce((acc, s) => acc + s.faAttended.length, 0);
  const faInvited = activeFiltered.reduce((acc, s) => acc + s.faAttended.filter(Boolean).length, 0);
  const faBacklog = faDue - faInvited;

  const totals = activeFiltered.reduce(
    (acc, s) => ({
      pcmTicked: acc.pcmTicked + s.pcmAttended.filter(Boolean).length,
      pcmTotal:  acc.pcmTotal  + s.pcmAttended.length,
    }),
    { pcmTicked:0, pcmTotal:0 }
  );

  // ── Add students (bulk insert) ────────────────────────────────────────────
  const addStudents = useCallback(async (newStudents) => {
    try {
      const res = await apiFetch('/api/student-records/bulk', { method: 'POST', body: { students: newStudents } });
      if (res.data) setStudents(res.data);
    } catch {
      // fallback: local state
      setStudents(prev => [...prev, ...newStudents]);
    }
  }, [setStudents]);

  // ── Update student ────────────────────────────────────────────────────────
  const updateStudent = useCallback(async (updated) => {
    const reconciled = {
      ...updated,
      faAttended:  reconcileFa(updated.faAttended,  getFaCount(updated.grade, updated.chapter)),
      pcmAttended: reconcileFa(updated.pcmAttended, getPcmCount(updated.grade, updated.chapter)),
    };
    try {
      const res = await apiFetch(`/api/student-records/${updated.id}`, { method: 'PUT', body: reconciled });
      if (res.data) {
        setStudents(prev => prev.map(s => s.id === updated.id ? res.data : s));
      }
    } catch {
      setStudents(prev => prev.map(s => s.id === updated.id ? reconciled : s));
    }
    setEditStudent(null);
  }, [setStudents]);

  // ── Delete student ────────────────────────────────────────────────────────
  const deleteStudentById = useCallback(async (id) => {
    try {
      await apiFetch(`/api/student-records/${id}`, { method: 'DELETE' });
    } catch { /* continue regardless */ }
    setStudents(prev => prev.filter(s => s.id !== id));
    setDeleteStudent(null);
  }, [setStudents]);

  // ── Toggle FA checkbox (save to DB) ──────────────────────────────────────
  const toggleFa = useCallback(async (studentId, index) => {
    setStudents(prev => {
      const next = prev.map(s => {
        if (s.id !== studentId) return s;
        const updated = [...s.faAttended];
        updated[index] = !updated[index];
        const reconciled = { ...s, faAttended: updated };
        // fire-and-forget save
        apiFetch(`/api/student-records/${studentId}`, { method: 'PUT', body: reconciled }).catch(() => {});
        return reconciled;
      });
      return next;
    });
  }, [setStudents]);

  // ── Toggle PCM checkbox ───────────────────────────────────────────────────
  const togglePcm = useCallback(async (studentId, index) => {
    setStudents(prev => {
      const next = prev.map(s => {
        if (s.id !== studentId) return s;
        const updated = [...s.pcmAttended];
        updated[index] = !updated[index];
        const reconciled = { ...s, pcmAttended: updated };
        apiFetch(`/api/student-records/${studentId}`, { method: 'PUT', body: reconciled }).catch(() => {});
        return reconciled;
      });
      return next;
    });
  }, [setStudents]);

  function exportToExcel() {
    const data = filtered.map((s, i) => ({
      'No.': i+1, 'Name': s.name, 'Gender': s.gender, 'Branch': s.branch,
      'Enrollment Date': s.enrollmentDate, 'Grade': s.grade, 'Chapter': s.chapter, 'Status': s.status,
      'FA Attended': s.faAttended.filter(Boolean).length, 'FA Total': s.faAttended.length,
      'PCM Attended': s.pcmAttended.filter(Boolean).length, 'PCM Total': s.pcmAttended.length,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Student Records');
    XLSX.writeFile(wb, `student-records-${branchFilter.toLowerCase()}-${new Date().toISOString().slice(0,10)}.xlsx`);
  }

  const statCard = (label, val, sub, color, icon) => (
    <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:12, padding:'16px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', boxShadow:'var(--shadow-sm)' }}>
      <div>
        <p style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.5, margin:'0 0 4px' }}>{label}</p>
        <p style={{ fontSize:24, fontWeight:800, color, margin:0 }}>{val}<span style={{ fontSize:14, fontWeight:500, color:'var(--muted)' }}>{sub}</span></p>
      </div>
      <div style={{ width:40, height:40, borderRadius:'50%', background:`${color}18`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>{icon}</div>
    </div>
  );

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
            <button onClick={exportToExcel} disabled={filtered.length===0} style={{ fontSize:13, padding:'8px 16px', borderRadius:8, border:'none', background:'#10b981', color:'#fff', cursor:'pointer', fontWeight:600, opacity:filtered.length?1:0.4 }}>⬇ Export</button>
            <button onClick={() => setShowAdd(true)} style={{ fontSize:13, padding:'8px 20px', borderRadius:8, border:'none', background:'#4f46e5', color:'#fff', cursor:'pointer', fontWeight:600 }}>+ Add Students</button>
          </div>
        </div>
      </div>

      {/* Summary Stats — computed from student records */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', gap:12, marginBottom:16 }}>
        {statCard('FA Invited', faInvited, `/${faDue}`, '#4f46e5', '🎓')}
        {statCard('FA Due', faDue, '', '#8b5cf6', '📅')}
        {statCard('FA Backlog', faBacklog, `/${faDue}`, '#ef4444', '📋')}
        {statCard('Total Students', students.length, '', '#6366f1', '👥')}
        {statCard('Total Active', students.filter(s=>s.status==='Active').length, ' active', '#10b981', '✅')}
      </div>

      {/* Branch Filter */}
      <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 16px', marginBottom:14, display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
        <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>Filter by Branch:</span>
        <select value={branchFilter} onChange={e => handleBranchChange(e.target.value)} style={{ fontSize:13, border:'1px solid var(--border)', borderRadius:8, padding:'6px 12px', background:'var(--bg)', color:'var(--text)', outline:'none' }}>
          <option value="All">All Branches</option>
          {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        {branchFilter !== 'All' && <span style={{ fontSize:13, color:'#4f46e5', fontWeight:500 }}>Showing {filtered.length} student{filtered.length!==1?'s':''} in {branchFilter}</span>}
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
                {['No.','Name','Gender','Branch','Enrollment Date','Grade & Chapter','FA Progress','Total FA','PCM Progress','Total PCM','Actions'].map(h => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={11} style={{ ...td, textAlign:'center', padding:'48px 16px', color:'var(--muted)' }}>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
                    <span style={{ fontSize:36 }}>🎓</span>
                    <p style={{ fontWeight:600, color:'var(--text)', margin:0 }}>No students yet</p>
                    <p style={{ fontSize:12, margin:0 }}>Click "Add Students" to import from Excel</p>
                  </div>
                </td></tr>
              ) : filtered.map((student, idx) => {
                const fa  = faSummary(student.faAttended);
                const pcm = faSummary(student.pcmAttended);
                return (
                  <tr key={student.id} style={{ borderTop:'1px solid var(--border)' }}>
                    <td style={{ ...td, color:'var(--muted)' }}>{idx+1}</td>
                    <td style={td}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontWeight:600, color:'var(--text)', whiteSpace:'nowrap' }}>{student.name}</span>
                        <span style={{ fontSize:10, padding:'2px 7px', borderRadius:99, fontWeight:600, background:student.status==='Active'?'rgba(34,197,94,0.15)':'rgba(239,68,68,0.12)', color:student.status==='Active'?'#16a34a':'#dc2626' }}>{student.status}</span>
                      </div>
                    </td>
                    <td style={{ ...td, color:'var(--muted)', whiteSpace:'nowrap' }}>{student.gender}</td>
                    <td style={td}><span style={{ fontSize:11, padding:'2px 8px', borderRadius:6, fontWeight:600, background:'rgba(99,102,241,0.1)', color:'#6366f1' }}>{student.branch}</span></td>
                    <td style={{ ...td, color:'var(--muted)', whiteSpace:'nowrap' }}>{student.enrollmentDate||'—'}</td>
                    <td style={td}><span style={{ fontSize:11, padding:'4px 8px', borderRadius:6, fontWeight:600, background:'rgba(139,92,246,0.1)', color:'#7c3aed', whiteSpace:'nowrap' }}>{student.grade} — {student.chapter}</span></td>

                    {/* FA checkboxes */}
                    <td style={{ ...td, borderLeft:'1px solid var(--border)' }}>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:4, minWidth:80 }}>
                        {student.faAttended.length===0 ? <span style={{ color:'var(--muted)', fontSize:11, fontStyle:'italic' }}>—</span>
                         : student.faAttended.map((checked,i) => (
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
                         : student.pcmAttended.map((checked,i) => (
                          <label key={i} style={{ display:'flex', alignItems:'center', gap:2, cursor:'pointer' }}>
                            <input type="checkbox" checked={checked} onChange={() => togglePcm(student.id,i)} style={{ accentColor:'#f59e0b', cursor:'pointer' }} />
                            <span style={{ fontSize:10, color:'var(--muted)' }}>G{i+1}</span>
                          </label>
                        ))}
                      </div>
                    </td>
                    <td style={td}><span style={{ fontSize:14, fontWeight:700, color:pcm.total===0?'var(--muted)':pcm.attended===pcm.total?'#16a34a':'#f59e0b' }}>{pcm.attended}/{pcm.total}</span></td>

                    {/* Actions */}
                    <td style={{ ...td, borderLeft:'1px solid var(--border)' }}>
                      <div style={{ display:'flex', gap:8 }}>
                        <button onClick={() => setEditStudent(student)} style={{ fontSize:11, padding:'4px 10px', borderRadius:6, border:'none', background:'rgba(59,130,246,0.12)', color:'#2563eb', cursor:'pointer', fontWeight:600 }}>Edit</button>
                        <button onClick={() => setDeleteStudent(student)} style={{ fontSize:11, padding:'4px 10px', borderRadius:6, border:'none', background:'rgba(239,68,68,0.1)', color:'#dc2626', cursor:'pointer', fontWeight:600 }}>Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {showAdd     && <AddStudentModal    onClose={() => setShowAdd(false)}      onAdd={addStudents} />}
      {editStudent && <EditStudentModal   student={editStudent} onClose={() => setEditStudent(null)}   onSave={updateStudent} />}
      {deleteStudent && <DeleteConfirmModal student={deleteStudent} onClose={() => setDeleteStudent(null)} onConfirm={() => deleteStudentById(deleteStudent.id)} />}
    </div>
  );
}
