import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { BackButton } from '../components/BackButton';
import { BRANCHES } from '../lib/studentTypes';
import AddArchivedStudentModal from '../components/StudentDB/AddArchivedStudentModal';

const th = { padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', whiteSpace:'nowrap', letterSpacing:0.5 };
const td = { padding:'10px 14px', fontSize:12 };

export function ArchivedStudentsPage() {
  const [students, setStudents] = useState([]);
  const [branch, setBranch] = useState('All');
  const [showImport, setShowImport] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const filtered = branch === 'All' ? students : students.filter(s => s.branch === branch);

  const handleImport = useCallback((incoming) => setStudents(prev => [...prev, ...incoming]), []);

  function handleRestore(student) { setStudents(prev => prev.filter(s => s.id !== student.id)); setConfirm(null); }
  function handleDelete(student) { setStudents(prev => prev.filter(s => s.id !== student.id)); setConfirm(null); }

  function exportToExcel() {
    const data = filtered.map((s, i) => ({
      'No.': i+1, 'Student ID': s.studentId, 'Name': s.name, 'Gender': s.gender,
      'Branch': s.branch, 'Enrollment Date': s.enrollmentDate, 'Date of Birth': s.dateOfBirth,
      'Created On': s.createdOn, 'Archived On': s.archivedOn,
      'Guardian Name': s.guardianName, 'Guardian Mobile': s.guardianMobile, 'Guardian Email': s.guardianEmail,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Archived Students');
    XLSX.writeFile(wb, `archived-students-${branch.toLowerCase()}-${new Date().toISOString().slice(0,10)}.xlsx`);
  }

  const summaryCards = [
    { label:'Total Archived', value:students.length, color:'#4f46e5' },
    { label:'Male', value:students.filter(s=>s.gender==='Male').length, color:'#2563eb' },
    { label:'Female', value:students.filter(s=>s.gender==='Female').length, color:'#db2777' },
    { label:'Branches', value:new Set(students.map(s=>s.branch)).size, color:'#7c3aed' },
  ];

  return (
    <div className="dashboardPage">
      {/* Header */}
      <div style={{ marginBottom:24 }}>
        <BackButton to="/student-database" label="Back to Student Records" />
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:12, flexWrap:'wrap', gap:12 }}>
          <div>
            <h1 style={{ fontSize:28, fontWeight:900, color:'var(--text)', margin:0, letterSpacing:-0.5 }}>🗂 Archived Students</h1>
            <p style={{ fontSize:13, color:'var(--muted)', margin:'4px 0 0' }}>{filtered.length} record{filtered.length!==1?'s':''} found</p>
          </div>
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={exportToExcel} disabled={filtered.length===0} style={{ fontSize:13, padding:'8px 16px', borderRadius:8, border:'none', background:'#10b981', color:'#fff', cursor:'pointer', fontWeight:600, opacity:filtered.length?1:0.4 }}>⬇ Export</button>
            <button onClick={() => setShowImport(true)} style={{ fontSize:13, padding:'8px 20px', borderRadius:8, border:'none', background:'#4f46e5', color:'#fff', cursor:'pointer', fontWeight:600 }}>+ Add Archived Students</button>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px,1fr))', gap:12, marginBottom:16 }}>
        {summaryCards.map(c => (
          <div key={c.label} style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 18px', boxShadow:'var(--shadow-sm)' }}>
            <p style={{ fontSize:24, fontWeight:800, color:c.color, margin:'0 0 4px' }}>{c.value}</p>
            <p style={{ fontSize:11, color:'var(--muted)', margin:0, textTransform:'uppercase', letterSpacing:0.5, fontWeight:600 }}>{c.label}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 16px', marginBottom:14, display:'flex', alignItems:'center', gap:12 }}>
        <span style={{ fontSize:12, fontWeight:600, color:'var(--muted)', textTransform:'uppercase' }}>Branch</span>
        <select value={branch} onChange={e => setBranch(e.target.value)} style={{ fontSize:13, border:'1px solid var(--border)', borderRadius:8, padding:'6px 12px', background:'var(--bg)', color:'var(--text)', outline:'none' }}>
          <option value="All">All Branches</option>
          {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        {branch !== 'All' && <button onClick={() => setBranch('All')} style={{ fontSize:12, color:'var(--muted)', background:'none', border:'none', cursor:'pointer' }}>Clear</button>}
      </div>

      {/* Table */}
      <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ minWidth:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'var(--bg)', borderBottom:'1px solid var(--border)' }}>
                {['No.','Student ID','Name','Gender','Branch','Enrollment Date','Date of Birth','Created On','Archived On','Guardian Name','Guardian Mobile','Guardian Email','Actions'].map(h => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={13} style={{ ...td, textAlign:'center', padding:48, color:'var(--muted)' }}>
                  No archived students yet.{' '}
                  <button onClick={() => setShowImport(true)} style={{ color:'#4f46e5', background:'none', border:'none', cursor:'pointer', textDecoration:'underline', fontSize:12 }}>Import from Excel</button>
                </td></tr>
              ) : filtered.map((s, i) => (
                <tr key={s.id} style={{ borderTop:'1px solid var(--border)' }}>
                  <td style={{ ...td, color:'var(--muted)' }}>{i+1}</td>
                  <td style={{ ...td, color:'var(--muted)', fontFamily:'monospace' }}>{s.studentId||'—'}</td>
                  <td style={{ ...td, fontWeight:600, color:'var(--text)', whiteSpace:'nowrap' }}>{s.name}</td>
                  <td style={td}>
                    <span style={{ fontSize:11, padding:'2px 8px', borderRadius:99, fontWeight:600, background: s.gender==='Male'?'rgba(37,99,235,0.12)':'rgba(219,39,119,0.12)', color: s.gender==='Male'?'#2563eb':'#db2777' }}>{s.gender}</span>
                  </td>
                  <td style={td}><span style={{ fontSize:11, padding:'2px 8px', borderRadius:99, fontWeight:600, background:'rgba(99,102,241,0.12)', color:'#6366f1' }}>{s.branch}</span></td>
                  <td style={{ ...td, color:'var(--muted)', whiteSpace:'nowrap' }}>{s.enrollmentDate||'—'}</td>
                  <td style={{ ...td, color:'var(--muted)', whiteSpace:'nowrap' }}>{s.dateOfBirth||'—'}</td>
                  <td style={{ ...td, color:'var(--muted)', whiteSpace:'nowrap' }}>{s.createdOn||'—'}</td>
                  <td style={td}><span style={{ fontSize:11, padding:'2px 8px', borderRadius:99, fontWeight:600, background:'rgba(245,158,11,0.12)', color:'#d97706', whiteSpace:'nowrap' }}>{s.archivedOn||'—'}</span></td>
                  <td style={{ ...td, color:'var(--text)', whiteSpace:'nowrap' }}>{s.guardianName||'—'}</td>
                  <td style={{ ...td, color:'var(--muted)', whiteSpace:'nowrap' }}>{s.guardianMobile||'—'}</td>
                  <td style={{ ...td, color:'var(--muted)', whiteSpace:'nowrap' }}>{s.guardianEmail||'—'}</td>
                  <td style={td}>
                    <div style={{ display:'flex', gap:8 }}>
                      <button onClick={() => setConfirm({type:'restore',student:s})} style={{ fontSize:11, padding:'4px 10px', borderRadius:6, border:'none', background:'rgba(34,197,94,0.12)', color:'#16a34a', cursor:'pointer', fontWeight:600, whiteSpace:'nowrap' }}>Restore</button>
                      <button onClick={() => setConfirm({type:'delete',student:s})} style={{ fontSize:11, padding:'4px 10px', borderRadius:6, border:'none', background:'rgba(239,68,68,0.1)', color:'#dc2626', cursor:'pointer', fontWeight:600 }}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showImport && <AddArchivedStudentModal onClose={() => setShowImport(false)} onImport={handleImport} />}

      {confirm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'var(--panel)', borderRadius:16, boxShadow:'0 25px 50px rgba(0,0,0,0.25)', width:'100%', maxWidth:400, padding:24 }}>
            <h3 style={{ fontSize:16, fontWeight:700, color:'var(--text)', margin:'0 0 8px' }}>
              {confirm.type === 'restore' ? 'Restore Student' : 'Permanently Delete'}
            </h3>
            <p style={{ fontSize:13, color:'var(--muted)', margin:'0 0 20px' }}>
              {confirm.type === 'restore'
                ? <>Move <strong style={{ color:'var(--text)' }}>{confirm.student.name}</strong> back to Active Records?</>
                : <>Permanently delete <strong style={{ color:'var(--text)' }}>{confirm.student.name}</strong>? This cannot be undone.</>}
            </p>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:12 }}>
              <button onClick={() => setConfirm(null)} style={{ fontSize:13, border:'1px solid var(--border)', background:'transparent', color:'var(--text)', padding:'8px 16px', borderRadius:8, cursor:'pointer' }}>Cancel</button>
              {confirm.type === 'restore'
                ? <button onClick={() => handleRestore(confirm.student)} style={{ fontSize:13, background:'#16a34a', color:'#fff', border:'none', padding:'8px 16px', borderRadius:8, cursor:'pointer', fontWeight:600 }}>Restore</button>
                : <button onClick={() => handleDelete(confirm.student)} style={{ fontSize:13, background:'#dc2626', color:'#fff', border:'none', padding:'8px 16px', borderRadius:8, cursor:'pointer', fontWeight:600 }}>Delete</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
