import { useState, useMemo, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList,
} from 'recharts';
import { BackButton } from '../components/BackButton';
import { apiFetch } from '../lib/api';

/* ─────────────────────────── Initial Data (20 branches, NO DPU) ─────────────────────────── */

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

const GRADE_DATA = [
  { grade: 'G1', count: 9 },
  { grade: 'G2', count: 7 },
  { grade: 'G3', count: 3 },
  { grade: 'G4', count: 8 },
  { grade: 'G5', count: 6 },
  { grade: 'G6', count: 9 },
  { grade: 'G7', count: 3 },
  { grade: 'G8', count: 9 },
];

/* ─────────────────────────── Helpers ─────────────────────────── */

function getBacklogColor(backlog, active) {
  if (active === 0) return '#6b7280';
  const pct = (backlog / active) * 100;
  if (pct > 50) return '#ef4444';   // Red
  if (pct >= 20) return '#f59e0b';  // Yellow
  return '#22c55e';                  // Green
}

function getProgressBarColor(pct) {
  if (pct > 50) return '#ef4444';
  if (pct >= 20) return '#f59e0b';
  return '#22c55e';
}

/* ─────────────────────────── Tooltips ─────────────────────────── */

function CustomBacklogTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{
      background: 'var(--panel)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '8px 14px', boxShadow: 'var(--shadow-md)',
      fontSize: 13, color: 'var(--text)',
    }}>
      <strong>{d.code}</strong>
      <div style={{ color: 'var(--textSecondary)', marginTop: 2 }}>
        Backlog: <strong style={{ color: '#39ff14' }}>{d.backlog}</strong>
      </div>
    </div>
  );
}

function CustomGradeTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{
      background: 'var(--panel)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '8px 14px', boxShadow: 'var(--shadow-md)',
      fontSize: 13, color: 'var(--text)',
    }}>
      <strong>{d.grade}</strong>
      <div style={{ color: 'var(--textSecondary)', marginTop: 2 }}>
        Students: <strong style={{ color: '#ed1c24' }}>{d.count}</strong>
      </div>
    </div>
  );
}

/* ─────────────────────────── Branch Card ─────────────────────────── */

function BranchCard({ branch, filtered }) {
  const pct = branch.active > 0 ? (branch.backlog / branch.active) * 100 : 0;
  const pctRounded = Math.round(pct);
  const backlogNumColor = getBacklogColor(branch.backlog, branch.active);
  const progressColor = getProgressBarColor(pct);

  return (
    <div style={{
      background: 'var(--panel)',
      border: `1.5px solid ${filtered ? '#39ff14' : 'var(--border)'}`,
      borderRadius: 14,
      overflow: 'hidden',
      boxShadow: filtered ? '0 0 0 2px rgba(57,255,20,0.18), var(--shadow-md)' : 'var(--shadow-sm)',
      transition: 'all 0.2s',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Card Header */}
      <div style={{
        background: 'linear-gradient(135deg, #1a6b00 0%, #2d9e00 100%)',
        padding: '10px 14px 8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{ color: '#fff', fontWeight: 800, fontSize: 18, letterSpacing: 0.5 }}>
          {branch.code}
        </span>
        <span style={{
          background: pct > 50 ? 'rgba(239,68,68,0.85)' : pct >= 20 ? 'rgba(245,158,11,0.85)' : 'rgba(34,197,94,0.85)',
          color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '2px 8px',
        }}>
          {pctRounded}%
        </span>
      </div>

      {/* Main KPI — FA BACKLOG STATUS as fraction */}
      <div style={{
        padding: '14px 14px 10px',
        borderBottom: '1px solid var(--border)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1 }}>
          <span style={{ color: backlogNumColor }}>{branch.backlog}</span>
          <span style={{ color: 'var(--muted)', fontSize: 18, fontWeight: 500 }}>
            &nbsp;/&nbsp;{branch.active}
          </span>
        </div>
        <div style={{
          fontSize: 10, fontWeight: 700, color: 'var(--textSecondary)',
          textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 4,
        }}>
          FA Backlog Status
        </div>
        {/* Progress bar */}
        <div style={{
          height: 4, background: 'var(--border)', borderRadius: 99, marginTop: 8, overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${Math.min(pctRounded, 100)}%`,
            background: progressColor,
            borderRadius: 99,
            transition: 'width 0.4s ease',
          }} />
        </div>
        {/* Color legend hint */}
        <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 4 }}>
          <span style={{ color: '#22c55e' }}>●</span> &lt;20%&nbsp;
          <span style={{ color: '#f59e0b' }}>●</span> 20–50%&nbsp;
          <span style={{ color: '#ef4444' }}>●</span> &gt;50%
        </div>
      </div>

      {/* Footer Stats */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        padding: '10px 12px', gap: 8, flex: 1, alignItems: 'stretch',
      }}>
        {/* FA Aone Active */}
        <div style={{
          background: 'var(--bg)', borderRadius: 8, padding: '8px 10px',
          textAlign: 'center', border: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>{branch.active}</div>
          <div style={{ fontSize: 10, color: 'var(--textSecondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>
            FA Aone Active
          </div>
        </div>

        {/* FA Invited */}
        <div style={{
          background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)',
          overflow: 'hidden', display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            fontSize: 11, fontWeight: 800, color: '#39ff14',
            textTransform: 'uppercase', letterSpacing: 0.8,
            textAlign: 'center', padding: '5px 6px 3px',
            borderBottom: '1px solid var(--border)',
            background: 'rgba(57,255,20,0.06)',
          }}>
            FA Invited
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
  // draft = working copy; pendingKeys = set of "code-field" that are unsaved
  const [draft, setDraft]           = useState(() => savedData.map(r => ({ ...r })));
  const [pendingKeys, setPending]   = useState(new Set());
  const [editCell, setEditCell]     = useState(null);
  const [editVal, setEditVal]       = useState('');
  const [toast, setToast]           = useState(false);

  // Sync draft when savedData changes externally (e.g. parent reset)
  const EDITABLE = ['active', 'inv1', 'inv2']; // backlog is read-only (auto-calc)

  const fields = [
    { key: 'active',  label: 'FA Aone Active',     editable: true  },
    { key: 'inv1',    label: 'Invited 18–19 Apr',  editable: true  },
    { key: 'inv2',    label: 'Invited 25–26 Apr',  editable: true  },
    { key: 'backlog', label: 'Backlog (Auto)',      editable: false },
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
    const num = raw === '' ? 0 : parseInt(raw, 10);
    const val = Math.max(0, num);

    setDraft(prev => prev.map(row => {
      if (row.code !== code) return row;
      const updated = { ...row, [field]: val };
      updated.backlog = calcBacklog(updated.active, updated.inv1, updated.inv2);
      return updated;
    }));

    const key = `${code}-${field}`;
    setPending(prev => { const s = new Set(prev); s.add(key); return s; });
    setEditCell(null);
  }

  function handleKey(e, code, field) {
    // Only allow digits
    if (!/[0-9]/.test(e.key) && !['Backspace','Delete','ArrowLeft','ArrowRight','Tab','Enter','Escape'].includes(e.key)) {
      e.preventDefault();
    }
    if (e.key === 'Enter') commitEdit(code, field);
    if (e.key === 'Escape') setEditCell(null);
  }

  function handleSave() {
    onSave(draft);
    setPending(new Set());
    setToast(true);
    setTimeout(() => setToast(false), 2500);
  }

  const hasPending = pendingKeys.size > 0;

  const thStyle = {
    padding: '10px 12px', fontSize: 11, fontWeight: 700,
    color: 'var(--textSecondary)', textTransform: 'uppercase',
    letterSpacing: 0.6, background: 'var(--tableHeaderBg)',
    borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', textAlign: 'left',
  };
  const tdStyle = {
    padding: '8px 12px', fontSize: 13,
    borderBottom: '1px solid var(--borderLight)', color: 'var(--text)',
  };

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          background: '#22c55e', color: '#fff', fontWeight: 700,
          padding: '12px 20px', borderRadius: 10,
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          fontSize: 14, display: 'flex', alignItems: 'center', gap: 8,
          animation: 'fadeIn 0.2s ease',
        }}>
          ✅ Data successfully saved!
        </div>
      )}

      {/* Save bar */}
      <div style={{
        padding: '12px 16px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', borderBottom: '1px solid var(--border)',
        background: hasPending ? 'rgba(245,158,11,0.06)' : 'transparent',
      }}>
        <div style={{ fontSize: 12, color: hasPending ? '#f59e0b' : 'var(--muted)', fontWeight: 600 }}>
          {hasPending ? `⚠️ ${pendingKeys.size} unsaved change${pendingKeys.size > 1 ? 's' : ''}` : 'No unsaved changes'}
        </div>
        <button
          onClick={handleSave}
          disabled={!hasPending}
          style={{
            padding: '7px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700,
            background: hasPending ? '#39ff14' : 'var(--border)',
            color: hasPending ? '#000' : 'var(--muted)',
            border: 'none', cursor: hasPending ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s',
          }}
        >
          💾 Save Data
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
                  {!f.editable && <span style={{ color: 'var(--muted)', fontWeight: 400, marginLeft: 4 }}>(auto)</span>}
                </th>
              ))}
              <th style={{ ...thStyle, color: 'var(--muted)' }}>% Backlog</th>
            </tr>
          </thead>
          <tbody>
            {draft.map((row, i) => {
              const pct = row.active > 0 ? ((row.backlog / row.active) * 100).toFixed(1) : '—';
              const backlogColor = getBacklogColor(row.backlog, row.active);
              return (
                <tr key={row.code} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--tableWrapBg)' }}>
                  <td style={{ ...tdStyle, fontWeight: 700 }}>{row.code}</td>
                  {fields.map(f => {
                    const cellKey = `${row.code}-${f.key}`;
                    const isPending = pendingKeys.has(cellKey);
                    const isEditing = editCell?.code === row.code && editCell?.field === f.key;

                    if (!f.editable) {
                      return (
                        <td key={f.key} style={tdStyle}>
                          <span style={{
                            display: 'inline-block', minWidth: 40,
                            padding: '2px 10px', borderRadius: 6,
                            background: 'var(--borderLight)',
                            color: backlogColor, fontWeight: 700, fontSize: 13,
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
                            autoFocus
                            type="text"
                            inputMode="numeric"
                            value={editVal}
                            onChange={e => setEditVal(e.target.value.replace(/[^0-9]/g, ''))}
                            onBlur={() => commitEdit(row.code, f.key)}
                            onKeyDown={e => handleKey(e, row.code, f.key)}
                            style={{
                              width: 72, padding: '4px 8px', borderRadius: 6,
                              border: '2px solid #39ff14', background: 'var(--inputBg)',
                              color: 'var(--text)', fontSize: 13, outline: 'none',
                            }}
                          />
                        ) : (
                          <span style={{
                            display: 'inline-block', minWidth: 40,
                            padding: '2px 10px', borderRadius: 6,
                            background: isPending ? 'rgba(245,158,11,0.12)' : 'var(--bg)',
                            border: isPending ? '1.5px solid #f59e0b' : '1px solid var(--border)',
                            fontSize: 13, color: 'var(--text)', fontWeight: 500,
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
        <div style={{ fontSize: 11, color: 'var(--muted)', padding: '10px 14px' }}>
          Click any cell to edit · Enter to confirm · Esc to cancel ·
          <span style={{ color: '#f59e0b', fontWeight: 600 }}> Yellow border = unsaved</span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Main Page ─────────────────────────── */

/* Map DB row → internal shape */
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
  const [savedData, setSavedData]   = useState(INITIAL_DATA);
  const [dbLoaded, setDbLoaded]     = useState(false);
  const [loadError, setLoadError]   = useState(null);
  const [selectedRegion, setSelectedRegion] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [showCrude, setShowCrude] = useState(false);

  /* Load from DB on mount */
  useEffect(() => {
    apiFetch('/api/fa-dashboard')
      .then(res => {
        if (res.data && res.data.length > 0) {
          setSavedData(res.data.map(dbToRow));
        }
        setDbLoaded(true);
      })
      .catch(err => {
        setLoadError(err.message);
        setDbLoaded(true); // fall back to INITIAL_DATA
      });
  }, []);

  /* Save to DB, then update local state */
  async function handleSave(committed) {
    const rows = committed.map(b => ({
      branch_code: b.code,
      fa_active:   b.active,
      inv_apr1819: b.inv1,
      inv_apr2526: b.inv2,
    }));
    try {
      const res = await apiFetch('/api/fa-dashboard/save', { method: 'POST', body: { rows } });
      if (res.data) setSavedData(res.data.map(dbToRow));
      else setSavedData(committed);
    } catch {
      // Still update local state even if DB save fails
      setSavedData(committed);
    }
  }

  /* alias used throughout the render */
  const branchData = savedData;

  /* Filters */
  const availableBranches = useMemo(() => {
    if (!selectedRegion) return branchData.map(b => b.code).sort();
    return (REGIONS[selectedRegion] || []).sort();
  }, [selectedRegion, branchData]);

  const filteredCodes = useMemo(() => {
    if (selectedBranch) return new Set([selectedBranch]);
    if (selectedRegion) return new Set(REGIONS[selectedRegion] || []);
    return null;
  }, [selectedRegion, selectedBranch]);

  /* A-Z sorted data — used by table and cards only */
  const sortedAlpha = useMemo(() => {
    return [...branchData].sort((a, b) => a.code.localeCompare(b.code));
  }, [branchData]);

  const cardBranches = useMemo(() => {
    return sortedAlpha.filter(b => {
      if (selectedBranch) return b.code === selectedBranch;
      if (selectedRegion) return (REGIONS[selectedRegion] || []).includes(b.code);
      return true;
    });
  }, [sortedAlpha, selectedRegion, selectedBranch]);

  /* Backlog chart — sorted ascending by value so highest is at top visually */
  const backlogChartData = useMemo(() => {
    return [...branchData].sort((a, b) => a.backlog - b.backlog);
  }, [branchData]);

  const isFiltered = (code) => filteredCodes ? filteredCodes.has(code) : false;

  const backlogBarColor = (code) => {
    if (!filteredCodes) return '#39ff14';
    return filteredCodes.has(code) ? '#39ff14' : '#cbd5e1';
  };

  const selectStyle = {
    padding: '7px 32px 7px 12px', borderRadius: 8,
    border: '1.5px solid var(--border)', background: 'var(--inputBg)',
    color: 'var(--text)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
    outline: 'none', appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2394a3b8' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', minWidth: 140,
  };

  return (
    <div className="dashboardPage">
      {/* Header */}
      <div className="dashboardHeader" style={{ marginBottom: 20 }}>
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16, flex: 1 }}>
          <h1 className="pageHeaderTitle">FA Dashboard</h1>
          <p className="headerSubtitle">Formative Assessment tracking by branch</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto' }}>
          <button
            onClick={() => setShowCrude(v => !v)}
            style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              background: showCrude ? '#39ff14' : 'var(--inputBg)',
              color: showCrude ? '#000' : 'var(--text)',
              border: '1.5px solid #39ff14', cursor: 'pointer',
            }}
          >
            {showCrude ? '▲ Hide' : '▼ Edit Data'}
          </button>
          <span style={{ fontSize: 12, color: loadError ? '#ef4444' : 'var(--muted)', fontWeight: 600 }}>
            {!dbLoaded ? 'Loading…' : loadError ? 'DB Error (local data)' : 'LIVE DATA'}
          </span>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: !dbLoaded ? '#f59e0b' : loadError ? '#ef4444' : '#22c55e', boxShadow: '0 0 0 3px rgba(34,197,94,0.25)' }} />
        </div>
      </div>

      {/* CRUDE Table */}
      {showCrude && (
        <div className="card" style={{ marginBottom: 20, padding: 0, overflow: 'hidden' }}>
          <div style={{
            padding: '14px 16px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
                CRUDE Academy Data
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--muted)' }}>
                Edit values · Backlog auto-calculates · Save to update charts & cards
              </p>
            </div>
          </div>
          <CrudeTable savedData={sortedAlpha} onSave={handleSave} />
        </div>
      )}

      {/* Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginBottom: 20 }}>
        {/* Left — Backlog Bar Chart */}
        <div className="card" style={{ padding: '20px 20px 12px' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
            Backlog FA to Invite by Branch
          </h3>
          <ResponsiveContainer width="100%" height={560}>
            <BarChart data={backlogChartData} layout="vertical" margin={{ top: 0, right: 48, left: 8, bottom: 0 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--textSecondary)' }}
                tickLine={false} axisLine={{ stroke: 'var(--border)' }}
                domain={[0, 700]} ticks={[0, 100, 200, 300, 400, 500, 600, 700]} />
              <YAxis dataKey="code" type="category"
                tick={{ fontSize: 11, fill: 'var(--textSecondary)', fontWeight: 600 }}
                tickLine={false} axisLine={false} width={48} />
              <Tooltip content={<CustomBacklogTooltip />} cursor={{ fill: 'var(--borderLight)' }} />
              <Bar dataKey="backlog" radius={[0, 4, 4, 0]} maxBarSize={18}>
                {backlogChartData.map(entry => (
                  <Cell key={entry.code} fill={backlogBarColor(entry.code)} />
                ))}
                <LabelList dataKey="backlog" position="right"
                  style={{ fontSize: 10, fill: 'var(--textSecondary)', fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Right — Grade Chart with filters */}
        <div className="card" style={{ padding: '20px 20px 12px' }}>
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
                style={{ fontSize: 11, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: 6, fontWeight: 600 }}>
                ✕ Clear
              </button>
            )}
          </div>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
            Student's Grade
          </h3>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={GRADE_DATA} margin={{ top: 20, right: 16, left: -8, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="grade" tick={{ fontSize: 12, fill: 'var(--textSecondary)', fontWeight: 600 }}
                tickLine={false} axisLine={{ stroke: 'var(--border)' }}
                label={{ value: 'Grade', position: 'insideBottom', offset: -2, fontSize: 11, fill: 'var(--muted)' }} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--textSecondary)' }} tickLine={false} axisLine={false}
                label={{ value: 'Record Count', angle: -90, position: 'insideLeft', offset: 16, fontSize: 11, fill: 'var(--muted)' }}
                domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} />
              <Tooltip content={<CustomGradeTooltip />} cursor={{ fill: 'var(--borderLight)' }} />
              <Bar dataKey="count" fill="#ed1c24" radius={[4, 4, 0, 0]} maxBarSize={40}>
                <LabelList dataKey="count" position="top"
                  style={{ fontSize: 11, fill: 'var(--textSecondary)', fontWeight: 700 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Statistics Cards */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Statistics</h2>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>
            {cardBranches.length} branch{cardBranches.length !== 1 ? 'es' : ''}
            {(selectedRegion || selectedBranch) && (
              <span style={{ marginLeft: 8, padding: '2px 8px', background: 'rgba(57,255,20,0.12)', color: '#39ff14', borderRadius: 20, fontWeight: 700 }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {cardBranches.map(branch => (
              <BranchCard key={branch.code} branch={branch} filtered={isFiltered(branch.code)} />
            ))}
          </div>
        )}
      </div>

      {/* Color legend */}
      <div className="card" style={{ padding: '12px 16px', fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <strong style={{ color: 'var(--text)' }}>Backlog % Legend:</strong>
        <span><span style={{ color: '#22c55e', fontWeight: 700 }}>● Green</span> — below 20%</span>
        <span><span style={{ color: '#f59e0b', fontWeight: 700 }}>● Yellow</span> — 20% to 50%</span>
        <span><span style={{ color: '#ef4444', fontWeight: 700 }}>● Red</span> — above 50%</span>
      </div>
    </div>
  );
}
