import { useState, useRef } from 'react';
import { BRANCHES, GRADES, CHAPTERS } from '../../lib/studentTypes';
import { getFaCount, getPcmCount } from '../../lib/studentFaLogic';
import { parseExcelFile, generateId } from '../../lib/studentExcelParser';
import { usePreviewUpload, useConfirmUpload } from '../../hooks/useStudentUpload';
import type { PreviewResponse, ConfirmResponse } from '../../api/studentUpload';
import UploadConfirmationModal from '../UploadConfirmationModal';

const sel = { fontSize:11, border:'1px solid var(--border)', borderRadius:6, padding:'4px 8px', background:'var(--bg)', color:'var(--text)', outline:'none' };
const inp = { fontSize:13, border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', background:'var(--bg)', color:'var(--text)', outline:'none', width:'100%', boxSizing:'border-box' as const };

const SORTED_BRANCHES = [...BRANCHES].sort();

function emptyForm() {
  return { name:'', gender:'Male', status:'Active', branch:'AMP', coachName:'', enrollmentDate:'', grade:'G1', chapter:'C1', guardianName:'', guardianMobile:'' };
}

/* ─── Bulk Upload Tab ─── */
function BulkUploadTab({ onBulkComplete, onClose }: { onBulkComplete: (counts: ConfirmResponse) => Promise<void> | void; onClose: () => void }) {
  const [step, setStep]               = useState('upload');
  const [preview, setPreview]         = useState<any[]>([]);
  const [defaultBranch, setDefaultBranch] = useState('ONL');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [fileName, setFileName]       = useState('');
  const fileInputRef                  = useRef<HTMLInputElement>(null);

  const previewMutation = usePreviewUpload();
  const confirmMutation = useConfirmUpload();
  const [previewResp, setPreviewResp] = useState<PreviewResponse | null>(null);

  async function handleFile(file: any) {
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

  function updateRow(tempId: any, field: any, value: any) {
    setPreview(prev => prev.map(r => r.tempId === tempId ? { ...r, [field]: value } : r));
  }

  function removeRow(tempId: any) {
    setPreview(prev => { const next = prev.filter(r => r.tempId !== tempId); if (!next.length) setStep('upload'); return next; });
  }

  async function handleSave() {
    setError('');
    try {
      const rows = preview.map(({ tempId, ...rest }) => rest);
      const resp = await previewMutation.mutateAsync({ rows, branch: defaultBranch });
      setPreviewResp(resp);
    } catch (err: any) {
      setError(err?.data?.error || err?.message || 'Failed to preview upload.');
    }
  }

  async function handleConfirm() {
    if (!previewResp) return;
    try {
      const result = await confirmMutation.mutateAsync({ categorized: previewResp.payload, branch: defaultBranch });
      setPreviewResp(null);
      await onBulkComplete(result);
      onClose();
    } catch (err: any) {
      setError(err?.data?.error || err?.message || 'Failed to apply upload.');
    }
  }

  function handleCancelConfirmation() {
    if (confirmMutation.isPending) return;
    setPreviewResp(null);
  }

  if (step === 'preview') {
    const isPreviewing = previewMutation.isPending;
    const isConfirming = confirmMutation.isPending;
    return (
      <>
        {previewResp && (
          <UploadConfirmationModal
            preview={previewResp}
            onConfirm={handleConfirm}
            onCancel={handleCancelConfirmation}
            isLoading={isConfirming}
          />
        )}
        <div style={{ overflowY:'auto', flex:1, padding:16 }}>
          <p style={{ fontSize:11, color:'var(--muted)', margin:'0 0 12px' }}>
            <span style={{ color:'#22c55e', fontWeight:700 }}>✓ {fileName}</span> — {preview.length} rows extracted · branch <strong style={{ color:'#6366f1' }}>{defaultBranch}</strong>
          </p>
          <div style={{ overflowX:'auto' }}>
            <table style={{ minWidth:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ background:'var(--bg)' }}>
                  {['#','Name','Gender','Branch','Coach Name','Enrollment Date','Status','Grade','Chapter','FA Count','Guardian Name','Guardian Mobile',''].map(h => (
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
                    <td style={{ padding:'8px 12px' }}><select value={row.branch} onChange={e => updateRow(row.tempId,'branch',e.target.value)} style={sel}>{SORTED_BRANCHES.map(b=><option key={b} value={b}>{b}</option>)}</select></td>
                    <td style={{ padding:'8px 12px' }}><input type="text" value={row.coachName||''} placeholder="—" onChange={e => updateRow(row.tempId,'coachName',e.target.value)} style={{ ...sel, width:120 }} /></td>
                    <td style={{ padding:'8px 12px', color:'var(--muted)', whiteSpace:'nowrap', fontSize:11 }}>{row.enrollmentDate||'—'}</td>
                    <td style={{ padding:'8px 12px' }}><span style={{ fontSize:11, padding:'2px 8px', borderRadius:99, fontWeight:600, background: row.status==='Active'?'rgba(34,197,94,0.15)':'rgba(239,68,68,0.12)', color: row.status==='Active'?'#16a34a':'#dc2626' }}>{row.status}</span></td>
                    <td style={{ padding:'8px 12px' }}><select value={row.grade} onChange={e => updateRow(row.tempId,'grade',e.target.value)} style={sel}>{GRADES.map(g=><option key={g} value={g}>{g}</option>)}</select></td>
                    <td style={{ padding:'8px 12px' }}><select value={row.chapter} onChange={e => updateRow(row.tempId,'chapter',e.target.value)} style={sel}>{CHAPTERS.map(c=><option key={c} value={c}>{c}</option>)}</select></td>
                    <td style={{ padding:'8px 12px', color:'#6366f1', fontWeight:600, whiteSpace:'nowrap' }}>{getFaCount(row.grade, row.chapter)} FA</td>
                    <td style={{ padding:'8px 12px', whiteSpace:'nowrap', fontSize:11, color: row.guardianName ? 'var(--text)' : 'var(--muted)', fontStyle: row.guardianName ? 'normal' : 'italic' }}>{row.guardianName || '—'}</td>
                    <td style={{ padding:'8px 12px', whiteSpace:'nowrap', fontSize:11, color: row.guardianMobile ? 'var(--text)' : 'var(--muted)', fontStyle: row.guardianMobile ? 'normal' : 'italic' }}>{row.guardianMobile || '—'}</td>
                    <td style={{ padding:'8px 12px' }}><button onClick={() => removeRow(row.tempId)} style={{ background:'none', border:'none', color:'#ef4444', fontSize:18, cursor:'pointer' }}>&times;</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div style={{ padding:'16px 24px', borderTop:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <button onClick={() => { setStep('upload'); setFileName(''); setPreview([]); }} disabled={isPreviewing || isConfirming} style={{ fontSize:13, color:'var(--muted)', background:'none', border:'none', cursor: (isPreviewing || isConfirming) ? 'not-allowed' : 'pointer', textDecoration:'underline', opacity: (isPreviewing || isConfirming) ? 0.4 : 1 }}>← Upload different file</button>
          {error && <p style={{ fontSize:12, color:'#dc2626', margin:0, flex:1, textAlign:'center' }}>{error}</p>}
          <div style={{ display:'flex', gap:12 }}>
            <button onClick={onClose} disabled={isPreviewing || isConfirming} style={{ fontSize:13, padding:'8px 16px', borderRadius:8, border:'1px solid var(--border)', background:'transparent', color:'var(--text)', cursor: (isPreviewing || isConfirming) ? 'not-allowed' : 'pointer', opacity: (isPreviewing || isConfirming) ? 0.5 : 1 }}>Cancel</button>
            <button onClick={handleSave} disabled={isPreviewing || isConfirming} style={{ fontSize:13, padding:'8px 24px', borderRadius:8, border:'none', background:'#4f46e5', color:'#fff', cursor: (isPreviewing || isConfirming) ? 'not-allowed' : 'pointer', fontWeight:600, opacity: (isPreviewing || isConfirming) ? 0.7 : 1 }}>{isPreviewing ? 'Analyzing…' : `Review ${preview.length} Student${preview.length!==1?'s':''}`}</button>
          </div>
        </div>
      </>
    );
  }

  return (
    <div style={{ padding:24, overflowY:'auto', display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ background:'rgba(99,102,241,0.08)', border:'1px solid rgba(99,102,241,0.2)', borderRadius:10, padding:16, fontSize:12 }}>
        <p style={{ fontWeight:700, color:'#6366f1', margin:'0 0 10px' }}>What will be extracted from the "Students" sheet:</p>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
          {[['Column B','Name'],['Column C','Gender'],['Column M','Enrollment Date'],['Column N','Status'],['Column Q','Guardian Name'],['Column S','Guardian Mobile']].map(([col,label]) => (
            <span key={col} style={{ background:'rgba(99,102,241,0.15)', borderRadius:6, padding:'4px 10px', color:'#6366f1' }}>{col} → {label}</span>
          ))}
        </div>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <span style={{ fontSize:13, fontWeight:600, color:'var(--text)', whiteSpace:'nowrap' }}>Default Branch:</span>
        <select value={defaultBranch} onChange={e => setDefaultBranch(e.target.value)} style={{ ...sel, padding:'6px 12px', fontSize:13 }}>
          {SORTED_BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
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
  );
}

/* ─── Manual Entry Tab ─── */
function ManualEntryTab({ onAdd, onClose }) {
  const [form, setForm]       = useState(emptyForm());
  const [success, setSuccess] = useState(false);
  const [error, setError]     = useState('');

  const faCount  = getFaCount(form.grade, form.chapter);
  const pcmCount = getPcmCount(form.grade, form.chapter);

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function handleSubmit() {
    if (!form.name.trim()) { setError('Name is required.'); return; }
    const student = {
      id:             generateId(),
      name:           form.name.trim(),
      gender:         form.gender,
      status:         form.status,
      branch:         form.branch,
      coachName:      String(form.coachName || '').trim(),
      enrollmentDate: form.enrollmentDate,
      grade:          form.grade,
      chapter:        form.chapter,
      faAttended:     Array(faCount).fill(false),
      pcmAttended:    Array(pcmCount).fill(false),
      guardianName:   String(form.guardianName || '').trim(),
      guardianMobile: String(form.guardianMobile || '').trim(),
    };
    onAdd([student]);
    setForm(emptyForm());
    setError('');
    setSuccess(true);
    setTimeout(() => setSuccess(false), 2500);
  }

  const labelStyle = { fontSize:12, fontWeight:600, color:'var(--muted)', textTransform:'uppercase' as const, letterSpacing:0.5, marginBottom:4, display:'block' };
  const fieldWrap  = { display:'flex', flexDirection:'column' as const, gap:4 };

  return (
    <div style={{ padding:24, overflowY:'auto', display:'flex', flexDirection:'column', gap:20, flex:1 }}>
      {success && (
        <div style={{ background:'rgba(34,197,94,0.12)', border:'1px solid rgba(34,197,94,0.3)', borderRadius:8, padding:'10px 16px', fontSize:13, fontWeight:600, color:'#16a34a' }}>
          ✅ Student added successfully! Form cleared — add another.
        </div>
      )}
      {error && (
        <div style={{ background:'rgba(220,38,38,0.08)', border:'1px solid rgba(220,38,38,0.2)', borderRadius:8, padding:'10px 16px', fontSize:13, color:'#dc2626' }}>
          {error}
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        {/* Name */}
        <div style={{ ...fieldWrap, gridColumn:'1 / -1' }}>
          <label style={labelStyle}>Name</label>
          <input
            type="text" placeholder="Full name..." value={form.name}
            onChange={e => set('name', e.target.value)}
            style={inp}
          />
        </div>

        {/* Gender */}
        <div style={fieldWrap}>
          <label style={labelStyle}>Gender</label>
          <select value={form.gender} onChange={e => set('gender', e.target.value)} style={{ ...inp, cursor:'pointer' }}>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>
        </div>

        {/* Status */}
        <div style={fieldWrap}>
          <label style={labelStyle}>Status</label>
          <select value={form.status} onChange={e => set('status', e.target.value)} style={{ ...inp, cursor:'pointer' }}>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>

        {/* Branch */}
        <div style={fieldWrap}>
          <label style={labelStyle}>Branch</label>
          <select value={form.branch} onChange={e => set('branch', e.target.value)} style={{ ...inp, cursor:'pointer' }}>
            {SORTED_BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>

        {/* Coach Name */}
        <div style={fieldWrap}>
          <label style={labelStyle}>Coach Name <span style={{ color:'var(--muted)', fontWeight:400 }}>(optional)</span></label>
          <input
            type="text"
            placeholder="e.g., Coach Lim"
            value={form.coachName || ''}
            onChange={e => set('coachName', e.target.value)}
            style={inp}
          />
        </div>

        {/* Enrollment Date */}
        <div style={fieldWrap}>
          <label style={labelStyle}>Enrollment Date</label>
          <input
            type="date" value={form.enrollmentDate}
            onChange={e => set('enrollmentDate', e.target.value)}
            style={inp}
          />
        </div>

        {/* Grade */}
        <div style={fieldWrap}>
          <label style={labelStyle}>Grade</label>
          <select value={form.grade} onChange={e => set('grade', e.target.value)} style={{ ...inp, cursor:'pointer' }}>
            {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        {/* Chapter */}
        <div style={fieldWrap}>
          <label style={labelStyle}>Chapter</label>
          <select value={form.chapter} onChange={e => set('chapter', e.target.value)} style={{ ...inp, cursor:'pointer' }}>
            {CHAPTERS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Guardian Name */}
        <div style={fieldWrap}>
          <label style={labelStyle}>Guardian Name <span style={{ color:'var(--muted)', fontWeight:400 }}>(optional)</span></label>
          <input
            type="text"
            placeholder="e.g., Aisha Mum"
            value={form.guardianName || ''}
            onChange={e => set('guardianName', e.target.value)}
            style={inp}
          />
        </div>

        {/* Guardian Mobile */}
        <div style={fieldWrap}>
          <label style={labelStyle}>Guardian Mobile <span style={{ color:'var(--muted)', fontWeight:400 }}>(optional)</span></label>
          <input
            type="text"
            placeholder="e.g., 0123456789"
            value={form.guardianMobile || ''}
            onChange={e => set('guardianMobile', e.target.value)}
            style={inp}
          />
        </div>
      </div>

      {/* FA / PCM Preview */}
      <div style={{ display:'flex', gap:12 }}>
        <div style={{ flex:1, background:'rgba(99,102,241,0.08)', border:'1px solid rgba(99,102,241,0.2)', borderRadius:8, padding:'10px 16px', textAlign:'center' }}>
          <div style={{ fontSize:20, fontWeight:800, color:'#6366f1' }}>{faCount}</div>
          <div style={{ fontSize:11, color:'var(--muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:0.5 }}>FA Sessions</div>
        </div>
        <div style={{ flex:1, background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:8, padding:'10px 16px', textAlign:'center' }}>
          <div style={{ fontSize:20, fontWeight:800, color:'#d97706' }}>{pcmCount}</div>
          <div style={{ fontSize:11, color:'var(--muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:0.5 }}>PCM Sessions</div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ display:'flex', gap:12, justifyContent:'flex-end', marginTop:'auto' }}>
        <button onClick={onClose} style={{ fontSize:13, padding:'9px 20px', borderRadius:8, border:'1px solid var(--border)', background:'transparent', color:'var(--text)', cursor:'pointer' }}>
          Cancel
        </button>
        <button onClick={handleSubmit} style={{ fontSize:13, padding:'9px 28px', borderRadius:8, border:'none', background:'#4f46e5', color:'#fff', cursor:'pointer', fontWeight:700 }}>
          + Submit Student
        </button>
      </div>
    </div>
  );
}

/* ─── Main Modal ─── */
type AddStudentModalProps = {
  onClose: () => void;
  onAdd: (students: any[]) => void;
  onBulkComplete: (counts: ConfirmResponse) => Promise<void> | void;
};

export default function AddStudentModal({ onClose, onAdd, onBulkComplete }: AddStudentModalProps) {
  const [activeTab, setActiveTab] = useState<'bulk' | 'manual'>('bulk');

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
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'var(--panel)', borderRadius:16, boxShadow:'0 25px 50px rgba(0,0,0,0.25)', width:'100%', maxWidth:900, maxHeight:'90vh', display:'flex', flexDirection:'column' }}>

        {/* Header */}
        <div style={{ padding:'16px 24px 0', borderBottom:'1px solid var(--border)' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <h2 style={{ fontSize:18, fontWeight:700, color:'var(--text)', margin:0 }}>Add Students</h2>
            <button onClick={onClose} style={{ background:'none', border:'none', fontSize:24, color:'var(--muted)', cursor:'pointer' }}>&times;</button>
          </div>
          {/* Tabs */}
          <div style={{ display:'flex', gap:4 }}>
            {tabBtn('bulk',   '📂 Bulk Upload')}
            {tabBtn('manual', '✏️ Manual Entry')}
          </div>
        </div>

        {activeTab === 'bulk'
          ? <BulkUploadTab onBulkComplete={onBulkComplete} onClose={onClose} />
          : <ManualEntryTab onAdd={onAdd} onClose={onClose} />
        }
      </div>
    </div>
  );
}
