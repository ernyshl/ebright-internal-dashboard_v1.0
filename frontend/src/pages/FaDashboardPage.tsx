import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList,
} from 'recharts';
import { BackButton } from '../components/BackButton';
import { apiFetch } from '../lib/api';
import { clearToken, getUser } from '../lib/auth';
import { getRoleLabel } from '../lib/roles';
import { useAcademy } from '../context/AcademyContext';

/* ─────────────────────────── Previous Snapshot (for Delta) ─────────────────────────── */

const PREVIOUS_DATA = {
  ONL: 680, ST: 550, CJY: 510, SA: 420, PJY: 285, AMP: 335,
  BBB: 300, DK: 275, KLG: 265, KD: 255, SHA: 180, DA: 162,
  SP: 138, BSP: 82,  EGR: 71,  BTHO: 69, RBY: 16, TSG: 2, KW: 1, KTG: 1,
};

/* ─────────────────────────── Initial Data (20 branches) ─────────────────────────── */

const INITIAL_DATA = [
  { code: 'ONL',  active: 660, inv1: 8,  inv2: 6,  backlog: 646 },
  { code: 'ST',   active: 510, inv1: 7,  inv2: 2,  backlog: 507 },
  { code: 'CJY',  active: 480, inv1: 7,  inv2: 6,  backlog: 467 },
  { code: 'SA',   active: 390, inv1: 8,  inv2: 5,  backlog: 377 },
  { code: 'PJY',  active: 312, inv1: 5,  inv2: 4,  backlog: 303 },
  { code: 'AMP',  active: 315, inv1: 6,  inv2: 6,  backlog: 303 },
  { code: 'BBB',  active: 296, inv1: 5,  inv2: 9,  backlog: 278 },
  { code: 'DK',   active: 271, inv1: 5,  inv2: 6,  backlog: 260 },
  { code: 'KLG',  active: 256, inv1: 4,  inv2: 5,  backlog: 247 },
  { code: 'KD',   active: 250, inv1: 5,  inv2: 6,  backlog: 239 },
  { code: 'SHA',  active: 178, inv1: 4,  inv2: 5,  backlog: 169 },
  { code: 'DA',   active: 155, inv1: 4,  inv2: 5,  backlog: 146 },
  { code: 'SP',   active: 131, inv1: 4,  inv2: 4,  backlog: 123 },
  { code: 'BSP',  active: 81,  inv1: 3,  inv2: 4,  backlog: 74  },
  { code: 'EGR',  active: 72,  inv1: 3,  inv2: 3,  backlog: 66  },
  { code: 'BTHO', active: 71,  inv1: 3,  inv2: 2,  backlog: 66  },
  { code: 'RBY',  active: 14,  inv1: 2,  inv2: 1,  backlog: 11  },
  { code: 'TSG',  active: 8,   inv1: 3,  inv2: 5,  backlog: 0   },
  { code: 'KW',   active: 5,   inv1: 2,  inv2: 3,  backlog: 0   },
  { code: 'KTG',  active: 6,   inv1: 2,  inv2: 4,  backlog: 0   },
];

const REGIONS = {
  'Region A': ['RBY', 'KLG', 'SHA', 'SA', 'DA', 'EGR', 'ST'],
  'Region B': ['DK', 'KD', 'AMP', 'SP', 'BTHO', 'KTG', 'TSG'],
  'Region C': ['PJY', 'KW', 'BBB', 'CJY', 'BSP', 'ONL'],
};

const GRADE_OPTIONS = ['G1','G2','G3','G4','G5','G6','G7','G8','GA1','GA2','GA3','GA4','GB1','GB2','GB3','GB4'];
const BRANCH_LIST = ['ONL','ST','CJY','SA','PJY','AMP','BBB','DK','KLG','KD','SHA','DA','SP','BSP','EGR','BTHO','RBY','TSG','KW','KTG'];

/* ─────────────────────────── Helpers ─────────────────────────── */

function getBacklogColor(backlog, active) {
  if (active === 0) return '#6b7280';
  const pct = (backlog / active) * 100;
  if (pct > 50) return '#ef4444';
  if (pct >= 20) return '#f59e0b';
  return '#22c55e';
}

function getProgressBarColor(pct) {
  if (pct > 50) return '#ef4444';
  if (pct >= 20) return '#f59e0b';
  return '#22c55e';
}

/* ─────────────────────────── Health Bar Tooltip ─────────────────────────── */

function CustomBacklogTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const delta = d.delta ?? 0;  // delta = prev - current; positive = improvement
  const cleared = Math.max(0,  delta);
  const added   = Math.max(0, -delta);
  return (
    <div style={{
      background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
      border: '1px solid rgba(99,102,241,0.4)',
      borderRadius: 12, padding: '10px 16px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
      fontSize: 13, color: '#fff', minWidth: 190,
    }}>
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.15)', paddingBottom: 6 }}>
        {d.code}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ color: 'rgba(255,255,255,0.65)' }}>Current Backlog</span>
          <strong style={{ color: getBacklogColor(d.backlog, d.active) }}>{d.backlog}</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ color: 'rgba(255,255,255,0.65)' }}>Previous</span>
          <strong style={{ color: '#94a3b8' }}>{d.prev}</strong>
        </div>
        <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '4px 0' }} />
        {delta === 0 && (
          <div style={{ color: '#94a3b8', fontWeight: 600 }}>No change</div>
        )}
        {cleared > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
            <span style={{ color: 'rgba(255,255,255,0.65)' }}>Cleared (good)</span>
            <strong style={{ color: '#22c55e' }}>↓ {cleared}</strong>
          </div>
        )}
        {added > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
            <span style={{ color: 'rgba(255,255,255,0.65)' }}>Added (bad)</span>
            <strong style={{ color: '#ef4444' }}>↑ {added}</strong>
          </div>
        )}
      </div>
    </div>
  );
}

function CustomGradeTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{
      background: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)',
      border: '1px solid rgba(239,68,68,0.4)',
      borderRadius: 12, padding: '8px 14px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
      fontSize: 13, color: '#fff',
    }}>
      <strong style={{ fontSize: 14 }}>{d.grade}</strong>
      <div style={{ color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>
        Students: <strong style={{ color: '#fca5a5' }}>{d.count}</strong>
      </div>
    </div>
  );
}

/* ─────────────────────────── Branch Card ─────────────────────────── */

function BranchCard({ branch, filtered, prevData }) {
  const pct = branch.active > 0 ? (branch.backlog / branch.active) * 100 : 0;
  const pctRounded = Math.round(pct);
  const backlogNumColor = getBacklogColor(branch.backlog, branch.active);
  const progressColor = getProgressBarColor(pct);
  const prev = (prevData ?? PREVIOUS_DATA)[branch.code] ?? branch.backlog;
  const delta = prev - branch.backlog;  // positive = improvement

  return (
    <div style={{
      background: 'var(--panel)',
      border: `1.5px solid ${filtered ? '#6366f1' : 'var(--border)'}`,
      borderRadius: 14,
      overflow: 'hidden',
      boxShadow: filtered ? '0 0 0 3px rgba(99,102,241,0.2), var(--shadow-md)' : 'var(--shadow-sm)',
      transition: 'all 0.2s',
      display: 'flex',
      flexDirection: 'column',
      cursor: 'default',
    }}
    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = filtered ? '0 0 0 3px rgba(99,102,241,0.3), 0 8px 24px rgba(0,0,0,0.15)' : '0 8px 24px rgba(0,0,0,0.12)'; }}
    onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = filtered ? '0 0 0 3px rgba(99,102,241,0.2), var(--shadow-md)' : 'var(--shadow-sm)'; }}
    >
      {/* Card Header */}
      <div style={{
        background: pct > 50
          ? 'linear-gradient(135deg, #7f1d1d 0%, #b91c1c 100%)'
          : pct >= 20
          ? 'linear-gradient(135deg, #78350f 0%, #b45309 100%)'
          : 'linear-gradient(135deg, #14532d 0%, #16a34a 100%)',
        padding: '10px 14px 8px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ color: '#fff', fontWeight: 800, fontSize: 18, letterSpacing: 0.5 }}>
          {branch.code}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {delta !== 0 && (
            <span style={{
              fontSize: 10, fontWeight: 800, color: delta > 0 ? '#86efac' : '#fca5a5',
              background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: '1px 6px',
            }}>
              {delta > 0 ? `↓${delta}` : `↑${Math.abs(delta)}`}
            </span>
          )}
          <span style={{
            background: 'rgba(0,0,0,0.2)',
            color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '2px 8px',
          }}>
            {pctRounded}%
          </span>
        </div>
      </div>

      {/* Main KPI */}
      <div style={{
        padding: '14px 14px 10px', borderBottom: '1px solid var(--border)', textAlign: 'center',
      }}>
        <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1 }}>
          <span style={{ color: backlogNumColor }}>{branch.backlog}</span>
          <span style={{ color: 'var(--muted)', fontSize: 18, fontWeight: 500 }}>&nbsp;/&nbsp;{branch.active}</span>
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--textSecondary)', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 4 }}>
          FA Backlog Status
        </div>
        <div style={{ height: 5, background: 'var(--border)', borderRadius: 99, marginTop: 8, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${Math.min(pctRounded, 100)}%`,
            background: progressColor, borderRadius: 99, transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
          }} />
        </div>
        <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 4 }}>
          <span style={{ color: '#22c55e' }}>●</span> &lt;20%&nbsp;
          <span style={{ color: '#f59e0b' }}>●</span> 20–50%&nbsp;
          <span style={{ color: '#ef4444' }}>●</span> &gt;50%
        </div>
      </div>

      {/* Footer Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '10px 12px', gap: 8, flex: 1 }}>
        <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '8px 10px', textAlign: 'center', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>{branch.active}</div>
          <div style={{ fontSize: 10, color: 'var(--textSecondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>FA Aone Active</div>
        </div>
        <div style={{ background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#818cf8', textTransform: 'uppercase', letterSpacing: 0.8, textAlign: 'center', padding: '5px 6px 3px', borderBottom: '1px solid var(--border)', background: 'rgba(99,102,241,0.08)' }}>
            FA Attended
          </div>
          <div style={{ display: 'flex', flex: 1 }}>
            <div style={{ flex: 1, textAlign: 'center', padding: '5px 4px', borderRight: '1px solid var(--border)' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>{branch.inv1}</div>
              <div style={{ fontSize: 9, color: 'var(--textSecondary)', lineHeight: 1.2 }}>18–19<br/>Apr</div>
            </div>
            <div style={{ flex: 1, textAlign: 'center', padding: '5px 4px' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>{branch.inv2}</div>
              <div style={{ fontSize: 9, color: 'var(--textSecondary)', lineHeight: 1.2 }}>25–26<br/>Apr</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── CRUDE Table ─────────────────────────── */

function CrudeTable({ savedData, onSave }) {
  const [draft, setDraft]         = useState(() => savedData.map(r => ({ ...r })));
  const [pendingKeys, setPending] = useState(new Set());
  const [editCell, setEditCell]   = useState(null);
  const [editVal, setEditVal]     = useState('');
  const [toast, setToast]         = useState(null);
  const [saving, setSaving]       = useState(false);

  useEffect(() => {
    setDraft(savedData.map(r => ({ ...r })));
  }, [savedData]);

  const EDITABLE = ['active', 'inv1', 'inv2'];

  const fields = [
    { key: 'active',  label: 'FA Aone Active',    editable: true  },
    { key: 'inv1',    label: 'Invited 18–19 Apr', editable: true  },
    { key: 'inv2',    label: 'Invited 25–26 Apr', editable: true  },
    { key: 'backlog', label: 'Backlog (Auto)',     editable: false },
  ];

  function calcBacklog(active, inv1, inv2) {
    return Math.max(0, active - inv1 - inv2);
  }

  function startEdit(code, field, current) {
    if (!EDITABLE.includes(field)) return;
    setEditCell({ code, field });
    setEditVal(String(current));
  }

  function commitEdit(code, field) {
    const raw = editVal.replace(/[^0-9]/g, '');
    const val = raw === '' ? 0 : Math.max(0, parseInt(raw, 10));
    setDraft(prev => prev.map(row => {
      if (row.code !== code) return row;
      const updated = { ...row, [field]: val };
      updated.backlog = calcBacklog(updated.active, updated.inv1, updated.inv2);
      return updated;
    }));
    setPending(prev => { const s = new Set(prev); s.add(`${code}-${field}`); return s; });
    setEditCell(null);
  }

  function handleKey(e, code, field) {
    if (!/[0-9]/.test(e.key) && !['Backspace','Delete','ArrowLeft','ArrowRight','Tab','Enter','Escape'].includes(e.key)) {
      e.preventDefault();
    }
    if (e.key === 'Enter') commitEdit(code, field);
    if (e.key === 'Escape') setEditCell(null);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(draft);
      setPending(new Set());
      setToast('success');
    } catch {
      setToast('error');
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 3000);
    }
  }

  const hasPending = pendingKeys.size > 0;

  const thStyle = {
    padding: '11px 14px', fontSize: 11, fontWeight: 700,
    color: '#c7d2fe', textTransform: 'uppercase', letterSpacing: 0.8,
    background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
    borderBottom: '2px solid rgba(99,102,241,0.3)', whiteSpace: 'nowrap', textAlign: 'left',
  };
  const tdStyle = {
    padding: '9px 14px', fontSize: 13,
    borderBottom: '1px solid var(--borderLight)', color: 'var(--text)',
  };

  return (
    <div>
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          background: toast === 'success'
            ? 'linear-gradient(135deg, #14532d, #16a34a)'
            : 'linear-gradient(135deg, #7f1d1d, #b91c1c)',
          color: '#fff', fontWeight: 700,
          padding: '12px 22px', borderRadius: 12,
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          fontSize: 14, display: 'flex', alignItems: 'center', gap: 10,
        }}>
          {toast === 'success' ? '✅ Data successfully saved!' : '❌ Save failed — check your login or try again.'}
        </div>
      )}

      <div style={{
        padding: '12px 16px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', borderBottom: '1px solid var(--border)',
        background: hasPending
          ? 'linear-gradient(90deg, rgba(245,158,11,0.08), rgba(245,158,11,0.03))'
          : 'transparent',
      }}>
        <div style={{ fontSize: 12, color: hasPending ? '#f59e0b' : 'var(--muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          {hasPending ? (
            <>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', display: 'inline-block', boxShadow: '0 0 0 3px rgba(245,158,11,0.2)' }} />
              {pendingKeys.size} unsaved change{pendingKeys.size > 1 ? 's' : ''}
            </>
          ) : (
            <>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
              No unsaved changes
            </>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={!hasPending || saving}
          style={{
            padding: '8px 20px', borderRadius: 9, fontSize: 13, fontWeight: 700,
            background: hasPending && !saving
              ? 'linear-gradient(135deg, #4f46e5, #7c3aed)'
              : 'var(--border)',
            color: hasPending && !saving ? '#fff' : 'var(--muted)',
            border: 'none', cursor: hasPending && !saving ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s',
            boxShadow: hasPending && !saving ? '0 4px 12px rgba(79,70,229,0.35)' : 'none',
          }}
        >
          {saving ? '⏳ Saving…' : '💾 Save Data'}
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 72 }}>Branch</th>
              {fields.map(f => (
                <th key={f.key} style={thStyle}>
                  {f.label}
                  {!f.editable && <span style={{ color: '#818cf8', fontWeight: 500, marginLeft: 4 }}>(auto)</span>}
                </th>
              ))}
              <th style={{ ...thStyle, color: '#818cf8' }}>% Backlog</th>
            </tr>
          </thead>
          <tbody>
            {draft.map((row, i) => {
              const pct = row.active > 0 ? ((row.backlog / row.active) * 100).toFixed(1) : '—';
              const backlogColor = getBacklogColor(row.backlog, row.active);
              return (
                <tr
                  key={row.code}
                  style={{ background: i % 2 === 0 ? 'transparent' : 'var(--tableWrapBg)', transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.04)'}
                  onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'var(--tableWrapBg)'}
                >
                  <td style={{ ...tdStyle, fontWeight: 800 }}>
                    <span style={{
                      background: 'linear-gradient(135deg, #1e1b4b, #312e81)',
                      color: '#c7d2fe', padding: '2px 9px', borderRadius: 6, fontSize: 12,
                    }}>{row.code}</span>
                  </td>
                  {fields.map(f => {
                    const cellKey = `${row.code}-${f.key}`;
                    const isPending = pendingKeys.has(cellKey);
                    const isEditing = editCell?.code === row.code && editCell?.field === f.key;

                    if (!f.editable) {
                      return (
                        <td key={f.key} style={tdStyle}>
                          <span style={{
                            display: 'inline-block', minWidth: 44,
                            padding: '3px 10px', borderRadius: 8,
                            background: backlogColor + '22',
                            border: `1.5px solid ${backlogColor}44`,
                            color: backlogColor, fontWeight: 800, fontSize: 13,
                          }}>
                            {row.backlog}
                          </span>
                        </td>
                      );
                    }

                    return (
                      <td key={f.key} style={{ ...tdStyle, cursor: 'pointer' }}
                        onClick={() => !isEditing && startEdit(row.code, f.key, row[f.key])}>
                        {isEditing ? (
                          <input
                            autoFocus type="text" inputMode="numeric" value={editVal}
                            onChange={e => setEditVal(e.target.value.replace(/[^0-9]/g, ''))}
                            onBlur={() => commitEdit(row.code, f.key)}
                            onKeyDown={e => handleKey(e, row.code, f.key)}
                            style={{
                              width: 72, padding: '5px 9px', borderRadius: 7,
                              border: '2px solid #6366f1',
                              background: 'var(--inputBg)', color: 'var(--text)',
                              fontSize: 13, outline: 'none',
                              boxShadow: '0 0 0 3px rgba(99,102,241,0.15)',
                            }}
                          />
                        ) : (
                          <span style={{
                            display: 'inline-block', minWidth: 44,
                            padding: '3px 10px', borderRadius: 8,
                            background: isPending ? 'rgba(245,158,11,0.1)' : 'var(--bg)',
                            border: isPending ? '1.5px solid #f59e0b' : '1px solid var(--border)',
                            fontSize: 13, color: 'var(--text)', fontWeight: 600,
                            transition: 'all 0.2s',
                          }}>
                            {row[f.key]}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td style={{ ...tdStyle, fontWeight: 700, color: backlogColor }}>
                    {pct !== '—' ? `${pct}%` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{
          fontSize: 11, color: 'var(--muted)', padding: '10px 16px',
          display: 'flex', gap: 16, flexWrap: 'wrap',
        }}>
          <span>Click any cell to edit · Enter to confirm · Esc to cancel</span>
          <span style={{ color: '#f59e0b', fontWeight: 600 }}>● Yellow border = unsaved</span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Grade Management Table ─────────────────────────── */

let _gradeNextId = 1;

function GradeManagementTable({ students, setStudents }) {
  const [search, setSearch] = useState('');

  function addStudent() {
    setStudents(prev => [...prev, { id: _gradeNextId++, name: '', branch: 'ONL', grade: 'G1' }]);
  }
  function updateStudent(id, field, value) {
    setStudents(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  }
  function deleteStudent(id) {
    setStudents(prev => prev.filter(s => s.id !== id));
  }

  const filtered = students.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));

  const thStyle = {
    padding: '11px 14px', fontSize: 11, fontWeight: 700,
    color: '#fca5a5', textTransform: 'uppercase', letterSpacing: 0.8,
    background: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)',
    borderBottom: '2px solid rgba(239,68,68,0.3)', whiteSpace: 'nowrap', textAlign: 'left',
  };
  const tdStyle = {
    padding: '8px 14px', fontSize: 13,
    borderBottom: '1px solid var(--borderLight)', color: 'var(--text)',
  };
  const inputStyle = {
    padding: '5px 9px', borderRadius: 7,
    border: '1px solid var(--border)', background: 'var(--inputBg)',
    color: 'var(--text)', fontSize: 13, outline: 'none',
  };

  return (
    <div>
      <div style={{
        padding: '12px 16px', display: 'flex', alignItems: 'center',
        gap: 12, borderBottom: '1px solid var(--border)', flexWrap: 'wrap',
      }}>
        <input
          type="text" placeholder="🔍 Search by student name..."
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ ...inputStyle, flex: 1, minWidth: 200, padding: '7px 12px' }}
        />
        <button onClick={addStudent} style={{
          padding: '7px 16px', borderRadius: 9, fontSize: 13, fontWeight: 700,
          background: 'linear-gradient(135deg, #b91c1c, #dc2626)',
          color: '#fff', border: 'none', cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(185,28,28,0.3)',
        }}>
          + Add New Student
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 40 }}>#</th>
              <th style={thStyle}>Student Name</th>
              <th style={thStyle}>Branch</th>
              <th style={thStyle}>Grade</th>
              <th style={{ ...thStyle, width: 60 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: 'var(--muted)', padding: 32 }}>
                  {students.length === 0 ? 'No students yet. Click "+ Add New Student" to begin.' : 'No results match your search.'}
                </td>
              </tr>
            ) : (
              filtered.map((s, i) => (
                <tr key={s.id}
                  style={{ background: i % 2 === 0 ? 'transparent' : 'var(--tableWrapBg)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.04)'}
                  onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'var(--tableWrapBg)'}
                >
                  <td style={{ ...tdStyle, color: 'var(--muted)', fontSize: 12 }}>{i + 1}</td>
                  <td style={tdStyle}>
                    <input type="text" value={s.name} onChange={e => updateStudent(s.id, 'name', e.target.value)}
                      placeholder="Enter name..." style={{ ...inputStyle, width: '100%' }} />
                  </td>
                  <td style={tdStyle}>
                    <select value={s.branch} onChange={e => updateStudent(s.id, 'branch', e.target.value)}
                      style={{ ...inputStyle, cursor: 'pointer' }}>
                      {BRANCH_LIST.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </td>
                  <td style={tdStyle}>
                    <select value={s.grade} onChange={e => updateStudent(s.id, 'grade', e.target.value)}
                      style={{ ...inputStyle, cursor: 'pointer', fontWeight: 700, color: '#ef4444' }}>
                      {GRADE_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </td>
                  <td style={tdStyle}>
                    <button onClick={() => deleteStudent(s.id)} style={{
                      padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                      background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                      border: '1px solid rgba(239,68,68,0.3)', cursor: 'pointer',
                    }}>✕</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', padding: '8px 16px' }}>
        {students.length} student{students.length !== 1 ? 's' : ''} total · Grade chart updates instantly
      </div>
    </div>
  );
}

/* ─────────────────────────── Main Page ─────────────────────────── */

function dbToRow(r) {
  return {
    code:    r.branch_code,
    active:  r.fa_active,
    inv1:    r.inv_apr1819,
    inv2:    r.inv_apr2526,
    backlog: r.backlog,
  };
}

export function FaDashboardPage() {
  const navigate = useNavigate();
  const { dbStudents, setDbStudents, sharedBranch } = useAcademy();
  const [savedData, setSavedData]   = useState(INITIAL_DATA);
  const [dbLoaded, setDbLoaded]     = useState(false);
  const [loadError, setLoadError]   = useState(null);
  const [selectedRegion, setSelectedRegion] = useState('');
  const [selectedBranch, setSelectedBranch] = useState(() => sharedBranch !== 'All' ? sharedBranch : '');
  const [showCrude, setShowCrude]   = useState(false);
  const [baselineSet, setBaselineSet] = useState(false);
  const [previousData, setPreviousData] = useState<Record<string, number>>(() => {
    try {
      const stored = localStorage.getItem('fa_previous_backlog');
      if (stored) return JSON.parse(stored);
    } catch {}
    return {};  // No arrows until user sets a baseline
  });
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
  const user = getUser();
  const initials = user?.fullName
    ? user.fullName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => (prev === 'light' ? 'dark' : 'light'));

  function onLogout() {
    clearToken();
    navigate('/', { replace: true });
  }

  useEffect(() => {
    apiFetch('/api/fa-dashboard')
      .then(res => {
        if (res.data && res.data.length > 0) setSavedData(res.data.map(dbToRow));
        setDbLoaded(true);
      })
      .catch(err => { setLoadError(err.message); setDbLoaded(true); });
  }, []);

  // Load students from DB if not already loaded by Student Database page
  useEffect(() => {
    if (dbStudents.length === 0) {
      apiFetch('/api/student-records')
        .then(res => { if (res.data) setDbStudents(res.data); })
        .catch(() => {});
    }
  }, []);

  // Sync selectedBranch when sharedBranch changes from Student DB page
  useEffect(() => {
    const contextBranch = sharedBranch !== 'All' ? sharedBranch : '';
    if (contextBranch !== selectedBranch) setSelectedBranch(contextBranch);
  }, [sharedBranch]);

  function handleSetBaseline() {
    const snapshot: Record<string, number> = {};
    (branchData as any[]).forEach((b: any) => { snapshot[b.code] = b.backlog; });
    localStorage.setItem('fa_previous_backlog', JSON.stringify(snapshot));
    setPreviousData(snapshot);
    setBaselineSet(true);
    setTimeout(() => setBaselineSet(false), 2000);
  }

  async function handleSave(committed) {
    const rows = committed.map(b => ({
      branch_code: b.code,
      fa_active:   b.active,
      inv_apr1819: b.inv1,
      inv_apr2526: b.inv2,
    }));
    const res = await apiFetch('/api/fa-dashboard/save', { method: 'POST', body: { rows } });
    if (res.data) setSavedData(res.data.map(dbToRow));
    else setSavedData(committed);
  }

  // Compute per-branch stats from student records (matching Student Database card logic)
  const studentBranchData = useMemo(() => {
    const map = {};
    BRANCH_LIST.forEach(code => { map[code] = { code, active: 0, inv1: 0, inv2: 0, backlog: 0 }; });
    dbStudents.filter(s => s.status === 'Active').forEach(s => {
      if (!map[s.branch]) map[s.branch] = { code: s.branch, active: 0, inv1: 0, inv2: 0, backlog: 0 };
      map[s.branch].active  += s.faAttended.length;                  // FA Due
      map[s.branch].inv1    += s.faAttended.filter(Boolean).length;  // FA Invited
    });
    Object.values(map).forEach(b => {
      b.backlog = Math.max(0, b.active - b.inv1);
    });
    return Object.values(map);
  }, [dbStudents]);

  // FA Dashboard reads from student records (live data)
  const branchData = dbStudents.length > 0 ? studentBranchData : savedData;

  const availableBranches = useMemo(() => {
    if (!selectedRegion) return branchData.map(b => b.code).sort();
    return (REGIONS[selectedRegion] || []).sort();
  }, [selectedRegion, branchData]);

  const filteredCodes = useMemo(() => {
    if (selectedBranch) return new Set([selectedBranch]);
    if (selectedRegion) return new Set(REGIONS[selectedRegion] || []);
    return null;
  }, [selectedRegion, selectedBranch]);

  const sortedAlpha = useMemo(() => [...branchData].sort((a, b) => a.code.localeCompare(b.code)), [branchData]);

  const cardBranches = useMemo(() => sortedAlpha.filter(b => {
    if (selectedBranch) return b.code === selectedBranch;
    if (selectedRegion) return (REGIONS[selectedRegion] || []).includes(b.code);
    return true;
  }), [sortedAlpha, selectedRegion, selectedBranch]);

  /* Backlog chart — health bar delta data */
  const backlogChartData = useMemo(() => {
    return ([...branchData] as any[]).sort((a: any, b: any) => a.backlog - b.backlog).map((b: any) => {
      const prev  = previousData[b.code] ?? b.backlog;
      const delta = prev - b.backlog;  // positive = improvement (backlog decreased)
      // For stacked bars:
      // mainBar  = the solid health-colored portion (min of current/prev)
      // ghostBar = cleared amount (grey ghost, if improved)
      // extraBar = regression amount (red, if worsened)
      const mainBar  = Math.min(b.backlog, prev);
      const ghostBar = Math.max(0, prev - b.backlog);
      const extraBar = Math.max(0, b.backlog - prev);
      return { ...b, prev, delta, mainBar, ghostBar, extraBar };
    });
  }, [branchData]);

  /* Delta label renderer (closure over backlogChartData) */
  const renderDeltaLabel = useCallback((props) => {
    const { x, y, width, height, index } = props;
    if (index === undefined || !backlogChartData[index]) return null;
    const d = backlogChartData[index];
    const delta = d.delta;
    const currentVal = d.backlog;
    const cx = x + (width ?? 0) + 6;
    const cy = y + (height ?? 0) / 2;

    if (delta === 0) {
      return (
        <g>
          <text x={cx} y={cy + 4} fontSize={10} fontWeight={700} fill="#64748b">{currentVal}</text>
          <text x={cx + 28} y={cy + 4} fontSize={9} fontWeight={700} fill="#94a3b8">—</text>
        </g>
      );
    }
    const sign = delta > 0 ? '↓' : '↑';  // delta = prev - current; positive = improvement
    const amt  = Math.abs(delta);
    const col  = delta > 0 ? '#16a34a' : '#dc2626';
    return (
      <g>
        <text x={cx} y={cy + 4} fontSize={10} fontWeight={700} fill="#64748b">{currentVal}</text>
        <text x={cx + 28} y={cy + 4} fontSize={9} fontWeight={800} fill={col}>{sign}{amt}</text>
      </g>
    );
  }, [backlogChartData]);

  const gradeChartData = useMemo(() => {
    const active = dbStudents.filter(s => s.status === 'Active');
    const byBranch = selectedBranch ? active.filter(s => s.branch === selectedBranch) : active;
    return GRADE_OPTIONS.map(g => ({ grade: g, count: byBranch.filter(s => s.grade === g).length }));
  }, [dbStudents, selectedBranch]);

  const gradeChartMax = useMemo(() => {
    const max = Math.max(...gradeChartData.map(d => d.count), 1);
    return Math.ceil(max / 2) * 2 + 2;
  }, [gradeChartData]);

  const isFiltered = (code) => filteredCodes ? filteredCodes.has(code) : false;

  const selectStyle = {
    padding: '7px 32px 7px 12px', borderRadius: 9,
    border: '1.5px solid var(--border)', background: 'var(--inputBg)',
    color: 'var(--text)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
    outline: 'none', appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2394a3b8' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', minWidth: 140,
  };

  return (
    <div className="dashboardPage">

      {/* ── Topbar ── */}
      <header className="topbar">
        <div className="topbarLeft">
          <div className="pageTitle">Ebright Internal Dashboard</div>
          <div className="muted small">
            {user ? `Welcome back, ${user.fullName || user.email || ''}` : 'Welcome'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {user && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="avatar avatarBrand">{initials}</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{user.fullName || user.email}</div>
                <div className="muted small">{getRoleLabel(user.role)}</div>
              </div>
            </div>
          )}
          <button
            className="btn btnSmall"
            onClick={toggleTheme}
            style={{ padding: '4px 8px', fontSize: '16px', background: 'transparent', border: 'none', cursor: 'pointer' }}
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          <button className="btn btnSmall btnDanger" onClick={onLogout}>
            Log out
          </button>
        </div>
      </header>

      {/* ── Full-width Header ── */}
      <div style={{
        background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
        padding: '20px 40px 24px',
        marginBottom: 28,
        borderBottom: '1px solid rgba(99,102,241,0.2)',
        boxShadow: '0 4px 32px rgba(0,0,0,0.35)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Decorative glow blobs */}
        <div style={{
          position: 'absolute', top: -60, right: 120, width: 220, height: 220,
          background: 'radial-gradient(circle, rgba(99,102,241,0.25) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: -40, left: 200, width: 160, height: 160,
          background: 'radial-gradient(circle, rgba(139,92,246,0.18) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div style={{ maxWidth: 1600, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', position: 'relative' }}>
          {/* Left */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <BackButton to="/" label="Back to Home" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 10 }}>
              <div style={{
                width: 64, height: 64, borderRadius: 16,
                background: 'linear-gradient(135deg, rgba(99,102,241,0.5), rgba(139,92,246,0.4))',
                border: '1.5px solid rgba(255,255,255,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 34, boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
              }}>🎓</div>
              <div>
                <h1 style={{ margin: 0, fontSize: 34, fontWeight: 900, color: '#fff', letterSpacing: -0.5, lineHeight: 1.1 }}>
                  FA Dashboard
                </h1>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.55)', letterSpacing: 0.2 }}>
                  Academy Foundation Appraisal tracking by branch
                </p>
              </div>
            </div>
          </div>

          {/* Right */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {/* Summary pills */}
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { label: 'Total Active', val: branchData.reduce((s, b) => s + b.active, 0), color: '#818cf8' },
                { label: 'Total Backlog', val: branchData.reduce((s, b) => s + b.backlog, 0), color: '#f87171' },
              ].map(p => (
                <div key={p.label} style={{
                  padding: '6px 14px', borderRadius: 20,
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: 17, fontWeight: 800, color: p.color }}>{p.val.toLocaleString()}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>{p.label}</div>
                </div>
              ))}
            </div>

            {/* DB status pill */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '7px 14px', borderRadius: 20,
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.12)',
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                background: !dbLoaded ? '#f59e0b' : loadError ? '#ef4444' : '#22c55e',
                boxShadow: !dbLoaded ? 'none' : loadError ? 'none' : '0 0 0 3px rgba(34,197,94,0.35)',
              }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.8)', whiteSpace: 'nowrap' }}>
                {!dbLoaded ? 'Loading…' : loadError ? 'Local data' : 'Live data'}
              </span>
            </div>

            {/* Set as Baseline button */}
            <button
              onClick={handleSetBaseline}
              style={{
                padding: '9px 20px', borderRadius: 11, fontSize: 13, fontWeight: 700,
                background: baselineSet
                  ? 'linear-gradient(135deg, #14532d, #16a34a)'
                  : 'linear-gradient(135deg, rgba(34,197,94,0.5), rgba(16,185,129,0.4))',
                color: '#fff',
                border: '1.5px solid rgba(255,255,255,0.2)',
                cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              }}
            >
              {baselineSet ? '✅ Baseline Set!' : '📌 Set as Baseline'}
            </button>

            {/* Edit Data button */}
            <button
              onClick={() => setShowCrude(v => !v)}
              style={{
                padding: '9px 20px', borderRadius: 11, fontSize: 13, fontWeight: 700,
                background: showCrude
                  ? 'linear-gradient(135deg, #fff, #e0e7ff)'
                  : 'linear-gradient(135deg, rgba(99,102,241,0.6), rgba(139,92,246,0.5))',
                color: showCrude ? '#3730a3' : '#fff',
                border: '1.5px solid rgba(255,255,255,0.2)',
                cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              }}
            >
              {showCrude ? '▲ Hide Tables' : '✏️ Edit Data'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Content wrapper ── */}
      <div style={{ maxWidth: 1600, margin: '0 auto', padding: '0 28px 40px' }}>

        {/* Edit Data Panel */}
        {showCrude && (
          <div style={{ marginBottom: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card" style={{ padding: 0, overflow: 'hidden', border: '1.5px solid rgba(99,102,241,0.25)', boxShadow: '0 4px 24px rgba(99,102,241,0.1)' }}>
              <div style={{
                padding: '14px 18px', borderBottom: '1px solid rgba(99,102,241,0.15)',
                background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.04))',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <span style={{ fontSize: 20 }}>📊</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>CRUDE — Academy Data</h3>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--muted)' }}>
                    Click any cell to edit · Backlog auto-calculates · Save to update charts & cards
                  </p>
                </div>
              </div>
              <CrudeTable savedData={sortedAlpha} onSave={handleSave} />
            </div>

            <div className="card" style={{ padding: '14px 18px', border: '1.5px solid rgba(239,68,68,0.2)', boxShadow: '0 4px 24px rgba(239,68,68,0.08)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 24 }}>📚</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Student grade data is synced from the Student Database</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  {dbStudents.filter(s => s.status === 'Active').length} active students loaded · Grade chart updates automatically
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Charts Row ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '3fr 2fr',
          gap: 24,
          marginBottom: 28,
        }}>
          {/* Left — Health Bar Chart */}
          <div style={{
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: 18,
            boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
            padding: '24px 24px 16px',
            overflow: 'hidden',
          }}>
            {/* Chart header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>
                  Backlog FA to Invite by Branch
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)' }}>
                  Academy Foundation Appraisal
                </p>
              </div>
              {/* Legend */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10, fontWeight: 600, textAlign: 'right', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end' }}>
                  <span style={{ width: 18, height: 8, borderRadius: 4, background: 'rgba(148,163,184,0.4)', display: 'inline-block' }} />
                  <span style={{ color: 'var(--muted)' }}>Cleared (improved)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end' }}>
                  <span style={{ width: 18, height: 8, borderRadius: 4, background: 'rgba(239,68,68,0.55)', display: 'inline-block' }} />
                  <span style={{ color: 'var(--muted)' }}>Added (regressed)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end' }}>
                  <span style={{ color: '#16a34a', fontWeight: 800 }}>↓</span>
                  <span style={{ color: 'var(--muted)' }}>Improvement</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end' }}>
                  <span style={{ color: '#dc2626', fontWeight: 800 }}>↑</span>
                  <span style={{ color: 'var(--muted)' }}>Regression</span>
                </div>
              </div>
            </div>

            <ResponsiveContainer width="100%" height={580}>
              <BarChart
                data={backlogChartData}
                layout="vertical"
                margin={{ top: 0, right: 80, left: 8, bottom: 0 }}
                barCategoryGap="25%"
              >
                <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--border)' }}
                  domain={[0, 720]}
                  ticks={[0, 100, 200, 300, 400, 500, 600, 700]}
                />
                <YAxis
                  dataKey="code"
                  type="category"
                  tick={{ fontSize: 11, fill: '#64748b', fontWeight: 700 }}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                />
                <Tooltip content={<CustomBacklogTooltip />} cursor={{ fill: 'rgba(99,102,241,0.06)' }} />

                {/* Bar 1: main health-colored bar (min of current vs previous) */}
                <Bar dataKey="mainBar" stackId="health" maxBarSize={18} radius={[0, 0, 0, 0]}>
                  {backlogChartData.map(entry => {
                    if (filteredCodes && !filteredCodes.has(entry.code)) return <Cell key={entry.code} fill="#e2e8f0" />;
                    return <Cell key={entry.code} fill={getBacklogColor(entry.backlog, entry.active)} />;
                  })}
                </Bar>

                {/* Bar 2: ghost bar — cleared amount (grey, improvement) */}
                <Bar dataKey="ghostBar" stackId="health" maxBarSize={18} fill="rgba(148,163,184,0.35)"
                  radius={[0, 0, 0, 0]} />

                {/* Bar 3: extra bar — regression amount (red) */}
                <Bar dataKey="extraBar" stackId="health" maxBarSize={18} fill="rgba(239,68,68,0.55)"
                  radius={[0, 4, 4, 0]} />

                {/* Invisible bar anchoring the delta labels at the right edge */}
                <Bar dataKey="labelBar" stackId="health" maxBarSize={18} fill="transparent"
                  radius={[0, 0, 0, 0]}>
                  <LabelList content={renderDeltaLabel} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Right — Grade Chart */}
          <div style={{
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: 18,
            boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
            padding: '24px 24px 16px',
            display: 'flex', flexDirection: 'column',
          }}>
            {/* Filters */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <select value={selectedRegion} onChange={e => { setSelectedRegion(e.target.value); setSelectedBranch(''); }} style={selectStyle}>
                <option value="">Region ▾</option>
                {Object.keys(REGIONS).map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <select value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)} style={selectStyle}>
                <option value="">Branch ▾</option>
                {availableBranches.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              {(selectedRegion || selectedBranch) && (
                <button onClick={() => { setSelectedRegion(''); setSelectedBranch(''); }}
                  style={{ fontSize: 11, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: 6, fontWeight: 700 }}>
                  ✕ Clear
                </button>
              )}
            </div>

            <h3 style={{ margin: '0 0 14px', fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>
              Student's Grade
            </h3>

            <div style={{
              border: '1px solid var(--border)', borderRadius: 14,
              background: 'var(--bg)', padding: '16px 8px 8px', flex: 1,
            }}>
              <ResponsiveContainer width="100%" height={440}>
                <BarChart data={gradeChartData} margin={{ top: 16, right: 16, left: -8, bottom: 8 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="grade" tick={{ fontSize: 12, fill: '#64748b', fontWeight: 600 }}
                    tickLine={false} axisLine={{ stroke: 'var(--border)' }}
                    label={{ value: 'Grade', position: 'insideBottom', offset: -2, fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false}
                    label={{ value: 'Students', angle: -90, position: 'insideLeft', offset: 16, fontSize: 11, fill: '#94a3b8' }}
                    domain={[0, gradeChartMax]} />
                  <Tooltip content={<CustomGradeTooltip />} cursor={{ fill: 'rgba(239,68,68,0.06)' }} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={40}>
                    {gradeChartData.map((entry, i) => (
                      <Cell key={entry.grade} fill={[
                        '#ef4444','#f97316','#eab308','#22c55e','#14b8a6','#06b6d4',
                        '#3b82f6','#6366f1','#8b5cf6','#ec4899','#f43f5e','#84cc16',
                      ][i % 12]} />
                    ))}
                    <LabelList dataKey="count" position="top"
                      style={{ fontSize: 11, fill: '#64748b', fontWeight: 700 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* ── Statistics Cards ── */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>
              Branch Statistics
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>
                {cardBranches.length} branch{cardBranches.length !== 1 ? 'es' : ''}
              </span>
              {(selectedRegion || selectedBranch) && (
                <span style={{ padding: '3px 10px', background: 'rgba(99,102,241,0.12)', color: '#818cf8', borderRadius: 20, fontWeight: 700, fontSize: 12 }}>
                  {selectedBranch || selectedRegion}
                </span>
              )}
            </div>
          </div>

          {cardBranches.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
              No branches match the current filter.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14 }}>
              {cardBranches.map(branch => (
                <BranchCard key={branch.code} branch={branch} filtered={isFiltered(branch.code)} prevData={previousData} />
              ))}
            </div>
          )}
        </div>

        {/* ── Legend ── */}
        <div className="card" style={{
          padding: '12px 18px', fontSize: 12, color: 'var(--muted)',
          display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center',
        }}>
          <strong style={{ color: 'var(--text)' }}>Backlog % Legend:</strong>
          <span><span style={{ color: '#22c55e', fontWeight: 700 }}>● Green</span> — below 20%</span>
          <span><span style={{ color: '#f59e0b', fontWeight: 700 }}>● Yellow</span> — 20% to 50%</span>
          <span><span style={{ color: '#ef4444', fontWeight: 700 }}>● Red</span> — above 50%</span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 16 }}>
            <span><strong style={{ color: '#22c55e' }}>↓</strong> Delta = improvement (backlog cleared)</span>
            <span><strong style={{ color: '#ef4444' }}>↑</strong> Delta = regression (backlog increased)</span>
          </span>
        </div>
      </div>
    </div>
  );
}
