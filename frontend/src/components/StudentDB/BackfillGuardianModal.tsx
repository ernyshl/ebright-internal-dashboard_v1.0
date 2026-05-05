import { useState, useRef } from 'react';
import { BRANCHES } from '../../lib/studentTypes';
import { parseExcelFile } from '../../lib/studentExcelParser';
import { backfillGuardian } from '../../api/guardianBackfill';
import type { BackfillResponse } from '../../api/guardianBackfill';

const SORTED_BRANCHES = [...BRANCHES].sort();

type Props = {
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
};

type Step = 'upload' | 'preview' | 'success';

type ParsedRow = { name: string; guardianName: string; guardianMobile: string };

type Section = {
  key: 'updated' | 'alreadyFilled' | 'notFound';
  title: (n: number) => string;
  hint: string;
  color: string;
  bg: string;
  icon: string;
};

const SECTIONS: Section[] = [
  { key: 'updated',       title: n => `${n} student${n === 1 ? '' : 's'} updated with guardian info`,           hint: 'Empty fields filled — existing values preserved.',          color: '#16a34a', bg: 'rgba(34,197,94,0.10)',  icon: '✅' },
  { key: 'alreadyFilled', title: n => `${n} student${n === 1 ? '' : 's'} already had guardian info`,            hint: 'Both guardian fields were already populated. Skipped.',     color: '#64748b', bg: 'rgba(100,116,139,0.10)',icon: '⏭️' },
  { key: 'notFound',      title: n => `${n} student${n === 1 ? '' : 's'} from Excel not found in database`,     hint: 'Name + branch combo did not match any existing student.',   color: '#d97706', bg: 'rgba(245,158,11,0.10)', icon: '⚠️' },
];

export default function BackfillGuardianModal({ onClose, onSuccess }: Props) {
  const [step, setStep] = useState<Step>('upload');
  const [branch, setBranch] = useState('ONL');
  const [fileName, setFileName] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<BackfillResponse | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({ updated: false, alreadyFilled: false, notFound: false });
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: any) {
    if (!file) return;
    const ext = String(file.name || '').split('.').pop()?.toLowerCase();
    if (ext !== 'xlsx' && ext !== 'xls') {
      setError('Please upload an Excel file (.xlsx or .xls)');
      return;
    }
    setError('');
    setLoading(true);
    setFileName(file.name);
    try {
      const rows = await parseExcelFile(file, branch);
      const filtered: ParsedRow[] = rows
        .map((r: any) => ({
          name: String(r?.name ?? '').trim(),
          guardianName: String(r?.guardianName ?? '').trim(),
          guardianMobile: String(r?.guardianMobile ?? '').trim(),
        }))
        .filter((r: ParsedRow) => r.name.length > 0);
      if (filtered.length === 0) {
        setError('No valid rows found in this file. Check Column B (Name).');
        setLoading(false);
        return;
      }
      setParsedRows(filtered);
      setStep('preview');
    } catch {
      setError('Failed to read the file.');
    }
    setLoading(false);
  }

  async function handleConfirm() {
    setError('');
    setLoading(true);
    try {
      const resp = await backfillGuardian(parsedRows, branch);
      setResult(resp);
      setStep('success');
      await onSuccess();
    } catch (err: any) {
      setError(err?.data?.error || err?.message || 'Backfill failed.');
    }
    setLoading(false);
  }

  function toggle(key: string) {
    setOpen(prev => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:60, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'var(--panel)', borderRadius:16, boxShadow:'0 25px 50px rgba(0,0,0,0.25)', width:'100%', maxWidth:560, maxHeight:'90vh', display:'flex', flexDirection:'column' }}>

        {/* Header */}
        <div style={{ padding:'16px 24px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <h2 style={{ fontSize:18, fontWeight:700, color:'var(--text)', margin:0 }}>🔧 Backfill Guardian Info</h2>
          <button onClick={onClose} disabled={loading} style={{ background:'none', border:'none', fontSize:24, color:'var(--muted)', cursor:loading?'not-allowed':'pointer', lineHeight:1, opacity:loading?0.4:1 }}>&times;</button>
        </div>

        {/* Body */}
        {step === 'upload' && (
          <div style={{ padding:24, overflowY:'auto', display:'flex', flexDirection:'column', gap:16 }}>
            <div style={{ background:'rgba(99,102,241,0.08)', border:'1px solid rgba(99,102,241,0.2)', borderRadius:10, padding:16, fontSize:12 }}>
              <p style={{ fontWeight:700, color:'#6366f1', margin:'0 0 10px' }}>What this does:</p>
              <ul style={{ margin:0, paddingLeft:20, color:'var(--text)', display:'flex', flexDirection:'column', gap:4 }}>
                <li>Reads <strong>Column B</strong> (Name), <strong>Column Q</strong> (Guardian Name), <strong>Column S</strong> (Guardian Mobile) from your Excel.</li>
                <li>Matches each row to a student by <strong>Name + Branch</strong>.</li>
                <li>Fills only the empty guardian fields. <strong>Existing values are preserved.</strong></li>
                <li>Only updates students in the selected branch.</li>
              </ul>
            </div>

            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <span style={{ fontSize:13, fontWeight:600, color:'var(--text)', whiteSpace:'nowrap' }}>Branch:</span>
              <select value={branch} onChange={e => setBranch(e.target.value)} style={{ fontSize:13, border:'1px solid var(--border)', borderRadius:8, padding:'6px 12px', background:'var(--bg)', color:'var(--text)', outline:'none' }}>
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
               : <><p style={{ fontSize:14, fontWeight:600, color:'var(--text)', margin:'0 0 4px' }}>Click to browse or drag &amp; drop</p><p style={{ fontSize:12, color:'var(--muted)', margin:0 }}>.xlsx or .xls files only</p></>}
            </div>

            {error && <p style={{ fontSize:12, color:'#dc2626', background:'rgba(220,38,38,0.08)', border:'1px solid rgba(220,38,38,0.2)', borderRadius:8, padding:'10px 16px', margin:0 }}>{error}</p>}
          </div>
        )}

        {step === 'preview' && (
          <>
            <div style={{ padding:20, overflowY:'auto', flex:1, display:'flex', flexDirection:'column', gap:12 }}>
              <p style={{ fontSize:13, color:'var(--text)', margin:0 }}>
                <span style={{ color:'#22c55e', fontWeight:700 }}>✓ {fileName}</span>
                {' — '}<strong style={{ color:'#6366f1' }}>{parsedRows.length}</strong> row{parsedRows.length === 1 ? '' : 's'} ready to process for branch <strong style={{ color:'#6366f1' }}>{branch}</strong>
              </p>

              <div style={{ overflowX:'auto', maxHeight:340, overflowY:'auto', border:'1px solid var(--border)', borderRadius:8 }}>
                <table style={{ minWidth:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead>
                    <tr style={{ background:'var(--bg)', position:'sticky', top:0 }}>
                      {['#', 'Name', 'Guardian Name', 'Guardian Mobile'].map(h => (
                        <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.slice(0, 100).map((row, idx) => (
                      <tr key={idx} style={{ borderTop:'1px solid var(--border)' }}>
                        <td style={{ padding:'8px 12px', color:'var(--muted)', fontSize:11 }}>{idx + 1}</td>
                        <td style={{ padding:'8px 12px', fontWeight:600, color:'var(--text)' }}>{row.name}</td>
                        <td style={{ padding:'8px 12px', color:row.guardianName?'var(--text)':'var(--muted)', fontStyle:row.guardianName?'normal':'italic' }}>{row.guardianName || '—'}</td>
                        <td style={{ padding:'8px 12px', color:row.guardianMobile?'var(--text)':'var(--muted)', fontStyle:row.guardianMobile?'normal':'italic' }}>{row.guardianMobile || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsedRows.length > 100 && (
                  <div style={{ padding:'8px 12px', fontSize:11, color:'var(--muted)', textAlign:'center', borderTop:'1px solid var(--border)' }}>
                    + {parsedRows.length - 100} more row{parsedRows.length - 100 === 1 ? '' : 's'} (preview limited to 100)
                  </div>
                )}
              </div>

              {error && <p style={{ fontSize:12, color:'#dc2626', background:'rgba(220,38,38,0.08)', border:'1px solid rgba(220,38,38,0.2)', borderRadius:8, padding:'10px 16px', margin:0 }}>{error}</p>}
            </div>
            <div style={{ padding:'14px 24px', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <button
                onClick={() => { setStep('upload'); setParsedRows([]); setFileName(''); setError(''); }}
                disabled={loading}
                style={{ fontSize:13, color:'var(--muted)', background:'none', border:'none', cursor:loading?'not-allowed':'pointer', textDecoration:'underline', opacity:loading?0.4:1 }}
              >← Upload different file</button>
              <div style={{ display:'flex', gap:12 }}>
                <button onClick={onClose} disabled={loading} style={{ fontSize:13, padding:'8px 18px', borderRadius:8, border:'1px solid var(--border)', background:'transparent', color:'var(--text)', cursor:loading?'not-allowed':'pointer', opacity:loading?0.5:1 }}>Cancel</button>
                <button onClick={handleConfirm} disabled={loading} style={{ fontSize:13, padding:'8px 22px', borderRadius:8, border:'none', background:'#4f46e5', color:'#fff', cursor:loading?'not-allowed':'pointer', fontWeight:700, opacity:loading?0.7:1 }}>
                  {loading ? 'Processing…' : `Backfill ${parsedRows.length} student${parsedRows.length === 1 ? '' : 's'}`}
                </button>
              </div>
            </div>
          </>
        )}

        {step === 'success' && result && (
          <>
            <div style={{ padding:20, overflowY:'auto', display:'flex', flexDirection:'column', gap:10 }}>
              <p style={{ fontSize:12, color:'var(--muted)', margin:'0 0 4px' }}>
                Processed <strong style={{ color:'var(--text)' }}>{result.totalRows}</strong> row{result.totalRows === 1 ? '' : 's'} for branch <strong style={{ color:'#6366f1' }}>{branch}</strong>.
              </p>

              {SECTIONS.map(s => {
                const count =
                  s.key === 'updated' ? result.updated :
                  s.key === 'alreadyFilled' ? result.alreadyFilled :
                  result.notFound;
                const names =
                  s.key === 'updated' ? result.details.updatedNames :
                  s.key === 'alreadyFilled' ? result.details.alreadyFilledNames :
                  result.details.notFoundNames;
                const isOpen = !!open[s.key];
                const isEmpty = count === 0;
                return (
                  <div key={s.key} style={{ border:`1px solid ${s.color}33`, background:isEmpty?'var(--bg)':s.bg, borderRadius:10, overflow:'hidden', opacity:isEmpty?0.55:1 }}>
                    <button
                      onClick={() => !isEmpty && toggle(s.key)}
                      disabled={isEmpty}
                      style={{ width:'100%', textAlign:'left', padding:'10px 14px', background:'transparent', border:'none', cursor:isEmpty?'default':'pointer', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}
                    >
                      <span style={{ display:'flex', flexDirection:'column', gap:2 }}>
                        <span style={{ fontSize:13, fontWeight:700, color:s.color }}>{s.icon} {s.title(count)}</span>
                        <span style={{ fontSize:11, color:'var(--muted)' }}>{s.hint}</span>
                      </span>
                      {!isEmpty && (
                        <span style={{ fontSize:11, fontWeight:700, color:s.color, whiteSpace:'nowrap' }}>{isOpen ? '▾ Hide' : '▸ Show'}</span>
                      )}
                    </button>
                    {isOpen && !isEmpty && (
                      <div style={{ borderTop:`1px solid ${s.color}33`, padding:'8px 14px 12px', background:'var(--panel)' }}>
                        <ul style={{ margin:0, paddingLeft:20, fontSize:12, color:'var(--text)', display:'flex', flexDirection:'column', gap:2, maxHeight:180, overflowY:'auto' }}>
                          {names.map((n, i) => <li key={`${s.key}-${i}`}>{n}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}

              {result.skipped > 0 && (
                <div style={{ border:'1px solid var(--border)', background:'var(--bg)', borderRadius:10, padding:'10px 14px' }}>
                  <span style={{ fontSize:13, fontWeight:700, color:'var(--muted)' }}>⏭️ {result.skipped} row{result.skipped === 1 ? '' : 's'} skipped (no data to backfill)</span>
                </div>
              )}
            </div>
            <div style={{ padding:'14px 24px', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'flex-end' }}>
              <button onClick={onClose} style={{ fontSize:13, padding:'8px 28px', borderRadius:8, border:'none', background:'#4f46e5', color:'#fff', cursor:'pointer', fontWeight:700 }}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
