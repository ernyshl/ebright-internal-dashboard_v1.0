import { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { BackButton } from '../components/BackButton';
import { BRANCHES } from '../lib/studentTypes';
import { apiFetch } from '../lib/api';
import { parseAttendanceExcelFile, type AttendanceRow } from '../lib/studentAttendanceExcelParser';
import EditAttendanceModal, { type AttendanceRowFull } from '../components/Attendance/EditAttendanceModal';

type StoredRow = AttendanceRow & { branch: string; id?: number };

type BatchSummary = {
  totalRows: number;
  inserted: number;
  duplicates: number;
  promotionsByAction: {
    PROMOTE_CHAPTER: number;
    PROMOTE_GRADE: number;
    TICK_FA: number;
    NO_CHANGE: number;
    SKIP_NOT_ELIGIBLE: number;
    SKIP_NOT_FOUND: number;
    SKIP_INVALID: number;
  };
  warnings: Array<{ row?: any; message: string }>;
};

const SORTED_BRANCHES = [...BRANCHES].sort();

const th: React.CSSProperties = {
  padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700,
  color: 'var(--muted)', textTransform: 'uppercase', whiteSpace: 'nowrap', letterSpacing: 0.5,
};
const td: React.CSSProperties = { padding: '10px 14px', fontSize: 12 };
const sel: React.CSSProperties = {
  fontSize: 13, border: '1px solid var(--border)', borderRadius: 8,
  padding: '6px 12px', background: 'var(--bg)', color: 'var(--text)', outline: 'none',
};
const inp: React.CSSProperties = {
  width: '100%', border: '1px solid var(--border)', borderRadius: 8,
  padding: '8px 12px', fontSize: 13, background: 'var(--bg)', color: 'var(--text)',
  outline: 'none', boxSizing: 'border-box',
};
const lblStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted)',
  marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5,
};

function statusColors(status: string): { bg: string; color: string } {
  const s = (status || '').toLowerCase();
  if (s.includes('attend') || s.includes('present'))            return { bg: 'rgba(34,197,94,0.15)',  color: '#16a34a' };
  if (s.includes('absent'))                                     return { bg: 'rgba(239,68,68,0.12)',  color: '#dc2626' };
  if (s.includes('replace') || s.includes('makeup'))            return { bg: 'rgba(99,102,241,0.12)', color: '#4f46e5' };
  if (s.includes('frozen') || s.includes('freeze'))             return { bg: 'rgba(14,165,233,0.12)', color: '#0284c7' };
  return { bg: 'rgba(100,116,139,0.12)', color: '#475569' };
}

function deriveDay(dateStr: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return '';
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()];
}

/* ─── Import Summary Modal ───────────────────────────────────────────── */
function ImportSummaryModal({ summary, onDone }: { summary: BatchSummary; onDone: () => void }) {
  const [showWarnings, setShowWarnings] = useState(false);
  const p = summary.promotionsByAction;
  const sections: Array<{ icon: string; label: string; count: number; color: string; bg: string }> = [
    { icon: '✅', label: 'students promoted (chapter +1)', count: p.PROMOTE_CHAPTER, color: '#16a34a', bg: 'rgba(34,197,94,0.10)' },
    { icon: '✅', label: 'students promoted (grade +1)',   count: p.PROMOTE_GRADE,   color: '#16a34a', bg: 'rgba(34,197,94,0.10)' },
    { icon: '✅', label: 'students received FA tick',       count: p.TICK_FA,         color: '#2563eb', bg: 'rgba(59,130,246,0.10)' },
    { icon: '⏭️', label: 'recorded (no promotion needed)',  count: p.NO_CHANGE,       color: '#64748b', bg: 'rgba(100,116,139,0.10)' },
    { icon: '⚠️', label: 'duplicates skipped',              count: summary.duplicates, color: '#d97706', bg: 'rgba(245,158,11,0.10)' },
    { icon: '⚠️', label: 'not-eligible (Foundation < C11)', count: p.SKIP_NOT_ELIGIBLE, color: '#d97706', bg: 'rgba(245,158,11,0.10)' },
    { icon: '⚠️', label: 'students not found',              count: p.SKIP_NOT_FOUND,  color: '#d97706', bg: 'rgba(245,158,11,0.10)' },
    { icon: '❌', label: 'invalid rows skipped',             count: p.SKIP_INVALID,   color: '#dc2626', bg: 'rgba(239,68,68,0.10)' },
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--panel)', borderRadius: 16, boxShadow: '0 25px 50px rgba(0,0,0,0.25)', width: '100%', maxWidth: 580, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Upload Summary</h2>
          <button onClick={onDone} style={{ background: 'none', border: 'none', fontSize: 24, color: 'var(--muted)', cursor: 'pointer', lineHeight: 1 }}>&times;</button>
        </div>

        <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#4338ca' }}>
            Processed <strong>{summary.totalRows}</strong> row{summary.totalRows === 1 ? '' : 's'} ·
            inserted <strong>{summary.inserted}</strong> ·
            skipped <strong>{summary.duplicates}</strong> duplicate{summary.duplicates === 1 ? '' : 's'}
          </div>

          {sections.filter(s => s.count > 0).map(s => (
            <div key={s.label} style={{ border: `1px solid ${s.color}33`, background: s.bg, borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 16 }}>{s.icon}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: s.color }}>{s.count}</span>
              <span style={{ fontSize: 13, color: 'var(--text)' }}>{s.label}</span>
            </div>
          ))}

          {sections.every(s => s.count === 0) && summary.warnings.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: 12 }}>No changes recorded.</p>
          )}

          {summary.warnings.length > 0 && (
            <div style={{ border: '1px solid rgba(245,158,11,0.35)', background: 'rgba(245,158,11,0.10)', borderRadius: 10, overflow: 'hidden' }}>
              <button
                onClick={() => setShowWarnings(s => !s)}
                style={{ width: '100%', textAlign: 'left', padding: '10px 14px', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <span style={{ fontSize: 13, fontWeight: 700, color: '#d97706' }}>
                  ⚠️ {summary.warnings.length} warning{summary.warnings.length === 1 ? '' : 's'}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#d97706' }}>{showWarnings ? '▾ Hide' : '▸ Show'}</span>
              </button>
              {showWarnings && (
                <div style={{ borderTop: '1px solid rgba(245,158,11,0.3)', background: 'var(--panel)', padding: '8px 14px 12px' }}>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text)', maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {summary.warnings.map((w, i) => <li key={i}>{w.message}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onDone} style={{ fontSize: 13, padding: '8px 28px', borderRadius: 8, border: 'none', background: '#4f46e5', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>Done</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Confirm Preview Modal ─────────────────────────────────────────── */
function ConfirmAttendanceModal({ count, names, onConfirm, onCancel, isLoading }: { count: number; names: string[]; onConfirm: () => void; onCancel: () => void; isLoading: boolean }) {
  const [showNames, setShowNames] = useState(false);
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--panel)', borderRadius: 16, boxShadow: '0 25px 50px rgba(0,0,0,0.25)', width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Confirm Upload Changes</h2>
          <button onClick={onCancel} disabled={isLoading} style={{ background: 'none', border: 'none', fontSize: 24, color: 'var(--muted)', cursor: isLoading ? 'not-allowed' : 'pointer', lineHeight: 1 }}>&times;</button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 4px' }}>Review the changes below. Nothing has been written yet.</p>
          <div style={{ border: '1px solid #16a34a33', background: 'rgba(34,197,94,0.10)', borderRadius: 10, overflow: 'hidden' }}>
            <button onClick={() => count > 0 && setShowNames(s => !s)} disabled={count === 0} style={{ width: '100%', textAlign: 'left', padding: '10px 14px', background: 'transparent', border: 'none', cursor: count === 0 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#16a34a' }}>{count} attendance record{count === 1 ? '' : 's'} will be processed</span>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>Auto-promote rules will be applied chronologically.</span>
              </span>
              {count > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', whiteSpace: 'nowrap' }}>{showNames ? '▾ Hide' : '▸ Show'}</span>}
            </button>
            {showNames && count > 0 && (
              <div style={{ borderTop: '1px solid #16a34a33', padding: '8px 14px 12px', background: 'var(--panel)' }}>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: 'var(--text)', display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 220, overflowY: 'auto' }}>
                  {names.map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              </div>
            )}
          </div>
        </div>
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} disabled={isLoading} style={{ fontSize: 13, padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.5 : 1 }}>Cancel</button>
          <button onClick={onConfirm} disabled={isLoading} style={{ fontSize: 13, padding: '8px 22px', borderRadius: 8, border: 'none', background: '#4f46e5', color: '#fff', cursor: isLoading ? 'not-allowed' : 'pointer', fontWeight: 700, opacity: isLoading ? 0.7 : 1 }}>
            {isLoading ? 'Processing…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Bulk Upload Tab ───────────────────────────────────────────────── */
function BulkUploadTab({ onClose, onImported }: { onClose: () => void; onImported: (attendance: StoredRow[], summary: BatchSummary, branch: string, fileName: string) => void }) {
  const [step, setStep] = useState<'upload' | 'preview'>('upload');
  const [defaultBranch, setDefaultBranch] = useState('ONL');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<StoredRow[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'xlsx' && ext !== 'xls') {
      setError('Please upload an Excel file (.xlsx or .xls)');
      return;
    }
    setLoading(true); setError(''); setFileName(file.name);
    try {
      const parsed = await parseAttendanceExcelFile(file);
      if (parsed.length === 0) {
        setError('No valid attendance rows found. Check columns B (Name), C (Status), E (Lesson), F (Teachers), G (Date), H (Day), K (Attendance By).');
      } else {
        const tagged: StoredRow[] = parsed.map(r => ({ ...r, branch: defaultBranch }));
        setPreview(tagged);
        setStep('preview');
      }
    } catch {
      setError('Failed to read the file.');
    }
    setLoading(false);
  }

  function backToUpload() {
    setStep('upload'); setPreview([]); setFileName(''); setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleConfirm() {
    setImporting(true); setError('');
    try {
      const res = await apiFetch('/api/student-attendance/import', {
        method: 'POST',
        body: { rows: preview, branch: defaultBranch },
      });
      const summary: BatchSummary = {
        totalRows: res?.totalRows ?? 0,
        inserted: res?.inserted ?? 0,
        duplicates: res?.duplicates ?? 0,
        promotionsByAction: res?.promotionsByAction ?? { PROMOTE_CHAPTER: 0, PROMOTE_GRADE: 0, TICK_FA: 0, NO_CHANGE: 0, SKIP_NOT_ELIGIBLE: 0, SKIP_NOT_FOUND: 0, SKIP_INVALID: 0 },
        warnings: res?.warnings ?? [],
      };
      onImported(res?.data || [], summary, defaultBranch, fileName);
    } catch (err: any) {
      setError(err?.data?.error || err?.message || 'Import failed');
    } finally {
      setImporting(false);
      setShowConfirm(false);
    }
  }

  if (step === 'preview') {
    return (
      <>
        {showConfirm && (
          <ConfirmAttendanceModal count={preview.length} names={preview.map(r => r.studentName)} onConfirm={handleConfirm} onCancel={() => !importing && setShowConfirm(false)} isLoading={importing} />
        )}
        <div style={{ overflowY: 'auto', flex: 1, padding: 16 }}>
          <p style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 12px' }}>
            <span style={{ color: '#22c55e', fontWeight: 700 }}>✓ {fileName}</span> — {preview.length} rows extracted · branch <strong style={{ color: '#6366f1' }}>{defaultBranch}</strong>
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ minWidth: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  {['#', 'Student Name', 'Status', 'Lesson Name', 'Teacher(s)', 'Date', 'Day', 'Attendance By'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((r, idx) => {
                  const sc = statusColors(r.attendanceStatus);
                  return (
                    <tr key={idx} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 12px', color: 'var(--muted)', fontSize: 11 }}>{idx + 1}</td>
                      <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>{r.studentName}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 600, background: sc.bg, color: sc.color, whiteSpace: 'nowrap' }}>{r.attendanceStatus || '—'}</span>
                      </td>
                      <td style={{ padding: '8px 12px', color: 'var(--text)' }}>{r.lessonName || '—'}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>{r.lessonTeachers || '—'}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{r.lessonDate || '—'}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>{r.day || '—'}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>{r.attendanceBy || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={backToUpload} disabled={importing} style={{ fontSize: 13, color: 'var(--muted)', background: 'none', border: 'none', cursor: importing ? 'not-allowed' : 'pointer', textDecoration: 'underline', opacity: importing ? 0.4 : 1 }}>← Upload different file</button>
          {error && <p style={{ fontSize: 12, color: '#dc2626', margin: 0, flex: 1, textAlign: 'center' }}>{error}</p>}
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={onClose} disabled={importing} style={{ fontSize: 13, padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: importing ? 'not-allowed' : 'pointer', opacity: importing ? 0.5 : 1 }}>Cancel</button>
            <button onClick={() => setShowConfirm(true)} disabled={importing} style={{ fontSize: 13, padding: '8px 24px', borderRadius: 8, border: 'none', background: '#4f46e5', color: '#fff', cursor: importing ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: importing ? 0.7 : 1 }}>
              Review {preview.length} Record{preview.length !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <div style={{ padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10, padding: 16, fontSize: 12 }}>
        <p style={{ fontWeight: 700, color: '#6366f1', margin: '0 0 10px' }}>What will be extracted from the attendance sheet:</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {[
            ['Column B', 'Student Name'], ['Column C', 'Attendance Status'],
            ['Column E', 'Lesson Name'], ['Column F', 'Lesson Teacher(s)'],
            ['Column G', 'Lesson Date'], ['Column H', 'Day'],
            ['Column K', 'Attendance By'],
          ].map(([col, label]) => (
            <span key={col} style={{ background: 'rgba(99,102,241,0.15)', borderRadius: 6, padding: '4px 10px', color: '#6366f1' }}>{col} → {label}</span>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>Default Branch:</span>
        <select value={defaultBranch} onChange={e => setDefaultBranch(e.target.value)} style={{ ...sel, padding: '6px 12px', fontSize: 13 }}>
          {SORTED_BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>
      <div
        onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]); }}
        onDragOver={e => e.preventDefault()}
        onClick={() => fileInputRef.current?.click()}
        style={{ border: '2px dashed rgba(99,102,241,0.4)', borderRadius: 16, padding: 40, textAlign: 'center', cursor: loading ? 'not-allowed' : 'pointer', transition: 'all 0.2s' }}
      >
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={e => handleFile(e.target.files?.[0])} style={{ display: 'none' }} />
        <div style={{ fontSize: 40, marginBottom: 12 }}>📂</div>
        {loading ? <p style={{ color: '#6366f1', fontSize: 13 }}>Reading file…</p>
         : fileName ? <p style={{ color: '#6366f1', fontWeight: 600, fontSize: 13 }}>{fileName}</p>
         : <>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: '0 0 4px' }}>Click to browse or drag &amp; drop</p>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>.xlsx or .xls files only</p>
          </>}
      </div>
      {error && <p style={{ fontSize: 12, color: '#dc2626', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 8, padding: '10px 16px', margin: 0 }}>{error}</p>}
    </div>
  );
}

/* ─── Manual Entry Tab ──────────────────────────────────────────────── */
function ManualEntryTab({ onSubmitted }: { onSubmitted: (data: StoredRow[], summary: BatchSummary) => void }) {
  const [form, setForm] = useState({
    studentName: '',
    branch: 'ONL',
    attendanceStatus: 'attended' as 'attended' | 'absent' | 'replaced',
    lessonName: '',
    lessonTeachers: '',
    lessonDate: '',
    day: '',
    attendanceBy: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  function set<K extends keyof typeof form>(field: K, value: (typeof form)[K]) {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'lessonDate' && typeof value === 'string') {
        const d = deriveDay(value);
        if (d) next.day = d;
      }
      return next;
    });
  }

  async function handleSubmit() {
    setError(''); setSuccess('');
    if (!form.studentName.trim())  return setError('Student name is required.');
    if (!form.branch.trim())       return setError('Branch is required.');
    if (!form.lessonName.trim())   return setError('Lesson name is required.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.lessonDate)) return setError('Lesson date must be selected.');

    setSubmitting(true);
    try {
      const res = await apiFetch('/api/student-attendance/manual-entry', {
        method: 'POST',
        body: {
          studentName: form.studentName.trim(),
          branch: form.branch.trim(),
          attendanceStatus: form.attendanceStatus,
          lessonName: form.lessonName.trim(),
          lessonTeachers: form.lessonTeachers,
          lessonDate: form.lessonDate,
          day: form.day,
          attendanceBy: form.attendanceBy,
        },
      });
      const summary: BatchSummary = {
        totalRows: res?.totalRows ?? 1,
        inserted: res?.inserted ?? 0,
        duplicates: res?.duplicates ?? 0,
        promotionsByAction: res?.promotionsByAction ?? { PROMOTE_CHAPTER: 0, PROMOTE_GRADE: 0, TICK_FA: 0, NO_CHANGE: 0, SKIP_NOT_ELIGIBLE: 0, SKIP_NOT_FOUND: 0, SKIP_INVALID: 0 },
        warnings: res?.warnings ?? [],
      };
      onSubmitted(res?.data || [], summary);

      // Build a friendly inline message
      const p = summary.promotionsByAction;
      const parts: string[] = [];
      if (p.PROMOTE_CHAPTER) parts.push('promoted chapter +1');
      if (p.PROMOTE_GRADE)   parts.push('promoted grade +1');
      if (p.TICK_FA)         parts.push('FA tick recorded');
      if (summary.duplicates) parts.push('duplicate skipped');
      if (p.SKIP_NOT_FOUND)   parts.push('student not found');
      if (p.SKIP_NOT_ELIGIBLE) parts.push('not eligible (Foundation < C11)');
      const tail = parts.length ? ` — ${parts.join(', ')}` : '';
      const warnTail = summary.warnings.length ? ` · ⚠️ ${summary.warnings[0].message}` : '';
      setSuccess(`✅ Attendance recorded${tail}.${warnTail}`);

      // Reset (keep branch/attendanceBy for convenience)
      setForm(f => ({
        ...f,
        studentName: '',
        attendanceStatus: 'attended',
        lessonName: '',
        lessonTeachers: '',
        lessonDate: '',
        day: '',
      }));
    } catch (err: any) {
      setError(err?.data?.error || err?.message || 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {success && <div style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#16a34a', fontWeight: 500 }}>{success}</div>}
      {error   && <div style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#dc2626' }}>{error}</div>}

      <div>
        <label style={lblStyle}>Student Name</label>
        <input style={inp} value={form.studentName} onChange={e => set('studentName', e.target.value)} placeholder="Full name" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div>
          <label style={lblStyle}>Branch</label>
          <select style={inp} value={form.branch} onChange={e => set('branch', e.target.value)}>
            {SORTED_BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div>
          <label style={lblStyle}>Status</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['attended', 'absent', 'replaced'] as const).map(s => (
              <label key={s} style={{ flex: 1, border: `1px solid ${form.attendanceStatus === s ? '#4f46e5' : 'var(--border)'}`, background: form.attendanceStatus === s ? 'rgba(79,70,229,0.08)' : 'var(--bg)', borderRadius: 8, padding: '7px 10px', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: form.attendanceStatus === s ? '#4f46e5' : 'var(--text)' }}>
                <input type="radio" name="me-status" value={s} checked={form.attendanceStatus === s} onChange={() => set('attendanceStatus', s)} />
                {s === 'attended' ? 'Attended' : s === 'absent' ? 'Absent' : 'Replaced'}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div>
        <label style={lblStyle}>Lesson Name</label>
        <input style={inp} value={form.lessonName} onChange={e => set('lessonName', e.target.value)} placeholder="e.g., Public Speaking - Sat 1.15pm" />
      </div>

      <div>
        <label style={lblStyle}>Lesson Teacher(s)</label>
        <input style={inp} value={form.lessonTeachers} onChange={e => set('lessonTeachers', e.target.value)} placeholder="Optional" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div>
          <label style={lblStyle}>Lesson Date</label>
          <input type="date" style={inp} value={form.lessonDate} onChange={e => set('lessonDate', e.target.value)} />
        </div>
        <div>
          <label style={lblStyle}>Day</label>
          <input style={inp} value={form.day} onChange={e => set('day', e.target.value)} placeholder="Auto-derived from date" />
        </div>
      </div>

      <div>
        <label style={lblStyle}>Attendance By</label>
        <input style={inp} value={form.attendanceBy} onChange={e => set('attendanceBy', e.target.value)} placeholder="Optional" />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <button onClick={handleSubmit} disabled={submitting} style={{ fontSize: 13, padding: '9px 28px', borderRadius: 8, border: 'none', background: '#4f46e5', color: '#fff', cursor: submitting ? 'not-allowed' : 'pointer', fontWeight: 700, opacity: submitting ? 0.7 : 1 }}>
          {submitting ? 'Submitting…' : '+ Submit Attendance'}
        </button>
      </div>
    </div>
  );
}

/* ─── Upload Modal (Bulk + Manual tabs) ─────────────────────────────── */
function UploadAttendanceModal({
  onClose,
  onImported,
  onManualSubmitted,
}: {
  onClose: () => void;
  onImported: (rows: StoredRow[], summary: BatchSummary, branch: string, fileName: string) => void;
  onManualSubmitted: (rows: StoredRow[], summary: BatchSummary) => void;
}) {
  const [activeTab, setActiveTab] = useState<'bulk' | 'manual'>('bulk');

  const tabBtn = (id: 'bulk' | 'manual', label: string) => (
    <button
      onClick={() => setActiveTab(id)}
      style={{
        padding: '8px 24px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
        border: 'none', borderBottom: activeTab === id ? '2px solid #4f46e5' : '2px solid transparent',
        background: 'transparent', color: activeTab === id ? '#4f46e5' : 'var(--muted)',
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--panel)', borderRadius: 16, boxShadow: '0 25px 50px rgba(0,0,0,0.25)', width: '100%', maxWidth: activeTab === 'bulk' ? 1100 : 700, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 24px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Upload Attendance</h2>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, color: 'var(--muted)', cursor: 'pointer' }}>&times;</button>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {tabBtn('bulk',   '📂 Bulk Upload')}
            {tabBtn('manual', '✏️ Manual Entry')}
          </div>
        </div>

        {activeTab === 'bulk'
          ? <BulkUploadTab onClose={onClose} onImported={onImported} />
          : <ManualEntryTab onSubmitted={onManualSubmitted} />
        }
      </div>
    </div>
  );
}

/* ─── Delete Confirmation ───────────────────────────────────────────── */
function DeleteAttendanceModal({ row, onCancel, onConfirm, isDeleting }: { row: StoredRow; onCancel: () => void; onConfirm: () => void; isDeleting: boolean }) {
  const wasAttended = String(row.attendanceStatus || '').toLowerCase() === 'attended';
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--panel)', borderRadius: 16, boxShadow: '0 25px 50px rgba(0,0,0,0.25)', width: '100%', maxWidth: 460 }}>
        <div style={{ padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{ fontSize: 28 }}>⚠️</span>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Delete Attendance Record?</h2>
          </div>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 10px', lineHeight: 1.6 }}>
            Are you sure you want to delete this attendance record for <strong style={{ color: 'var(--text)' }}>{row.studentName}</strong> on <strong style={{ color: 'var(--text)' }}>{row.lessonDate}</strong>?
          </p>
          {wasAttended && (
            <p style={{ fontSize: 12, color: '#92400e', margin: 0, lineHeight: 1.5, background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, padding: '10px 14px' }}>
              ⚠️ This row triggered a promotion. Deleting will <strong>auto-reverse</strong> {row.studentName}'s grade. Continue?
            </p>
          )}
        </div>
        <div style={{ padding: '0 24px 24px', display: 'flex', gap: 12 }}>
          <button onClick={onCancel} disabled={isDeleting} style={{ flex: 1, fontSize: 13, padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: isDeleting ? 'not-allowed' : 'pointer', fontWeight: 500 }}>Cancel</button>
          <button onClick={onConfirm} disabled={isDeleting} style={{ flex: 1, fontSize: 13, padding: '10px 16px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', cursor: isDeleting ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: isDeleting ? 0.6 : 1 }}>
            {isDeleting ? 'Deleting…' : 'Yes, Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Page ─────────────────────────────────────────────────────────────── */
export function StudentAttendancePage() {
  const [rows, setRows] = useState<StoredRow[]>([]);
  const [lastFileName, setLastFileName] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [importSummary, setImportSummary] = useState<BatchSummary | null>(null);
  const [editRow, setEditRow] = useState<StoredRow | null>(null);
  const [deleteRow, setDeleteRow] = useState<StoredRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [branchFilter, setBranchFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [showClearAll, setShowClearAll] = useState(false);
  const [clearAllBranch, setClearAllBranch] = useState('All');
  const [clearAllLoading, setClearAllLoading] = useState(false);

  function flash(msg: string, ms = 6000) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), ms);
  }

  // Load existing attendance from DB on mount
  useEffect(() => {
    setLoading(true);
    apiFetch('/api/student-attendance')
      .then(res => { if (res.data) setRows(res.data); })
      .catch(err => flash(`❌ Failed to load attendance: ${err?.data?.error || err?.message || 'server error'}`))
      .finally(() => setLoading(false));
  }, []);

  function handleImported(newRows: StoredRow[], summary: BatchSummary, branch: string, fileName: string) {
    setRows(newRows);
    setLastFileName(fileName);
    setShowUpload(false);
    setImportSummary(summary);
    flash(`✅ Imported attendance for ${branch} — see summary.`);
  }

  function handleManualSubmitted(newRows: StoredRow[], _summary: BatchSummary) {
    if (newRows.length > 0) setRows(newRows);
  }

  function handleEditSaved(updated: AttendanceRowFull, message: string) {
    setRows(prev => prev.map(r => (r.id === updated.id ? { ...r, ...updated } : r)));
    setEditRow(null);
    flash(`✅ ${message}`);
  }

  async function handleDeleteConfirm() {
    if (!deleteRow?.id) return;
    setIsDeleting(true);
    try {
      const res: any = await apiFetch(`/api/student-attendance/${deleteRow.id}`, { method: 'DELETE' });
      setRows(prev => prev.filter(r => r.id !== deleteRow.id));
      const studentName = res?.studentName || deleteRow.studentName;
      if (res?.studentAffected) {
        flash(`✅ Row deleted. ${studentName}'s grade auto-adjusted: ${res.oldGradeChapter} → ${res.newGradeChapter}`, 8000);
      } else {
        flash('✅ Row deleted.');
      }
    } catch (err: any) {
      flash(`❌ Delete failed: ${err?.data?.error || err?.message || 'server error'}`);
    } finally {
      setIsDeleting(false);
      setDeleteRow(null);
    }
  }

  function exportToExcel() {
    const data = displayed.map((r, i) => ({
      'No.': i + 1,
      'Branch':            r.branch,
      'Student Name':      r.studentName,
      'Attendance Status': r.attendanceStatus,
      'Lesson Name':       r.lessonName,
      'Lesson Teacher(s)': r.lessonTeachers,
      'Lesson Date':       r.lessonDate,
      'Day':               r.day,
      'Attendance By':     r.attendanceBy,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Student Attendance');
    XLSX.writeFile(wb, `student-attendance-${branchFilter.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function clearAll(branch: string) {
    setClearAllLoading(true);
    const url = branch === 'All'
      ? '/api/student-attendance'
      : `/api/student-attendance?branch=${encodeURIComponent(branch)}`;
    try {
      await apiFetch(url, { method: 'DELETE' });
      const refreshed = await apiFetch('/api/student-attendance');
      setRows(refreshed?.data || []);
      setLastFileName('');
      setSearchQuery('');
      setShowClearAll(false);
      flash(branch === 'All' ? '✅ All attendance records cleared.' : `✅ ${branch} attendance records cleared.`, 4000);
    } catch (err: any) {
      flash(`❌ Clear failed: ${err?.data?.error || err?.message || 'server error'}`);
    } finally {
      setClearAllLoading(false);
    }
  }

  const branchFiltered = branchFilter === 'All' ? rows : rows.filter(r => r.branch === branchFilter);
  const totalStudents = new Set(branchFiltered.map(r => r.studentName.trim().toLowerCase()).filter(Boolean)).size;
  const q = searchQuery.trim().toLowerCase();
  const displayed = q
    ? branchFiltered.filter(r =>
        r.studentName.toLowerCase().includes(q) ||
        r.lessonName.toLowerCase().includes(q) ||
        r.attendanceBy.toLowerCase().includes(q),
      )
    : branchFiltered;

  return (
    <div className="dashboardPage">
      <div style={{ marginBottom: 24 }}>
        <BackButton to="/student-database" label="Back to Student Records" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 900, color: 'var(--text)', margin: 0, letterSpacing: -0.5 }}>📋 Student Attendance</h1>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0' }}>
              {loading
                ? 'Loading attendance from database…'
                : rows.length === 0
                  ? 'Upload an attendance Excel to view records.'
                  : `${rows.length} record${rows.length === 1 ? '' : 's'} loaded${lastFileName ? ` · last file: ${lastFileName}` : ''}`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={() => setShowUpload(true)} style={{ fontSize: 13, padding: '8px 20px', borderRadius: 8, border: 'none', background: '#4f46e5', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>⬆ Upload Attendance</button>
            <button onClick={exportToExcel} disabled={displayed.length === 0} style={{ fontSize: 13, padding: '8px 16px', borderRadius: 8, border: 'none', background: '#10b981', color: '#fff', cursor: displayed.length ? 'pointer' : 'not-allowed', fontWeight: 600, opacity: displayed.length ? 1 : 0.4 }}>⬇ Export</button>
            <button onClick={() => { setClearAllBranch(branchFilter); setShowClearAll(true); }} disabled={rows.length === 0} style={{ fontSize: 13, padding: '8px 16px', borderRadius: 8, border: '1px solid #dc2626', background: 'rgba(239,68,68,0.08)', color: '#dc2626', cursor: rows.length ? 'pointer' : 'not-allowed', fontWeight: 600, opacity: rows.length ? 1 : 0.4 }}>🗑 Clear</button>
          </div>
        </div>
      </div>

      {successMsg && (
        <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 8, padding: '10px 16px', marginBottom: 12, fontSize: 13, color: '#16a34a', fontWeight: 500 }}>{successMsg}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: 'var(--shadow-sm)' }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 4px' }}>Total Students</p>
            <p style={{ fontSize: 24, fontWeight: 800, color: '#6366f1', margin: 0 }}>{totalStudents}</p>
          </div>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(99,102,241,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>👥</div>
        </div>
      </div>

      <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Filter by Branch:</span>
        <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)} style={sel}>
          <option value="All">All Branches</option>
          {SORTED_BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
        </select>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 220, maxWidth: 360, border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', background: 'var(--bg)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input type="text" placeholder="Search student name…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: 'var(--text)', flex: 1, minWidth: 0 }} />
          {searchQuery && <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>}
        </div>

        {(branchFilter !== 'All' || q) && (
          <span style={{ fontSize: 13, color: '#4f46e5', fontWeight: 500 }}>
            Showing {displayed.length} record{displayed.length !== 1 ? 's' : ''}
            {branchFilter !== 'All' ? ` in ${branchFilter}` : ''}
            {q ? ` matching "${searchQuery.trim()}"` : ''}
          </span>
        )}
      </div>

      <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ minWidth: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                {['No.', 'Branch', 'Student Name', 'Attendance Status', 'Lesson Name', 'Lesson Teacher(s)', 'Lesson Date', 'Day', 'Attendance By', 'Actions'].map(h => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayed.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ ...td, textAlign: 'center', padding: '48px 16px', color: 'var(--muted)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 36 }}>{q || branchFilter !== 'All' ? '🔍' : '📋'}</span>
                      <p style={{ fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                        {rows.length === 0 ? 'No attendance loaded' : 'No matching rows'}
                      </p>
                      <p style={{ fontSize: 12, margin: 0 }}>
                        {rows.length === 0 ? 'Click "Upload Attendance" to import an Excel file.' : 'Try adjusting your branch filter or search.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : displayed.map((r, idx) => {
                const sc = statusColors(r.attendanceStatus);
                return (
                  <tr key={r.id ?? idx} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ ...td, color: 'var(--muted)' }}>{idx + 1}</td>
                    <td style={td}><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, fontWeight: 600, background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}>{r.branch}</span></td>
                    <td style={{ ...td, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>{r.studentName}</td>
                    <td style={td}><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 600, background: sc.bg, color: sc.color, whiteSpace: 'nowrap' }}>{r.attendanceStatus || '—'}</span></td>
                    <td style={{ ...td, color: 'var(--text)' }}>{r.lessonName || '—'}</td>
                    <td style={{ ...td, color: 'var(--muted)' }}>{r.lessonTeachers || '—'}</td>
                    <td style={{ ...td, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{r.lessonDate || '—'}</td>
                    <td style={{ ...td, color: 'var(--muted)' }}>{r.day || '—'}</td>
                    <td style={{ ...td, color: 'var(--muted)' }}>{r.attendanceBy || '—'}</td>
                    <td style={{ ...td, borderLeft: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => setEditRow(r)} disabled={!r.id} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: 'none', background: 'rgba(59,130,246,0.12)', color: '#2563eb', cursor: r.id ? 'pointer' : 'not-allowed', fontWeight: 600, opacity: r.id ? 1 : 0.4 }}>Edit</button>
                        <button onClick={() => setDeleteRow(r)} disabled={!r.id} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: 'none', background: 'rgba(239,68,68,0.1)', color: '#dc2626', cursor: r.id ? 'pointer' : 'not-allowed', fontWeight: 600, opacity: r.id ? 1 : 0.4 }}>Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showUpload && (
        <UploadAttendanceModal
          onClose={() => setShowUpload(false)}
          onImported={handleImported}
          onManualSubmitted={handleManualSubmitted}
        />
      )}

      {importSummary && (
        <ImportSummaryModal summary={importSummary} onDone={() => setImportSummary(null)} />
      )}

      {editRow && (
        <EditAttendanceModal
          row={{
            id: editRow.id,
            studentName: editRow.studentName,
            branch: editRow.branch,
            attendanceStatus: editRow.attendanceStatus,
            lessonName: editRow.lessonName,
            lessonTeachers: editRow.lessonTeachers,
            lessonDate: editRow.lessonDate,
            day: editRow.day,
            attendanceBy: editRow.attendanceBy,
          }}
          onClose={() => setEditRow(null)}
          onSaved={handleEditSaved}
        />
      )}

      {deleteRow && (
        <DeleteAttendanceModal
          row={deleteRow}
          onCancel={() => !isDeleting && setDeleteRow(null)}
          onConfirm={handleDeleteConfirm}
          isDeleting={isDeleting}
        />
      )}

      {showClearAll && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--panel)', borderRadius: 16, boxShadow: '0 25px 50px rgba(0,0,0,0.25)', width: '100%', maxWidth: 460 }}>
            <div style={{ padding: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <span style={{ fontSize: 28 }}>⚠️</span>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Confirm Bulk Clear</h2>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
                  Select Branch to Clear
                </label>
                <select
                  value={clearAllBranch}
                  onChange={e => setClearAllBranch(e.target.value)}
                  disabled={clearAllLoading}
                  style={{ width: '100%', fontSize: 13, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', cursor: clearAllLoading ? 'not-allowed' : 'pointer' }}
                >
                  <option value="All">All Branches</option>
                  {SORTED_BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>

              <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0, lineHeight: 1.6, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px' }}>
                Are you sure you want to delete{' '}
                <strong style={{ color: '#dc2626' }}>
                  {clearAllBranch === 'All'
                    ? `all ${rows.length} attendance record${rows.length === 1 ? '' : 's'}`
                    : `all attendance records in ${clearAllBranch}`}
                </strong>?{' '}
                This action is <strong>permanent and cannot be undone.</strong>
              </p>
            </div>
            <div style={{ padding: '0 24px 24px', display: 'flex', gap: 12 }}>
              <button
                onClick={() => setShowClearAll(false)}
                disabled={clearAllLoading}
                style={{ flex: 1, fontSize: 13, padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: clearAllLoading ? 'not-allowed' : 'pointer', fontWeight: 500 }}
              >
                Cancel
              </button>
              <button
                onClick={() => clearAll(clearAllBranch)}
                disabled={clearAllLoading}
                style={{ flex: 1, fontSize: 13, padding: '10px 16px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', cursor: clearAllLoading ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: clearAllLoading ? 0.6 : 1 }}
              >
                {clearAllLoading ? 'Clearing…' : 'Yes, Clear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
