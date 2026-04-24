import { useState, useMemo, useEffect } from 'react';
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

const BRANCH_LIST = ['ONL','ST','CJY','SA','PJY','AMP','BBB','DK','KLG','KD','SHA','DA','SP','BSP','EGR','BTHO','RBY','TSG','KW','KTG'];
const GRADE_OPTIONS = ['G1','G2','G3','G4','G5','G6','G7','G8','GA1','GA2','GA3','GA4','GB1','GB2','GB3','GB4'];

const REGIONS: Record<string, string[]> = {
  'Region A': ['RBY', 'KLG', 'SHA', 'SA', 'DA', 'EGR', 'ST'],
  'Region B': ['DK', 'KD', 'AMP', 'SP', 'BTHO', 'KTG', 'TSG'],
  'Region C': ['PJY', 'KW', 'BBB', 'CJY', 'BSP', 'ONL'],
};

function getBacklogColor(backlog: number, active: number) {
  if (active === 0) return '#6b7280';
  const pct = (backlog / active) * 100;
  if (pct > 50) return '#ef4444';
  if (pct >= 20) return '#f59e0b';
  return '#22c55e';
}

function CustomGradeTooltip({ active, payload }: any) {
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

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const delta = d.delta ?? 0;
  const cleared = Math.max(0, delta);
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
          <span style={{ color: 'rgba(255,255,255,0.65)' }}>FA Backlog</span>
          <strong style={{ color: getBacklogColor(d.backlog, d.active) }}>{d.backlog}</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ color: 'rgba(255,255,255,0.65)' }}>Baseline</span>
          <strong style={{ color: '#94a3b8' }}>{d.prev ?? '—'}</strong>
        </div>
        <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '4px 0' }} />
        {delta === 0 && <div style={{ color: '#94a3b8', fontWeight: 600 }}>No change</div>}
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
        <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '4px 0' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ color: 'rgba(255,255,255,0.65)' }}>FA Due</span>
          <strong>{d.active}</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ color: 'rgba(255,255,255,0.65)' }}>FA Attended</span>
          <strong style={{ color: '#22c55e' }}>{d.invited}</strong>
        </div>
      </div>
    </div>
  );
}

export function FaDashboardTestingPage() {
  const navigate = useNavigate();
  const { dbStudents, setDbStudents } = useAcademy();
  const [selectedRegion, setSelectedRegion] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [baselineData, setBaselineData] = useState<Record<string, number>>(() => {
    try { const s = localStorage.getItem('fa_testing_baseline'); if (s) return JSON.parse(s); } catch {}
    return {};
  });
  const [baselineSet, setBaselineSet] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
  const user = getUser();
  const initials = user?.fullName
    ? user.fullName.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    if (dbStudents.length === 0) {
      apiFetch('/api/student-records')
        .then(res => { if (res.data) setDbStudents(res.data); })
        .catch(() => {});
    }
  }, []);

  function onLogout() { clearToken(); navigate('/', { replace: true }); }

  // Compute backlog from student records
  const branchData = useMemo(() => {
    const map: Record<string, { code: string; active: number; invited: number; backlog: number }> = {};
    BRANCH_LIST.forEach(code => { map[code] = { code, active: 0, invited: 0, backlog: 0 }; });
    dbStudents.filter((s: any) => s.status === 'Active').forEach((s: any) => {
      if (!map[s.branch]) map[s.branch] = { code: s.branch, active: 0, invited: 0, backlog: 0 };
      map[s.branch].active  += s.faAttended.length;
      map[s.branch].invited += s.faAttended.filter(Boolean).length;
    });
    Object.values(map).forEach(b => { b.backlog = Math.max(0, b.active - b.invited); });
    return Object.values(map);
  }, [dbStudents]);

  const filteredCodes = useMemo(() => {
    if (selectedBranch) return new Set([selectedBranch]);
    if (selectedRegion) return new Set(REGIONS[selectedRegion] || []);
    return null;
  }, [selectedRegion, selectedBranch]);

  function handleSetBaseline() {
    const snapshot: Record<string, number> = {};
    branchData.forEach(b => { snapshot[b.code] = b.backlog; });
    localStorage.setItem('fa_testing_baseline', JSON.stringify(snapshot));
    setBaselineData(snapshot);
    setBaselineSet(true);
    setTimeout(() => setBaselineSet(false), 2000);
  }

  const chartData = useMemo(() =>
    [...branchData].sort((a, b) => b.backlog - a.backlog).map(b => {
      const prev  = baselineData[b.code] ?? null;
      const delta = prev !== null ? prev - b.backlog : 0;
      return { ...b, prev, delta };
    }),
  [branchData, baselineData]);

  const availableBranches = useMemo(() => {
    if (!selectedRegion) return BRANCH_LIST.slice().sort();
    return (REGIONS[selectedRegion] || []).slice().sort();
  }, [selectedRegion]);

  const cardBranches = useMemo(() => branchData.filter(b => {
    if (selectedBranch) return b.code === selectedBranch;
    if (selectedRegion) return (REGIONS[selectedRegion] || []).includes(b.code);
    return true;
  }), [branchData, selectedRegion, selectedBranch]);

  const totalActive  = branchData.reduce((s, b) => s + b.active, 0);
  const totalBacklog = branchData.reduce((s, b) => s + b.backlog, 0);

  const gradeChartData = useMemo(() => {
    const active = dbStudents.filter((s: any) => s.status === 'Active');
    const byBranch = selectedBranch ? active.filter((s: any) => s.branch === selectedBranch) : active;
    return GRADE_OPTIONS.map(g => ({ grade: g, count: byBranch.filter((s: any) => s.grade === g).length }));
  }, [dbStudents, selectedBranch]);

  const gradeChartMax = useMemo(() => {
    const max = Math.max(...gradeChartData.map(d => d.count), 1);
    return Math.ceil(max / 2) * 2 + 2;
  }, [gradeChartData]);

  const selectStyle: React.CSSProperties = {
    padding: '7px 32px 7px 12px', borderRadius: 9,
    border: '1.5px solid var(--border)', background: 'var(--inputBg)',
    color: 'var(--text)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
    outline: 'none', appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2394a3b8' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', minWidth: 140,
  };

  return (
    <div className="dashboardPage">
      <header className="topbar">
        <div className="topbarLeft">
          <div className="pageTitle">Ebright Internal Dashboard</div>
          <div className="muted small">{user ? `Welcome back, ${user.fullName || user.email}` : 'Welcome'}</div>
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
          <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
            style={{ padding: '4px 8px', fontSize: 16, background: 'transparent', border: 'none', cursor: 'pointer' }}>
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          <button className="btn btnSmall btnDanger" onClick={onLogout}>Log out</button>
        </div>
      </header>

      {/* Header banner */}
      <div style={{
        background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
        padding: '20px 40px 24px', marginBottom: 28,
        borderBottom: '1px solid rgba(99,102,241,0.2)',
        boxShadow: '0 4px 32px rgba(0,0,0,0.35)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <BackButton to="/" label="Back to Home" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 10 }}>
              <div style={{
                width: 64, height: 64, borderRadius: 16,
                background: 'linear-gradient(135deg, rgba(99,102,241,0.5), rgba(139,92,246,0.4))',
                border: '1.5px solid rgba(255,255,255,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34,
              }}>🧪</div>
              <div>
                <h1 style={{ margin: 0, fontSize: 34, fontWeight: 900, color: '#fff', letterSpacing: -0.5 }}>
                  FA Dashboard Testing
                </h1>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
                  Live backlog data from Student Records · {dbStudents.length} students loaded
                </p>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { label: 'Total FA Due', val: totalActive, color: '#818cf8' },
                { label: 'Total Backlog', val: totalBacklog, color: '#f87171' },
              ].map(p => (
                <div key={p.label} style={{
                  padding: '6px 14px', borderRadius: 20,
                  background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', textAlign: 'center',
                }}>
                  <div style={{ fontSize: 17, fontWeight: 800, color: p.color }}>{p.val.toLocaleString()}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>{p.label}</div>
                </div>
              ))}
            </div>
            {/* Filters */}
            <select value={selectedRegion} onChange={e => { setSelectedRegion(e.target.value); setSelectedBranch(''); }} style={selectStyle}>
              <option value="">All Regions</option>
              {Object.keys(REGIONS).map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <select value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)} style={selectStyle}>
              <option value="">All Branches</option>
              {availableBranches.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            {(selectedRegion || selectedBranch) && (
              <button onClick={() => { setSelectedRegion(''); setSelectedBranch(''); }}
                style={{ fontSize: 11, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                ✕ Clear
              </button>
            )}
            <button onClick={handleSetBaseline} style={{
              padding: '9px 20px', borderRadius: 11, fontSize: 13, fontWeight: 700,
              background: baselineSet
                ? 'linear-gradient(135deg,#14532d,#16a34a)'
                : 'linear-gradient(135deg,rgba(16,185,129,0.5),rgba(5,150,105,0.4))',
              color: '#fff', border: '1.5px solid rgba(255,255,255,0.2)',
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
              {baselineSet ? '✅ Baseline Set!' : '📌 Set as Baseline'}
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 40px 40px' }}>
        {dbStudents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)', fontSize: 15 }}>
            Loading student records…
          </div>
        ) : (
          <>
            {/* Two-column: Backlog chart + Grade chart */}
            <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 24, marginBottom: 28 }}>
              {/* Left — Backlog Bar Chart */}
              <div style={{
                background: 'var(--panel)', border: '1px solid var(--border)',
                borderRadius: 18, boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                padding: '24px 24px 16px', overflow: 'hidden',
              }}>
                <h3 style={{ margin: '0 0 18px', fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>
                  Backlog FA to Invite by Branch
                </h3>
                <ResponsiveContainer width="100%" height={560}>
                  <BarChart data={chartData} layout="vertical"
                    margin={{ top: 0, right: 60, left: 8, bottom: 0 }} barCategoryGap="25%">
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false}
                      axisLine={{ stroke: 'var(--border)' }} />
                    <YAxis dataKey="code" type="category"
                      tick={{ fontSize: 11, fill: '#64748b', fontWeight: 700 }}
                      tickLine={false} axisLine={false} width={48} />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(99,102,241,0.06)' }} />
                    <Bar dataKey="backlog" maxBarSize={18} radius={[0, 4, 4, 0]}>
                      {chartData.map(entry => (
                        <Cell key={entry.code}
                          fill={filteredCodes && !filteredCodes.has(entry.code)
                            ? '#e2e8f0'
                            : getBacklogColor(entry.backlog, entry.active)} />
                      ))}
                      <LabelList content={(props: any) => {
                        const { x, y, width, height, index } = props;
                        if (index === undefined || !chartData[index]) return null;
                        const d = chartData[index];
                        const cx = x + (width ?? 0) + 6;
                        const cy = y + (height ?? 0) / 2 + 4;
                        const delta = d.delta ?? 0;
                        if (delta === 0) return (
                          <text x={cx} y={cy} fontSize={10} fontWeight={700} fill="#64748b">{d.backlog} —</text>
                        );
                        const sign = delta > 0 ? '↓' : '↑';
                        const col  = delta > 0 ? '#16a34a' : '#dc2626';
                        return (
                          <g>
                            <text x={cx} y={cy} fontSize={10} fontWeight={700} fill="#64748b">{d.backlog} </text>
                            <text x={cx + 24} y={cy} fontSize={10} fontWeight={800} fill={col}>{sign}{Math.abs(delta)}</text>
                          </g>
                        );
                      }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Right — Grade Chart */}
              <div style={{
                background: 'var(--panel)', border: '1px solid var(--border)',
                borderRadius: 18, boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                padding: '24px 24px 16px', display: 'flex', flexDirection: 'column',
              }}>
                <h3 style={{ margin: '0 0 14px', fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>
                  Student's Grade
                </h3>
                <div style={{ border: '1px solid var(--border)', borderRadius: 14, background: 'var(--bg)', padding: '16px 8px 8px', flex: 1 }}>
                  <ResponsiveContainer width="100%" height={490}>
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

            {/* Branch Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14 }}>
              {cardBranches.map(b => {
                const pct = b.active > 0 ? (b.backlog / b.active) * 100 : 0;
                const color = getBacklogColor(b.backlog, b.active);
                return (
                  <div key={b.code} style={{
                    background: 'var(--panel)', border: `1.5px solid var(--border)`,
                    borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--shadow-sm)',
                  }}>
                    <div style={{
                      background: pct > 50
                        ? 'linear-gradient(135deg,#7f1d1d,#b91c1c)'
                        : pct >= 20
                        ? 'linear-gradient(135deg,#78350f,#b45309)'
                        : 'linear-gradient(135deg,#14532d,#16a34a)',
                      padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <span style={{ color: '#fff', fontWeight: 800, fontSize: 18 }}>{b.code}</span>
                      <span style={{ background: 'rgba(0,0,0,0.2)', color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '2px 8px' }}>
                        {Math.round(pct)}%
                      </span>
                    </div>
                    <div style={{ padding: '14px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 26, fontWeight: 800 }}>
                        <span style={{ color }}>{b.backlog}</span>
                        <span style={{ color: 'var(--muted)', fontSize: 18 }}>&nbsp;/&nbsp;{b.active}</span>
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginTop: 4 }}>
                        FA Backlog / Due
                      </div>
                    </div>
                    <div style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#22c55e' }}>{b.invited}</div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>FA Attended</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
