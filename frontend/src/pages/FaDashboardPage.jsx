import { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList,
} from 'recharts';
import { BackButton } from '../components/BackButton';

/* ─────────────────────────── Static Data ─────────────────────────── */

const ALL_BRANCHES_RAW = [
  { code: 'ONL',  backlog: 646, active: 660, inv1: 8,  inv2: 6  },
  { code: 'ST',   backlog: 507, active: 510, inv1: 7,  inv2: 2  },
  { code: 'CJY',  backlog: 467, active: 480, inv1: 7,  inv2: 6  },
  { code: 'SA',   backlog: 377, active: 390, inv1: 8,  inv2: 5  },
  { code: 'PJY',  backlog: 303, active: 312, inv1: 5,  inv2: 4  },
  { code: 'AMP',  backlog: 303, active: 315, inv1: 6,  inv2: 6  },
  { code: 'BBB',  backlog: 278, active: 296, inv1: 5,  inv2: 9  },
  { code: 'DK',   backlog: 260, active: 271, inv1: 5,  inv2: 6  },
  { code: 'KLG',  backlog: 247, active: 256, inv1: 4,  inv2: 5  },
  { code: 'KD',   backlog: 239, active: 250, inv1: 5,  inv2: 6  },
  { code: 'SHA',  backlog: 169, active: 178, inv1: 4,  inv2: 5  },
  { code: 'DA',   backlog: 146, active: 155, inv1: 4,  inv2: 5  },
  { code: 'SP',   backlog: 123, active: 131, inv1: 4,  inv2: 4  },
  { code: 'BSP',  backlog: 74,  active: 81,  inv1: 3,  inv2: 4  },
  { code: 'EGR',  backlog: 66,  active: 72,  inv1: 3,  inv2: 3  },
  { code: 'BTHO', backlog: 66,  active: 71,  inv1: 3,  inv2: 2  },
  { code: 'RBY',  backlog: 11,  active: 14,  inv1: 2,  inv2: 1  },
  { code: 'TSG',  backlog: 0,   active: 8,   inv1: 3,  inv2: 5  },
  { code: 'KW',   backlog: 0,   active: 5,   inv1: 2,  inv2: 3  },
  { code: 'KTG',  backlog: 0,   active: 6,   inv1: 2,  inv2: 4  },
  { code: 'DPU',  backlog: 0,   active: 0,   inv1: 0,  inv2: 0  },
];

const REGIONS = {
  'Region A': ['RBY', 'KLG', 'SHA', 'SA', 'DA', 'EGR', 'ST'],
  'Region B': ['DK', 'KD', 'AMP', 'SP', 'BTHO', 'KTG', 'TSG'],
  'Region C': ['PJY', 'KW', 'BBB', 'CJY', 'BSP', 'DPU', 'ONL'],
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

/* ─────────────────────────── Sub-components ─────────────────────────── */

function CustomBacklogTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{
      background: 'var(--panel)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: '8px 14px',
      boxShadow: 'var(--shadow-md)',
      fontSize: 13,
      color: 'var(--text)',
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
      background: 'var(--panel)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: '8px 14px',
      boxShadow: 'var(--shadow-md)',
      fontSize: 13,
      color: 'var(--text)',
    }}>
      <strong>{d.grade}</strong>
      <div style={{ color: 'var(--textSecondary)', marginTop: 2 }}>
        Students: <strong style={{ color: '#be185d' }}>{d.count}</strong>
      </div>
    </div>
  );
}

function BranchCard({ branch, filtered }) {
  const pct = branch.active > 0 ? Math.round((branch.backlog / branch.active) * 100) : 0;
  const isHighlight = pct >= 90;

  return (
    <div style={{
      background: 'var(--panel)',
      border: `1.5px solid ${filtered ? '#0d9488' : 'var(--border)'}`,
      borderRadius: 14,
      overflow: 'hidden',
      boxShadow: filtered ? '0 0 0 2px rgba(13,148,136,0.18), var(--shadow-md)' : 'var(--shadow-sm)',
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
          background: isHighlight ? 'rgba(239,68,68,0.85)' : 'rgba(255,255,255,0.2)',
          color: '#fff',
          fontSize: 11,
          fontWeight: 700,
          borderRadius: 20,
          padding: '2px 8px',
        }}>
          {pct}%
        </span>
      </div>

      {/* Main KPI */}
      <div style={{
        padding: '14px 14px 10px',
        borderBottom: '1px solid var(--border)',
        textAlign: 'center',
      }}>
        <div style={{
          fontSize: 26,
          fontWeight: 800,
          color: isHighlight ? 'var(--brand)' : 'var(--text)',
          lineHeight: 1.1,
        }}>
          {branch.backlog}
          <span style={{ color: 'var(--muted)', fontSize: 18, fontWeight: 500 }}>
            &nbsp;/&nbsp;{branch.active}
          </span>
        </div>
        <div style={{
          fontSize: 10,
          fontWeight: 600,
          color: 'var(--textSecondary)',
          textTransform: 'uppercase',
          letterSpacing: 0.8,
          marginTop: 4,
        }}>
          FA Backlog Status
        </div>
        {/* Progress bar */}
        <div style={{
          height: 4,
          background: 'var(--border)',
          borderRadius: 99,
          marginTop: 8,
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${Math.min(pct, 100)}%`,
            background: isHighlight
              ? 'linear-gradient(90deg, #dc2626, #f97316)'
              : 'linear-gradient(90deg, #0d9488, #0891b2)',
            borderRadius: 99,
            transition: 'width 0.4s ease',
          }} />
        </div>
      </div>

      {/* Footer Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        padding: '10px 12px',
        gap: 8,
        flex: 1,
        alignItems: 'stretch',
      }}>
        {/* FA Aone Active */}
        <div style={{
          background: 'var(--bg)',
          borderRadius: 8,
          padding: '8px 10px',
          textAlign: 'center',
          border: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>{branch.active}</div>
          <div style={{ fontSize: 10, color: 'var(--textSecondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6 }}>
            FA Aone Active
          </div>
        </div>

        {/* FA Invited — two stacked sub-boxes */}
        <div style={{
          background: 'var(--bg)',
          borderRadius: 8,
          border: '1px solid var(--border)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <div style={{
            fontSize: 9,
            fontWeight: 700,
            color: '#39ff14',
            textTransform: 'uppercase',
            letterSpacing: 0.6,
            textAlign: 'center',
            padding: '4px 6px 2px',
            borderBottom: '1px solid var(--border)',
          }}>
            FA Invited
          </div>
          <div style={{ display: 'flex', flex: 1 }}>
            <div style={{
              flex: 1,
              textAlign: 'center',
              padding: '4px 4px',
              borderRight: '1px solid var(--border)',
            }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>{branch.inv1}</div>
              <div style={{ fontSize: 9, color: 'var(--textSecondary)', lineHeight: 1.2 }}>18–19<br/>Apr</div>
            </div>
            <div style={{
              flex: 1,
              textAlign: 'center',
              padding: '4px 4px',
            }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>{branch.inv2}</div>
              <div style={{ fontSize: 9, color: 'var(--textSecondary)', lineHeight: 1.2 }}>25–26<br/>Apr</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Main Page ─────────────────────────── */

export function FaDashboardPage() {
  const [selectedRegion, setSelectedRegion] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');

  /* Derive available branches for the branch dropdown */
  const availableBranches = useMemo(() => {
    if (!selectedRegion) return ALL_BRANCHES_RAW.map(b => b.code).sort();
    return (REGIONS[selectedRegion] || []).sort();
  }, [selectedRegion]);

  /* Filtered branch codes for the grade chart */
  const filteredCodes = useMemo(() => {
    if (selectedBranch) return new Set([selectedBranch]);
    if (selectedRegion) return new Set(REGIONS[selectedRegion] || []);
    return null; // null = show all
  }, [selectedRegion, selectedBranch]);

  /* Branches shown in the cards grid */
  const cardBranches = useMemo(() => {
    return ALL_BRANCHES_RAW.filter(b => {
      if (selectedBranch) return b.code === selectedBranch;
      if (selectedRegion) return (REGIONS[selectedRegion] || []).includes(b.code);
      return true;
    });
  }, [selectedRegion, selectedBranch]);

  /* Backlog chart data — always sorted ascending (so highest is at top visually) */
  const backlogChartData = useMemo(() => {
    return [...ALL_BRANCHES_RAW]
      .sort((a, b) => a.backlog - b.backlog);
  }, []);

  /* Grade chart data — unchanged (no per-branch filtering for demo) */
  const gradeData = GRADE_DATA;

  /* Helper: is a branch highlighted by current filter? */
  const isFiltered = (code) => filteredCodes ? filteredCodes.has(code) : false;

  /* Dynamic bar color for backlog chart */
  const backlogBarColor = (code) => {
    if (!filteredCodes) return '#39ff14';
    return filteredCodes.has(code) ? '#39ff14' : '#cbd5e1';
  };

  const gradeBarColor = '#ed1c24';

  const selectStyle = {
    padding: '7px 32px 7px 12px',
    borderRadius: 8,
    border: '1.5px solid var(--border)',
    background: 'var(--inputBg)',
    color: 'var(--text)',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    outline: 'none',
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2394a3b8' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 10px center',
    minWidth: 140,
  };

  return (
    <div className="dashboardPage">
      {/* ── Header ── */}
      <div className="dashboardHeader" style={{ marginBottom: 20 }}>
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16, flex: 1 }}>
          <h1 className="pageHeaderTitle">FA Dashboard</h1>
          <p className="headerSubtitle">Formative Assessment tracking by branch</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>LIVE DATA</span>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: '#22c55e',
            boxShadow: '0 0 0 3px rgba(34,197,94,0.25)',
          }} />
        </div>
      </div>

      {/* ── Charts Row ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1.4fr 1fr',
        gap: 16,
        marginBottom: 20,
      }}>
        {/* Left — Horizontal Backlog Chart */}
        <div className="card" style={{ padding: '20px 20px 12px' }}>
          <h3 style={{
            margin: '0 0 16px',
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--text)',
          }}>
            Backlog FA to Invite by Branch
          </h3>
          <ResponsiveContainer width="100%" height={560}>
            <BarChart
              data={backlogChartData}
              layout="vertical"
              margin={{ top: 0, right: 48, left: 8, bottom: 0 }}
            >
              <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                type="number"
                tick={{ fontSize: 11, fill: 'var(--textSecondary)' }}
                tickLine={false}
                axisLine={{ stroke: 'var(--border)' }}
                domain={[0, 700]}
                ticks={[0, 100, 200, 300, 400, 500, 600, 700]}
              />
              <YAxis
                dataKey="code"
                type="category"
                tick={{ fontSize: 11, fill: 'var(--textSecondary)', fontWeight: 600 }}
                tickLine={false}
                axisLine={false}
                width={48}
              />
              <Tooltip content={<CustomBacklogTooltip />} cursor={{ fill: 'var(--borderLight)' }} />
              <Bar dataKey="backlog" radius={[0, 4, 4, 0]} maxBarSize={18}>
                {backlogChartData.map((entry) => (
                  <Cell key={entry.code} fill={backlogBarColor(entry.code)} />
                ))}
                <LabelList
                  dataKey="backlog"
                  position="right"
                  style={{ fontSize: 10, fill: 'var(--textSecondary)', fontWeight: 600 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Right — Grade Column Chart with filters */}
        <div className="card" style={{ padding: '20px 20px 12px' }}>
          {/* Filter Row inside the chart card */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <select
                value={selectedRegion}
                onChange={e => {
                  setSelectedRegion(e.target.value);
                  setSelectedBranch('');
                }}
                style={selectStyle}
              >
                <option value="">Region ▾</option>
                {Object.keys(REGIONS).map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div style={{ position: 'relative' }}>
              <select
                value={selectedBranch}
                onChange={e => setSelectedBranch(e.target.value)}
                style={selectStyle}
              >
                <option value="">Branch ▾</option>
                {availableBranches.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
            {(selectedRegion || selectedBranch) && (
              <button
                onClick={() => { setSelectedRegion(''); setSelectedBranch(''); }}
                style={{
                  fontSize: 11, color: 'var(--muted)', background: 'none',
                  border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: 6,
                  fontWeight: 600,
                }}
              >
                ✕ Clear
              </button>
            )}
          </div>

          <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
            Student's Grade
          </h3>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart
              data={gradeData}
              margin={{ top: 20, right: 16, left: -8, bottom: 0 }}
            >
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="grade"
                tick={{ fontSize: 12, fill: 'var(--textSecondary)', fontWeight: 600 }}
                tickLine={false}
                axisLine={{ stroke: 'var(--border)' }}
                label={{ value: 'Grade', position: 'insideBottom', offset: -2, fontSize: 11, fill: 'var(--muted)' }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--textSecondary)' }}
                tickLine={false}
                axisLine={false}
                label={{ value: 'Record Count', angle: -90, position: 'insideLeft', offset: 16, fontSize: 11, fill: 'var(--muted)' }}
                domain={[0, 10]}
                ticks={[0, 2, 4, 6, 8, 10]}
              />
              <Tooltip content={<CustomGradeTooltip />} cursor={{ fill: 'var(--borderLight)' }} />
              <Bar dataKey="count" fill={gradeBarColor} radius={[4, 4, 0, 0]} maxBarSize={40}>
                <LabelList
                  dataKey="count"
                  position="top"
                  style={{ fontSize: 11, fill: 'var(--textSecondary)', fontWeight: 700 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Statistics Section ── */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
            Statistics
          </h2>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>
            {cardBranches.length} branch{cardBranches.length !== 1 ? 'es' : ''}
            {(selectedRegion || selectedBranch) && (
              <span style={{
                marginLeft: 8,
                padding: '2px 8px',
                background: 'rgba(13,148,136,0.12)',
                color: '#39ff14',
                borderRadius: 20,
                fontWeight: 700,
              }}>
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
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 12,
          }}>
            {cardBranches.map(branch => (
              <BranchCard
                key={branch.code}
                branch={branch}
                filtered={isFiltered(branch.code)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
