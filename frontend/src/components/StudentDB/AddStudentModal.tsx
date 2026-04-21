import { useState, useRef } from 'react';
import { BRANCHES, GRADES, CHAPTERS } from '../../lib/studentTypes';
import { getFaCount, getPcmCount } from '../../lib/studentFaLogic';
import { parseExcelFile, generateId } from '../../lib/studentExcelParser';

const sel = { fontSize:11, border:'1px solid var(--border)', borderRadius:6, padding:'4px 8px', background:'var(--bg)', color:'var(--text)', outline:'none' };

export default function AddStudentModal({ onClose, onAdd }) {
  const [step, setStep] = useState('upload');
  const [preview, setPreview] = useState([]);
  const [defaultBranch, setDefaultBranch] = useState('ONL');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef(null);

  async function handleFile(file) {
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'xlsx' && ext !== 'xls') { setError('Please upload an Excel file (.xlsx or .xls)'); return; }
    setLoading(true); setError(''); setFileName(file.name);
    try {
      const rows = await parseExcelFile(file, defaultBranch);
      if (rows.length === 0) { setError('No valid student rows found. Check columns B (Name), C (Gender), M (Enrollment Date), N (Status).'); setLoading(false); return; }
      setPreview(rows.map(r => ({ ...r, tempId: generateId() })));
      setStep('preview');
    } catch { setError('Failed to read the file.'); }
    setLoading(false);
  }

  function updateRow(tempId, field, value) {
    setPreview(prev => prev.map(r => r.tempId === tempId ? { ...r, [field]: value } : r));
  }

  function removeRow(tempId) {
    setPreview(prev => { const next = prev.filter(r => r.tempId !== tempId); if (!next.length) setStep('upload'); return next; });
  }

  function handleSave() {
    const students = preview.map(r => ({
      id: generateId(), name: r.name, gender: r.gender, enrollmentDate: r.enrollmentDate,
      status: r.status, grade: r.grade, chapter: r.chapter, branch: r.branch,
      faAttended: Array(getFaCount(r.grade, r.chapter)).fill(false),
      pcmAttended: Array(getPcmCount(r.grade, r.chapter)).fill(false),
    }));
    onAdd(students); onClose();
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'var(--panel)', borderRadius:16, boxShadow:'0 25px 50px rgba(0,0,0,0.25)', width:'100%', maxWidth:900, maxHeight:'90vh', display:'flex', flexDirection:'column' }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 24px', borderBottom:'1px solid var(--border)' }}>
          <div>
            <h2 style={{ fontSize:18, fontWeight:700, color:'var(--text)', margin:0 }}>Add Students</h2>
            <p style={{ fontSize:11, color:'var(--muted)', margin:'2px 0 0' }}>
              {step === 'upload' ? 'Upload your Excel file — data extracted from the "Students" sheet' : `Preview ${preview.length} student${preview.length !== 1 ? 's' : ''} — assign Grade, Chapter & Branch before saving`}
            </p>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:24, color:'var(--muted)', cursor:'pointer' }}>&times;</button>
        </div>

        {step === 'upload' && (
          <div style={{ padding:24, overflowY:'auto', display:'flex', flexDirection:'column', gap:16 }}>
            <div style={{ background:'rgba(99,102,241,0.08)', border:'1px solid rgba(99,102,241,0.2)', borderRadius:10, padding:16, fontSize:12 }}>
              <p style={{ fontWeight:700, color:'#6366f1', margin:'0 0 10px' }}>What will be extracted from the "Students" sheet:</p>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                {[['Column B','Name'],['Column C','Gender'],['Column M','Enrollment Date'],['Column N','Status']].map(([col,label]) => (
                  <span key={col} style={{ background:'rgba(99,102,241,0.15)', borderRadius:6, padding:'4px 10px', color:'#6366f1' }}>{col} → {label}</span>
                ))}
              </div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <span style={{ fontSize:13, fontWeight:600, color:'var(--text)', whiteSpace:'nowrap' }}>Default Branch:</span>
              <select value={defaultBranch} onChange={e => setDefaultBranch(e.target.value)} style={{ ...sel, padding:'6px 12px', fontSize:13 }}>
                {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div
              onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]); }}
              onDragOver={e => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              style={{ border:'2px dashed rgba(99,102,241,0.4)', borderRadius:16, padding:40, textAlign:'center', cursor:'pointer', transition:'all 0.2s' }}
            >
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={e => handleFile(e.target.files?.[0])} style={{ display:'none' }} />
              <div style={{ fontSize:40, marginBottom:12 }}>📂</div>
              {loading ? <p style={{ color:'#6366f1', fontSize:13 }}>Reading file...</p>
               : fileName ? <p style={{ color:'#6366f1', fontWeight:600, fontSize:13 }}>{fileName}</p>
               : <><p style={{ fontSize:14, fontWeight:600, color:'var(--text)', margin:'0 0 4px' }}>Click to browse or drag & drop</p><p style={{ fontSize:12, color:'var(--muted)', margin:0 }}>.xlsx or .xls files only</p></>}
            </div>
            {error && <p style={{ fontSize:12, color:'#dc2626', background:'rgba(220,38,38,0.08)', border:'1px solid rgba(220,38,38,0.2)', borderRadius:8, padding:'10px 16px', margin:0 }}>{error}</p>}
          </div>
        )}

        {step === 'preview' && (
          <>
            <div style={{ overflowY:'auto', flex:1, padding:16 }}>
              <p style={{ fontSize:11, color:'var(--muted)', margin:'0 0 12px' }}>
                <span style={{ color:'#22c55e', fontWeight:700 }}>✓ {fileName}</span> — {preview.length} rows extracted
              </p>
              <div style={{ overflowX:'auto' }}>
                <table style={{ minWidth:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead>
                    <tr style={{ background:'var(--bg)' }}>
                      {['#','Name','Gender','Branch','Enrollment Date','Status','Grade','Chapter','FA Count',''].map(h => (
                        <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, idx) => (
                      <tr key={row.tempId} style={{ borderTop:'1px solid var(--border)' }}>
                        <td style={{ padding:'8px 12px', color:'var(--muted)', fontSize:11 }}>{idx + 1}</td>
                        <td style={{ padding:'8px 12px', fontWeight:600, color:'var(--text)', whiteSpace:'nowrap' }}>{row.name}</td>
                        <td style={{ padding:'8px 12px', color:'var(--muted)', whiteSpace:'nowrap', fontSize:11 }}>{row.gender}</td>
                        <td style={{ padding:'8px 12px' }}><select value={row.branch} onChange={e => updateRow(row.tempId,'branch',e.target.value)} style={sel}>{BRANCHES.map(b=><option key={b} value={b}>{b}</option>)}</select></td>
                        <td style={{ padding:'8px 12px', color:'var(--muted)', whiteSpace:'nowrap', fontSize:11 }}>{row.enrollmentDate||'—'}</td>
                        <td style={{ padding:'8px 12px' }}><span style={{ fontSize:11, padding:'2px 8px', borderRadius:99, fontWeight:600, background: row.status==='Active'?'rgba(34,197,94,0.15)':'rgba(239,68,68,0.12)', color: row.status==='Active'?'#16a34a':'#dc2626' }}>{row.status}</span></td>
                        <td style={{ padding:'8px 12px' }}><select value={row.grade} onChange={e => updateRow(row.tempId,'grade',e.target.value)} style={sel}>{GRADES.map(g=><option key={g} value={g}>{g}</option>)}</select></td>
                        <td style={{ padding:'8px 12px' }}><select value={row.chapter} onChange={e => updateRow(row.tempId,'chapter',e.target.value)} style={sel}>{CHAPTERS.map(c=><option key={c} value={c}>{c}</option>)}</select></td>
                        <td style={{ padding:'8px 12px', color:'#6366f1', fontWeight:600, whiteSpace:'nowrap' }}>{getFaCount(row.grade, row.chapter)} FA</td>
                        <td style={{ padding:'8px 12px' }}><button onClick={() => removeRow(row.tempId)} style={{ background:'none', border:'none', color:'#ef4444', fontSize:18, cursor:'pointer' }}>&times;</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div style={{ padding:'16px 24px', borderTop:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <button onClick={() => { setStep('upload'); setFileName(''); setPreview([]); }} style={{ fontSize:13, color:'var(--muted)', background:'none', border:'none', cursor:'pointer', textDecoration:'underline' }}>← Upload different file</button>
              <div style={{ display:'flex', gap:12 }}>
                <button onClick={onClose} style={{ fontSize:13, padding:'8px 16px', borderRadius:8, border:'1px solid var(--border)', background:'transparent', color:'var(--text)', cursor:'pointer' }}>Cancel</button>
                <button onClick={handleSave} style={{ fontSize:13, padding:'8px 24px', borderRadius:8, border:'none', background:'#4f46e5', color:'#fff', cursor:'pointer', fontWeight:600 }}>Save {preview.length} Student{preview.length!==1?'s':''}</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
