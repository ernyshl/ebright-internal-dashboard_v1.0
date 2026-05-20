import { useState, useRef, useMemo } from 'react';
import { apiFetch } from '../../lib/api';
import { parsePackageExcelFile, type PackageRow } from '../../lib/studentPackageParser';

type Student = { id: number; name: string; branch: string; packageStatus?: string; creditExpiryDate?: string };

type PreviewMatch = PackageRow & { studentId: number; branch: string };
type PreviewResponse = { matched: PreviewMatch[]; unmatched: PackageRow[]; totalUploaded: number };

type AddPackageModalProps = {
  students: Student[];
  onClose: () => void;
  onComplete: (successMessage?: string) => Promise<void> | void;
};

const inp = { fontSize: 13, border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', background: 'var(--bg)', color: 'var(--text)', outline: 'none', width: '100%', boxSizing: 'border-box' as const };
const labelStyle = { fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 4, display: 'block' };

/* ─── Bulk Upload Tab ─── */
function BulkUploadTab({ onComplete, onClose }: { onComplete: (successMessage?: string) => Promise<void> | void; onClose: () => void }) {
  const [step, setStep] = useState<'upload' | 'preview'>('upload');
  const [parsedRows, setParsedRows] = useState<PackageRow[]>([]);
  const [previewResp, setPreviewResp] = useState<PreviewResponse | null>(null);
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'xlsx' && ext !== 'xls') { setError('Please upload an Excel file (.xlsx or .xls)'); return; }
    setError(''); setFileName(file.name); setLoading(true);
    try {
      const rows = await parsePackageExcelFile(file);
      if (rows.length === 0) { setError('No valid rows found. Check Column B (Student Name), G (Package Status), M (Credit Expiry Date).'); setLoading(false); return; }
      const resp = await apiFetch('/api/student-packages/preview', { method: 'POST', body: { rows } });
      setParsedRows(rows);
      setPreviewResp(resp as PreviewResponse);
      setStep('preview');
    } catch (err: any) {
      setError(err?.data?.error || err?.message || 'Failed to read or preview file.');
    }
    setLoading(false);
  }

  const matched = previewResp ? previewResp.matched : [];

  async function handleConfirm() {
    if (!previewResp || matched.length === 0) return;
    setConfirming(true); setError('');
    try {
      const rows = matched.map(m => ({ studentId: m.studentId, packageStatus: m.packageStatus, creditExpiryDate: m.creditExpiryDate }));
      const result: any = await apiFetch('/api/student-packages/confirm', { method: 'POST', body: { rows } });
      const count = result?.updated ?? rows.length;
      await onComplete(`Updated ${count} student${count !== 1 ? 's' : ''} with package info.`);
      onClose();
    } catch (err: any) {
      setError(err?.data?.error || err?.message || 'Failed to apply update.');
    }
    setConfirming(false);
  }

  if (step === 'preview' && previewResp) {
    return (
      <>
        <div style={{ overflowY: 'auto', flex: 1, padding: 16 }}>
          <p style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 12px' }}>
            <span style={{ color: '#22c55e', fontWeight: 700 }}>✓ {fileName}</span> · {parsedRows.length} unique students parsed (deduped by name, keeping the most recent package row)
          </p>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 1, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 10, padding: '10px 14px' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#16a34a' }}>{matched.length}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', textTransform: 'uppercase' }}>Will update</div>
            </div>
            <div style={{ flex: 1, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 10, padding: '10px 14px' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#d97706' }}>{previewResp.unmatched.length}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#d97706', textTransform: 'uppercase' }}>No match in Student DB</div>
            </div>
          </div>

          {matched.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: '0 0 8px' }}>Matched rows</h4>
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)' }}>
                      {['#', 'Name', 'Branch', 'Package Status', 'Credit Expiry Date'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matched.slice(0, 200).map((m, i) => (
                      <tr key={`${m.studentId}-${i}`} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '6px 12px', color: 'var(--muted)' }}>{i + 1}</td>
                        <td style={{ padding: '6px 12px', fontWeight: 600, color: 'var(--text)' }}>{m.name}</td>
                        <td style={{ padding: '6px 12px' }}><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: 'rgba(99,102,241,0.1)', color: '#6366f1', fontWeight: 600 }}>{m.branch}</span></td>
                        <td style={{ padding: '6px 12px', color: 'var(--text)' }}>{m.packageStatus || <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>—</span>}</td>
                        <td style={{ padding: '6px 12px', color: 'var(--text)' }}>{m.creditExpiryDate || <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {matched.length > 200 && (
                  <p style={{ fontSize: 11, color: 'var(--muted)', padding: '8px 12px', margin: 0, borderTop: '1px solid var(--border)', textAlign: 'center' }}>… and {matched.length - 200} more</p>
                )}
              </div>
            </div>
          )}

          {previewResp.unmatched.length > 0 && (
            <div>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: '#d97706', margin: '0 0 8px' }}>Unmatched (not in Student DB — will be skipped)</h4>
              <div style={{ border: '1px solid rgba(245,158,11,0.25)', borderRadius: 8, overflow: 'hidden', background: 'rgba(245,158,11,0.04)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'rgba(245,158,11,0.08)' }}>
                      {['#', 'Name', 'Package Status', 'Credit Expiry Date'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#d97706', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewResp.unmatched.slice(0, 100).map((m, i) => (
                      <tr key={`u-${i}`} style={{ borderTop: '1px solid rgba(245,158,11,0.15)' }}>
                        <td style={{ padding: '6px 12px', color: 'var(--muted)' }}>{i + 1}</td>
                        <td style={{ padding: '6px 12px', color: 'var(--text)' }}>{m.name}</td>
                        <td style={{ padding: '6px 12px', color: 'var(--text)' }}>{m.packageStatus || '—'}</td>
                        <td style={{ padding: '6px 12px', color: 'var(--text)' }}>{m.creditExpiryDate || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {previewResp.unmatched.length > 100 && (
                  <p style={{ fontSize: 11, color: 'var(--muted)', padding: '8px 12px', margin: 0 }}>… and {previewResp.unmatched.length - 100} more</p>
                )}
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={() => { setStep('upload'); setFileName(''); setParsedRows([]); setPreviewResp(null); }} disabled={confirming} style={{ fontSize: 13, color: 'var(--muted)', background: 'none', border: 'none', cursor: confirming ? 'not-allowed' : 'pointer', textDecoration: 'underline' }}>← Upload different file</button>
          {error && <p style={{ fontSize: 12, color: '#dc2626', margin: 0, flex: 1, textAlign: 'center' }}>{error}</p>}
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={onClose} disabled={confirming} style={{ fontSize: 13, padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: confirming ? 'not-allowed' : 'pointer' }}>Cancel</button>
            <button onClick={handleConfirm} disabled={confirming || matched.length === 0} style={{ fontSize: 13, padding: '8px 24px', borderRadius: 8, border: 'none', background: '#4f46e5', color: '#fff', cursor: (confirming || matched.length === 0) ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: matched.length === 0 ? 0.4 : 1 }}>
              {confirming ? 'Saving…' : `Update ${matched.length} Student${matched.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <div style={{ padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10, padding: 16, fontSize: 12 }}>
        <p style={{ fontWeight: 700, color: '#6366f1', margin: '0 0 10px' }}>What will be extracted from the "Package Credits" sheet:</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {[['Column B', 'Student Name'], ['Column G', 'Package Status'], ['Column M', 'Credit Expiry Date']].map(([col, label]) => (
            <span key={col} style={{ background: 'rgba(99,102,241,0.15)', borderRadius: 6, padding: '4px 10px', color: '#6366f1' }}>{col} → {label}</span>
          ))}
        </div>
        <p style={{ fontSize: 11, color: 'var(--muted)', margin: '10px 0 0' }}>
          If a student appears multiple times, the first row (most recent package) is used. Matching is by exact name (case-insensitive).
        </p>
      </div>
      <div
        onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]); }}
        onDragOver={e => e.preventDefault()}
        onClick={() => fileInputRef.current?.click()}
        style={{ border: '2px dashed rgba(99,102,241,0.4)', borderRadius: 16, padding: 40, textAlign: 'center', cursor: 'pointer' }}
      >
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={e => handleFile(e.target.files?.[0])} style={{ display: 'none' }} />
        <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
        {loading ? <p style={{ color: '#6366f1', fontSize: 13 }}>Reading file…</p>
         : fileName ? <p style={{ color: '#6366f1', fontWeight: 600, fontSize: 13 }}>{fileName}</p>
         : <><p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: '0 0 4px' }}>Click to browse or drag & drop</p><p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>.xlsx or .xls files only</p></>}
      </div>
      {error && <p style={{ fontSize: 12, color: '#dc2626', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 8, padding: '10px 16px', margin: 0 }}>{error}</p>}
    </div>
  );
}

/* ─── Manual Entry Tab ─── */
function ManualEntryTab({ students, onComplete, onClose }: { students: Student[]; onComplete: (successMessage?: string) => Promise<void> | void; onClose: () => void }) {
  const [studentId, setStudentId] = useState<number | ''>('');
  const [packageStatus, setPackageStatus] = useState('Active');
  const [creditExpiryDate, setCreditExpiryDate] = useState('');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const sortedStudents = useMemo(() => [...students].sort((a, b) => a.name.localeCompare(b.name)), [students]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedStudents;
    return sortedStudents.filter(s => s.name.toLowerCase().includes(q));
  }, [sortedStudents, search]);

  async function handleSubmit() {
    if (!studentId) { setError('Please select a student.'); return; }
    setSaving(true); setError('');
    try {
      await apiFetch(`/api/student-packages/student/${studentId}`, { method: 'PUT', body: { packageStatus, creditExpiryDate } });
      await onComplete();
      setSuccess(true);
      setStudentId(''); setSearch(''); setPackageStatus('Active'); setCreditExpiryDate('');
      setTimeout(() => setSuccess(false), 2500);
    } catch (err: any) {
      setError(err?.data?.error || err?.message || 'Failed to save.');
    }
    setSaving(false);
  }

  return (
    <div style={{ padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
      {success && <div style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, padding: '10px 16px', fontSize: 13, fontWeight: 600, color: '#16a34a' }}>✅ Package info saved. Form cleared.</div>}
      {error && <div style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: '#dc2626' }}>{error}</div>}

      <div>
        <label style={labelStyle}>Search Student</label>
        <input type="text" placeholder="Type to filter…" value={search} onChange={e => setSearch(e.target.value)} style={inp} />
      </div>

      <div>
        <label style={labelStyle}>Student</label>
        <select value={studentId} onChange={e => setStudentId(e.target.value ? parseInt(e.target.value, 10) : '')} style={{ ...inp, cursor: 'pointer' }}>
          <option value="">— Select a student —</option>
          {filtered.slice(0, 500).map(s => (
            <option key={s.id} value={s.id}>{s.name} · {s.branch}</option>
          ))}
        </select>
        {filtered.length > 500 && <p style={{ fontSize: 11, color: 'var(--muted)', margin: '4px 0 0' }}>Showing first 500. Use search to narrow down.</p>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <label style={labelStyle}>Package Status</label>
          <select value={packageStatus} onChange={e => setPackageStatus(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
            <option value="Active">Active</option>
            <option value="Pending">Pending</option>
            <option value="Expired">Expired</option>
            <option value="Unenrolled">Unenrolled</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Credit Expiry Date</label>
          <input type="date" value={creditExpiryDate} onChange={e => setCreditExpiryDate(e.target.value)} style={inp} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 'auto' }}>
        <button onClick={onClose} disabled={saving} style={{ fontSize: 13, padding: '9px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: saving ? 'not-allowed' : 'pointer' }}>Cancel</button>
        <button onClick={handleSubmit} disabled={saving || !studentId} style={{ fontSize: 13, padding: '9px 28px', borderRadius: 8, border: 'none', background: '#4f46e5', color: '#fff', cursor: (saving || !studentId) ? 'not-allowed' : 'pointer', fontWeight: 700, opacity: (!studentId) ? 0.4 : 1 }}>
          {saving ? 'Saving…' : '+ Save Package Info'}
        </button>
      </div>
    </div>
  );
}

/* ─── Main Modal ─── */
export default function AddPackageModal({ students, onClose, onComplete }: AddPackageModalProps) {
  const [activeTab, setActiveTab] = useState<'bulk' | 'manual'>('bulk');

  const tabBtn = (id: 'bulk' | 'manual', label: string) => (
    <button
      onClick={() => setActiveTab(id)}
      style={{
        padding: '8px 24px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
        border: 'none', borderBottom: activeTab === id ? '2px solid #4f46e5' : '2px solid transparent',
        background: 'transparent', color: activeTab === id ? '#4f46e5' : 'var(--muted)',
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--panel)', borderRadius: 16, boxShadow: '0 25px 50px rgba(0,0,0,0.25)', width: '100%', maxWidth: 900, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 24px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Add Student Package</h2>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, color: 'var(--muted)', cursor: 'pointer' }}>&times;</button>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {tabBtn('bulk',   '📦 Bulk Upload')}
            {tabBtn('manual', '✏️ Manual Entry')}
          </div>
        </div>

        {activeTab === 'bulk'
          ? <BulkUploadTab onComplete={onComplete} onClose={onClose} />
          : <ManualEntryTab students={students} onComplete={onComplete} onClose={onClose} />
        }
      </div>
    </div>
  );
}
