import { useState, useRef } from 'react';
import { BRANCHES } from '../../lib/studentTypes';
import { parseArchivedExcelFile } from '../../lib/archivedExcelParser';

const sel = { fontSize:11, border:'1px solid var(--border)', borderRadius:6, padding:'4px 8px', background:'var(--bg)', color:'var(--text)', outline:'none' };
const inp = { fontSize:13, border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', background:'var(--bg)', color:'var(--text)', outline:'none', width:'100%', boxSizing:'border-box' as const };

const SORTED_BRANCHES = [...BRANCHES].sort();

function today() { return new Date().toISOString().slice(0, 10); }
function emptyForm() {
  return {
    studentId:'', name:'', gender:'Male', branch:'AMP',
    enrollmentDate:'', dateOfBirth:'', createdOn:'', archivedOn: today(),
    guardianName:'', guardianMobile:'', guardianEmail:'',
  };
}

/* ─── Bulk Upload Tab ─── */
function BulkUploadTab({ onImport, onClose, defaultBranch, setDefaultBranch }) {
  const [step, setStep]     = useState('upload');
  const [rows, setRows]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const fileRef               = useRef(null);

  async function handleFile(file) {
    if (!file?.name.match(/\.(xlsx|xls)$/i)) { setError('Please upload an .xlsx or .xls file.'); return; }
    setError(''); setLoading(true);
    try {
      const parsed = await parseArchivedExcelFile(file);
      if (!parsed.length) { setError('No valid rows found. Check the file format.'); setLoading(false); return; }
      setRows(parsed.map(r => ({ ...r, branch: defaultBranch })));
      setStep('preview');
    } catch { setError('Failed to parse file.'); }
    setLoading(false);
  }

  async function handleSave() {
    setSaving(true);
    await onImport(rows);
    setSaving(false);
  }

  const colMapInvoice = [['B','Invoice Number → Student ID'],['C','Student Name'],['H','Invoice Created By → Branch'],['F','Invoice Issue Date → Enrollment Date'],['E','Invoice Generation Date → Created On']];
  const colMapStudent = [['A','Student ID'],['B','Student Name'],['C','Gender'],['D','Enrollment Date'],['E','Date of Birth'],['N','Created On'],['P','Archived On'],['Q','Guardian Name'],['S','Mobile'],['T','Email']];

  if (step === 'preview') {
    return (
      <>
        <div style={{ flex:1, overflowY:'auto', padding:16 }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ minWidth:'100%', borderCollapse:'collapse', fontSize:11 }}>
              <thead>
                <tr style={{ background:'var(--bg)' }}>
                  {['#','Student ID','Name','Gender','Enrollment','DOB','Created On','Archived On','Guardian','Mobile','Email','Branch',''].map(h => (
                    <th key={h} style={{ padding:'8px 10px', textAlign:'left', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', fontSize:10, whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderTop:'1px solid var(--border)' }}>
                    <td style={{ padding:'7px 10px', color:'var(--muted)' }}>{i+1}</td>
                    <td style={{ padding:'7px 10px', color:'var(--muted)' }}>{r.studentId||'—'}</td>
                    <td style={{ padding:'7px 10px', fontWeight:600, color:'var(--text)', whiteSpace:'nowrap' }}>{r.name}</td>
                    <td style={{ padding:'7px 10px', color:'var(--muted)' }}>{r.gender}</td>
                    <td style={{ padding:'7px 10px', color:'var(--muted)', whiteSpace:'nowrap' }}>{r.enrollmentDate||'—'}</td>
                    <td style={{ padding:'7px 10px', color:'var(--muted)', whiteSpace:'nowrap' }}>{r.dateOfBirth||'—'}</td>
                    <td style={{ padding:'7px 10px', color:'var(--muted)', whiteSpace:'nowrap' }}>{r.createdOn||'—'}</td>
                    <td style={{ padding:'7px 10px', color:'var(--muted)', whiteSpace:'nowrap' }}>{r.archivedOn||'—'}</td>
                    <td style={{ padding:'7px 10px', color:'var(--muted)', whiteSpace:'nowrap' }}>{r.guardianName||'—'}</td>
                    <td style={{ padding:'7px 10px', color:'var(--muted)', whiteSpace:'nowrap' }}>{r.guardianMobile||'—'}</td>
                    <td style={{ padding:'7px 10px', color:'var(--muted)', whiteSpace:'nowrap' }}>{r.guardianEmail||'—'}</td>
                    <td style={{ padding:'7px 10px' }}>
                      <select value={r.branch} onChange={e => setRows(prev => prev.map((row,idx)=>idx===i?{...row,branch:e.target.value}:row))} style={sel}>
                        {SORTED_BRANCHES.map(b=><option key={b} value={b}>{b}</option>)}
                      </select>
                    </td>
                    <td style={{ padding:'7px 10px' }}><button onClick={()=>setRows(prev=>prev.filter((_,idx)=>idx!==i))} style={{ background:'none', border:'none', color:'#ef4444', fontSize:16, cursor:'pointer' }}>&times;</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div style={{ padding:'14px 24px', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <button onClick={()=>setStep('upload')} style={{ fontSize:13, border:'1px solid var(--border)', background:'transparent', color:'var(--text)', padding:'8px 14px', borderRadius:8, cursor:'pointer' }}>← Back</button>
          <button onClick={handleSave} disabled={!rows.length || saving} style={{ fontSize:13, background:'#4f46e5', color:'#fff', border:'none', padding:'8px 20px', borderRadius:8, cursor:'pointer', fontWeight:600, opacity:(rows.length && !saving)?1:0.5 }}>
            {saving ? 'Saving…' : `Import ${rows.length} Student${rows.length!==1?'s':''}`}
          </button>
        </div>
      </>
    );
  }

  return (
    <div style={{ flex:1, overflowY:'auto', padding:24, display:'flex', flexDirection:'column', gap:16 }}>
      <div>
        <label style={{ fontSize:11, fontWeight:600, color:'var(--muted)', display:'block', marginBottom:6, textTransform:'uppercase' }}>Default Branch</label>
        <select value={defaultBranch} onChange={e => setDefaultBranch(e.target.value)} style={{ ...sel, padding:'6px 12px', fontSize:13 }}>
          {SORTED_BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>
      <div
        onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
        onClick={() => fileRef.current?.click()}
        style={{ border:'2px dashed rgba(99,102,241,0.4)', borderRadius:12, padding:40, textAlign:'center', cursor:'pointer' }}
      >
        <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display:'none' }} onChange={e => handleFile(e.target.files?.[0])} />
        <div style={{ fontSize:32, marginBottom:8 }}>📂</div>
        {loading ? <p style={{ fontSize:13, color:'#6366f1' }}>Parsing file…</p>
          : <><p style={{ fontSize:14, fontWeight:600, color:'var(--text)', margin:'0 0 4px' }}>Drop your Excel file here</p><p style={{ fontSize:12, color:'var(--muted)', margin:0 }}>or click to browse — .xlsx / .xls</p></>}
      </div>
      {error && <p style={{ fontSize:12, color:'#dc2626', margin:0 }}>{error}</p>}
      <div style={{ background:'rgba(99,102,241,0.08)', border:'1px solid rgba(99,102,241,0.2)', borderRadius:10, padding:14 }}>
        <p style={{ fontSize:12, fontWeight:700, color:'#6366f1', margin:'0 0 6px' }}>📄 Invoice Excel (auto-detected):</p>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:3, marginBottom:10 }}>
          {colMapInvoice.map(([col,label]) => (
            <div key={col} style={{ fontSize:11, color:'#6366f1', display:'flex', gap:8 }}>
              <span style={{ fontWeight:700, width:16 }}>{col}</span><span>{label}</span>
            </div>
          ))}
        </div>
        <p style={{ fontSize:12, fontWeight:700, color:'#6366f1', margin:'0 0 6px' }}>📋 Student Export Excel:</p>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:3 }}>
          {colMapStudent.map(([col,label]) => (
            <div key={col} style={{ fontSize:11, color:'#6366f1', display:'flex', gap:8 }}>
              <span style={{ fontWeight:700, width:16 }}>{col}</span><span>{label}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display:'flex', justifyContent:'flex-end' }}>
        <button onClick={onClose} style={{ fontSize:13, border:'1px solid var(--border)', background:'transparent', color:'var(--text)', padding:'8px 14px', borderRadius:8, cursor:'pointer' }}>Cancel</button>
      </div>
    </div>
  );
}

/* ─── Manual Entry Tab ─── */
function ManualEntryTab({ onImport, onClose }) {
  const [form, setForm]       = useState(emptyForm());
  const [success, setSuccess] = useState(false);
  const [error, setError]     = useState('');
  const [saving, setSaving]   = useState(false);

  function set(field, value) { setForm(prev => ({ ...prev, [field]: value })); }

  async function handleSubmit() {
    if (!form.name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    setError('');
    try {
      await onImport([{ ...form, name: form.name.trim() }]);
      setForm(emptyForm());
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
    } catch { setError('Failed to save. Please try again.'); }
    setSaving(false);
  }

  const labelStyle = { fontSize:12, fontWeight:600, color:'var(--muted)', textTransform:'uppercase' as const, letterSpacing:0.5, marginBottom:4, display:'block' };
  const fieldWrap  = { display:'flex', flexDirection:'column' as const, gap:4 };

  return (
    <div style={{ flex:1, overflowY:'auto', padding:24, display:'flex', flexDirection:'column', gap:16 }}>
      {success && (
        <div style={{ background:'rgba(34,197,94,0.12)', border:'1px solid rgba(34,197,94,0.3)', borderRadius:8, padding:'10px 16px', fontSize:13, fontWeight:600, color:'#16a34a' }}>
          ✅ Archived student added! Form cleared — add another.
        </div>
      )}
      {error && (
        <div style={{ background:'rgba(220,38,38,0.08)', border:'1px solid rgba(220,38,38,0.2)', borderRadius:8, padding:'10px 16px', fontSize:13, color:'#dc2626' }}>
          {error}
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        {/* Student ID */}
        <div style={fieldWrap}>
          <label style={labelStyle}>Student ID</label>
          <input type="text" placeholder="e.g. STU-001" value={form.studentId} onChange={e => set('studentId', e.target.value)} style={inp} />
        </div>

        {/* Name */}
        <div style={fieldWrap}>
          <label style={labelStyle}>Name</label>
          <input type="text" placeholder="Full name..." value={form.name} onChange={e => set('name', e.target.value)} style={inp} />
        </div>

        {/* Gender */}
        <div style={fieldWrap}>
          <label style={labelStyle}>Gender</label>
          <select value={form.gender} onChange={e => set('gender', e.target.value)} style={{ ...inp, cursor:'pointer' }}>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>
        </div>

        {/* Branch */}
        <div style={fieldWrap}>
          <label style={labelStyle}>Branch</label>
          <select value={form.branch} onChange={e => set('branch', e.target.value)} style={{ ...inp, cursor:'pointer' }}>
            {SORTED_BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>

        {/* Enrollment Date */}
        <div style={fieldWrap}>
          <label style={labelStyle}>Enrollment Date</label>
          <input type="date" value={form.enrollmentDate} onChange={e => set('enrollmentDate', e.target.value)} style={inp} />
        </div>

        {/* Date of Birth */}
        <div style={fieldWrap}>
          <label style={labelStyle}>Date of Birth</label>
          <input type="date" value={form.dateOfBirth} onChange={e => set('dateOfBirth', e.target.value)} style={inp} />
        </div>

        {/* Created On */}
        <div style={fieldWrap}>
          <label style={labelStyle}>Created On</label>
          <input type="date" value={form.createdOn} onChange={e => set('createdOn', e.target.value)} style={inp} />
        </div>

        {/* Archived On */}
        <div style={fieldWrap}>
          <label style={labelStyle}>Archived On</label>
          <input type="date" value={form.archivedOn} onChange={e => set('archivedOn', e.target.value)} style={inp} />
        </div>

        {/* Guardian Name */}
        <div style={{ ...fieldWrap, gridColumn:'1 / -1' }}>
          <label style={labelStyle}>Guardian Name</label>
          <input type="text" placeholder="Guardian full name..." value={form.guardianName} onChange={e => set('guardianName', e.target.value)} style={inp} />
        </div>

        {/* Guardian Mobile */}
        <div style={fieldWrap}>
          <label style={labelStyle}>Guardian Mobile</label>
          <input type="tel" placeholder="e.g. 0123456789" value={form.guardianMobile} onChange={e => set('guardianMobile', e.target.value)} style={inp} />
        </div>

        {/* Guardian Email */}
        <div style={fieldWrap}>
          <label style={labelStyle}>Guardian Email</label>
          <input type="email" placeholder="guardian@email.com" value={form.guardianEmail} onChange={e => set('guardianEmail', e.target.value)} style={inp} />
        </div>
      </div>

      <div style={{ display:'flex', gap:12, justifyContent:'flex-end', paddingTop:4 }}>
        <button onClick={onClose} style={{ fontSize:13, padding:'9px 20px', borderRadius:8, border:'1px solid var(--border)', background:'transparent', color:'var(--text)', cursor:'pointer' }}>
          Cancel
        </button>
        <button onClick={handleSubmit} disabled={saving} style={{ fontSize:13, padding:'9px 28px', borderRadius:8, border:'none', background:'#4f46e5', color:'#fff', cursor:'pointer', fontWeight:700, opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Saving…' : '+ Submit'}
        </button>
      </div>
    </div>
  );
}

/* ─── Main Modal ─── */
export default function AddArchivedStudentModal({ onClose, onImport }) {
  const [activeTab, setActiveTab]         = useState<'bulk' | 'manual'>('bulk');
  const [defaultBranch, setDefaultBranch] = useState('ONL');

  const tabBtn = (id: 'bulk' | 'manual', label: string) => (
    <button
      onClick={() => setActiveTab(id)}
      style={{
        padding:'8px 24px', fontSize:13, fontWeight:700, cursor:'pointer',
        border:'none', borderBottom: activeTab === id ? '2px solid #4f46e5' : '2px solid transparent',
        background:'transparent', color: activeTab === id ? '#4f46e5' : 'var(--muted)',
        transition:'all 0.15s',
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'var(--panel)', borderRadius:16, boxShadow:'0 25px 50px rgba(0,0,0,0.25)', width:'100%', maxWidth:900, maxHeight:'90vh', display:'flex', flexDirection:'column' }}>

        {/* Header */}
        <div style={{ padding:'16px 24px 0', borderBottom:'1px solid var(--border)' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <h2 style={{ fontSize:17, fontWeight:700, color:'var(--text)', margin:0 }}>Add Archived Students</h2>
            <button onClick={onClose} style={{ background:'none', border:'none', fontSize:22, color:'var(--muted)', cursor:'pointer' }}>&times;</button>
          </div>
          <div style={{ display:'flex', gap:4 }}>
            {tabBtn('bulk',   '📂 Bulk Upload')}
            {tabBtn('manual', '✏️ Manual Entry')}
          </div>
        </div>

        {activeTab === 'bulk'
          ? <BulkUploadTab onImport={onImport} onClose={onClose} defaultBranch={defaultBranch} setDefaultBranch={setDefaultBranch} />
          : <ManualEntryTab onImport={onImport} onClose={onClose} />
        }
      </div>
    </div>
  );
}
