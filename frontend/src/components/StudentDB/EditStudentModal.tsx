import { useState } from 'react';
import React from 'react';
import { BRANCHES, GRADES, CHAPTERS } from '../../lib/studentTypes';
import { getFaCount, getPcmCount, reconcileFa } from '../../lib/studentFaLogic';

const inp: React.CSSProperties = { width:'100%', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', fontSize:13, background:'var(--bg)', color:'var(--text)', outline:'none', boxSizing:'border-box' };
const lbl = { display:'block', fontSize:11, fontWeight:600, color:'var(--muted)', marginBottom:4, textTransform:'uppercase', letterSpacing:0.5 };

function toIsoDate(val: string): string {
  if (!val) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  // Fallback: try parsing (e.g. "Mon May 05 2025 ...")
  const parsed = new Date(val);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return '';
}

export default function EditStudentModal({ student, onClose, onSave }) {
  const [form, setForm] = useState({ ...student, enrollmentDate: toIsoDate(student.enrollmentDate) });

  function set(field, value) {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'grade' || field === 'chapter') {
        next.faAttended = reconcileFa(prev.faAttended, getFaCount(next.grade, next.chapter));
        next.pcmAttended = reconcileFa(prev.pcmAttended, getPcmCount(next.grade, next.chapter));
      }
      return next;
    });
  }

  const faCount = getFaCount(form.grade, form.chapter);
  const pcmCount = getPcmCount(form.grade, form.chapter);
  const chNum = parseInt(form.chapter.replace('C', ''), 10);

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'var(--panel)', borderRadius:16, boxShadow:'0 25px 50px rgba(0,0,0,0.25)', width:'100%', maxWidth:480 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 24px', borderBottom:'1px solid var(--border)' }}>
          <h2 style={{ fontSize:18, fontWeight:700, color:'var(--text)', margin:0 }}>Edit Student</h2>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:24, color:'var(--muted)', cursor:'pointer', lineHeight:1 }}>&times;</button>
        </div>
        <div style={{ padding:24, maxHeight:'60vh', overflowY:'auto', display:'flex', flexDirection:'column', gap:16 }}>
          <div>
            <label style={lbl}>Name</label>
            <input style={inp} value={form.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            <div>
              <label style={lbl}>Gender</label>
              <select style={inp} value={form.gender} onChange={e => set('gender', e.target.value)}>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Status</label>
              <select style={inp} value={form.status} onChange={e => set('status', e.target.value)}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>
          <div>
            <label style={lbl}>Branch</label>
            <select style={inp} value={form.branch} onChange={e => set('branch', e.target.value)}>
              {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Enrollment Date</label>
            <input type="date" style={inp} value={form.enrollmentDate} onChange={e => set('enrollmentDate', e.target.value)} />
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            <div>
              <label style={lbl}>Grade</label>
              <select style={inp} value={form.grade} onChange={e => set('grade', e.target.value)}>
                {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Chapter</label>
              <select style={inp} value={form.chapter} onChange={e => set('chapter', e.target.value)}>
                {CHAPTERS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div style={{ background:'rgba(99,102,241,0.08)', border:'1px solid rgba(99,102,241,0.2)', borderRadius:10, padding:12 }}>
            <p style={{ fontSize:11, fontWeight:700, color:'#6366f1', margin:'0 0 6px', textTransform:'uppercase' }}>Progress Preview — {form.grade} at {form.chapter}</p>
            <p style={{ fontSize:12, color:'#6366f1', margin:'0 0 4px' }}>FA: <strong>{faCount}</strong> checkbox{faCount !== 1 ? 'es' : ''}{chNum < 12 && <span style={{ color:'#f59e0b', marginLeft:6 }}>(unlocks at C12)</span>}</p>
            <p style={{ fontSize:12, color:'#f59e0b', margin:0 }}>PCM: <strong>{pcmCount}</strong> checkbox{pcmCount !== 1 ? 'es' : ''}{chNum < 10 && <span style={{ color:'#f59e0b', marginLeft:6 }}>(unlocks at C10)</span>}</p>
          </div>
        </div>
        <div style={{ padding:'16px 24px', borderTop:'1px solid var(--border)', display:'flex', gap:12, justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ fontSize:13, padding:'8px 16px', borderRadius:8, border:'1px solid var(--border)', background:'transparent', color:'var(--text)', cursor:'pointer' }}>Cancel</button>
          <button onClick={() => onSave(form)} disabled={!form.name.trim()} style={{ fontSize:13, padding:'8px 24px', borderRadius:8, border:'none', background:'#4f46e5', color:'#fff', cursor:'pointer', fontWeight:600, opacity: form.name.trim() ? 1 : 0.4 }}>Save Changes</button>
        </div>
      </div>
    </div>
  );
}
