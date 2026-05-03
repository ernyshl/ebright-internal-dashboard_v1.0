import { useState } from 'react';
import { BRANCHES } from '../../lib/studentTypes';
import { apiFetch } from '../../lib/api';

export type AttendanceRowFull = {
  id?: number;
  studentName: string;
  branch: string;
  attendanceStatus: string;
  lessonName: string;
  lessonTeachers: string;
  lessonDate: string;
  day: string;
  attendanceBy: string;
};

type Props = {
  row: AttendanceRowFull;
  onClose: () => void;
  onSaved: (updated: AttendanceRowFull, message: string) => void;
};

const SORTED_BRANCHES = [...BRANCHES].sort();

const inp: React.CSSProperties = {
  width: '100%', border: '1px solid var(--border)', borderRadius: 8,
  padding: '8px 12px', fontSize: 13, background: 'var(--bg)', color: 'var(--text)',
  outline: 'none', boxSizing: 'border-box',
};
const lbl: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted)',
  marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5,
};

function deriveDay(dateStr: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return '';
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()];
}

export default function EditAttendanceModal({ row, onClose, onSaved }: Props) {
  const [form, setForm] = useState<AttendanceRowFull>({ ...row });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set<K extends keyof AttendanceRowFull>(field: K, value: AttendanceRowFull[K]) {
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
    setError('');
    if (!form.studentName.trim())  return setError('Student name is required.');
    if (!form.branch.trim())       return setError('Branch is required.');
    if (!form.lessonName.trim())   return setError('Lesson name is required.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.lessonDate)) return setError('Lesson date must be YYYY-MM-DD.');
    if (form.attendanceStatus !== 'attended' && form.attendanceStatus !== 'absent') {
      return setError('Status must be attended or absent.');
    }
    if (!row.id) return setError('Missing row id.');

    setSaving(true);
    try {
      const res = await apiFetch(`/api/student-attendance/${row.id}`, {
        method: 'PUT',
        body: {
          studentName:      form.studentName.trim(),
          branch:           form.branch.trim(),
          attendanceStatus: form.attendanceStatus,
          lessonName:       form.lessonName.trim(),
          lessonTeachers:   form.lessonTeachers,
          lessonDate:       form.lessonDate,
          day:              form.day,
          attendanceBy:     form.attendanceBy,
        },
      });
      const updated = res?.data ?? res?.row ?? { ...form, id: row.id };
      const msg = res?.studentAffected
        ? `Row updated. Student grade auto-adjusted: ${res.oldGradeChapter} → ${res.newGradeChapter}`
        : (res?.message || 'Row updated.');
      onSaved(updated, msg);
    } catch (err: any) {
      setError(err?.data?.error || err?.message || 'Update failed');
    } finally {
      setSaving(false);
    }
  }

  const statusChanged = row.attendanceStatus.toLowerCase() !== form.attendanceStatus.toLowerCase();

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--panel)', borderRadius: 16, boxShadow: '0 25px 50px rgba(0,0,0,0.25)', width: '100%', maxWidth: 560 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Edit Attendance</h2>
          <button onClick={onClose} disabled={saving} style={{ background: 'none', border: 'none', fontSize: 24, color: 'var(--muted)', cursor: saving ? 'not-allowed' : 'pointer', lineHeight: 1 }}>&times;</button>
        </div>

        <div style={{ padding: 24, maxHeight: '70vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && (
            <div style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#dc2626' }}>
              {error}
            </div>
          )}

          {statusChanged ? (
            <div style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#92400e', fontWeight: 500 }}>
              ⚠️ Changing attendance status will auto-adjust <strong>{form.studentName || 'this student'}</strong>'s grade. Save to apply.
            </div>
          ) : (
            <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#4338ca' }}>
              Editing other fields (lesson, date, teacher, etc.) won't change the student's grade — only flipping <strong>attended ↔ absent</strong> triggers an auto-adjust.
            </div>
          )}

          <div>
            <label style={lbl}>Student Name</label>
            <input style={inp} value={form.studentName} onChange={e => set('studentName', e.target.value)} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={lbl}>Branch</label>
              <select style={inp} value={form.branch} onChange={e => set('branch', e.target.value)}>
                {SORTED_BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Status</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['attended', 'absent'] as const).map(s => (
                  <label key={s} style={{ flex: 1, border: `1px solid ${form.attendanceStatus === s ? '#4f46e5' : 'var(--border)'}`, background: form.attendanceStatus === s ? 'rgba(79,70,229,0.08)' : 'var(--bg)', borderRadius: 8, padding: '7px 10px', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: form.attendanceStatus === s ? '#4f46e5' : 'var(--text)' }}>
                    <input type="radio" name="status" value={s} checked={form.attendanceStatus === s} onChange={() => set('attendanceStatus', s)} />
                    {s === 'attended' ? 'Attended' : 'Absent'}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label style={lbl}>Lesson Name</label>
            <input style={inp} value={form.lessonName} onChange={e => set('lessonName', e.target.value)} placeholder="e.g., Public Speaking - Sat 1.15pm" />
          </div>

          <div>
            <label style={lbl}>Lesson Teacher(s)</label>
            <input style={inp} value={form.lessonTeachers} onChange={e => set('lessonTeachers', e.target.value)} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={lbl}>Lesson Date</label>
              <input type="date" style={inp} value={form.lessonDate} onChange={e => set('lessonDate', e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Day</label>
              <input style={inp} value={form.day} onChange={e => set('day', e.target.value)} />
            </div>
          </div>

          <div>
            <label style={lbl}>Attendance By</label>
            <input style={inp} value={form.attendanceBy} onChange={e => set('attendanceBy', e.target.value)} />
          </div>
        </div>

        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={saving} style={{ fontSize: 13, padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: saving ? 'not-allowed' : 'pointer' }}>Cancel</button>
          <button onClick={handleSubmit} disabled={saving} style={{ fontSize: 13, padding: '8px 24px', borderRadius: 8, border: 'none', background: '#4f46e5', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
