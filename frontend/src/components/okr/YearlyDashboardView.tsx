import { useMemo, useState } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
  BarChart, Cell,
} from 'recharts';
import { CHART_COLORS as C, BRANCH_META } from '../../lib/okr/constants';
import { calcMetrics, getRateColor } from '../../lib/okr/utils';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function getYear(rec: any): number {
  return new Date((rec.week_date ?? '').slice(0, 10) + 'T00:00:00').getFullYear();
}

// ── Monthly chart data (all branches combined) ──
function buildMonthData(records: any[], year: number) {
  return MONTHS.map((label, i) => {
    const month = i + 1;
    const recs = records.filter(r => {
      const d = new Date((r.week_date ?? '').slice(0, 10) + 'T00:00:00');
      return d.getFullYear() === year && (d.getMonth() + 1) === month;
    });
    const metrics = recs.map(r => calcMetrics(r));
    return {
      month,        Absent:       metrics.reduce((s, m) => s + m.totalAbsent, 0),
      Attended:     metrics.reduce((s, m) => s + m.totalAttended, 0),
      Frozen:       metrics.reduce((s, m) => s + m.totalFrozen, 0),
      Replaced:     metrics.reduce((s, m) => s + m.totalReplaced, 0),
      AttendedLine: metrics.reduce((s, m) => s + m.totalAttended, 0),
      label,
    };
  });
}

// ── Per-branch yearly metrics ──
function buildBranchData(records: any[], year: number) {
  const byBranch: Record<string, any[]> = {};
  for (const r of records) {
    if (getYear(r) !== year) continue;
    if (!byBranch[r.branch]) byBranch[r.branch] = [];
    byBranch[r.branch].push(r);
  }
  return Object.entries(byBranch)
    .map(([branch, recs]) => {
      const metrics = recs.map(r => calcMetrics(r));
      const avgRate   = metrics.reduce((s, m) => s + m.attendanceRate, 0) / metrics.length;
      const avgFreeze = metrics.reduce((s, m) => s + m.attendanceRateWithFreeze, 0) / metrics.length;
      const totalAttendance = metrics.reduce((s, m) => s + m.totalAttendance, 0);
      const totalAttended   = metrics.reduce((s, m) => s + m.totalAttended, 0);
      const totalAbsent     = metrics.reduce((s, m) => s + m.totalAbsent, 0);
      const totalFrozen     = metrics.reduce((s, m) => s + m.totalFrozen, 0);
      const totalReplaced   = metrics.reduce((s, m) => s + m.totalReplaced, 0);
      const weeks = new Set(recs.map(r => r.week_date?.slice(0, 10))).size;
      const meta  = BRANCH_META[branch] ?? {};
      return { branch, code: meta.code ?? branch.slice(0, 4), region: meta.region ?? '?',
               avgRate, avgFreeze, totalAttendance, totalAttended, totalAbsent, totalFrozen, totalReplaced, weeks };
    })
    .sort((a, b) => b.avgRate - a.avgRate);
}

// ── Year overall metrics ──
function buildYearMet(records: any[], year: number) {
  const recs = records.filter(r => getYear(r) === year);
  if (!recs.length) return null;
  const metrics = recs.map(r => calcMetrics(r));
  return {
    avgRate:      metrics.reduce((s, m) => s + m.attendanceRate, 0) / metrics.length,
    avgFreeze:    metrics.reduce((s, m) => s + m.attendanceRateWithFreeze, 0) / metrics.length,
    totalAttendance: metrics.reduce((s, m) => s + m.totalAttendance, 0),
    totalAttended:   metrics.reduce((s, m) => s + m.totalAttended, 0),
    totalAbsent:     metrics.reduce((s, m) => s + m.totalAbsent, 0),
    totalFrozen:     metrics.reduce((s, m) => s + m.totalFrozen, 0),
    totalReplaced:   metrics.reduce((s, m) => s + m.totalReplaced, 0),
    weeks:   new Set(recs.map(r => r.week_date?.slice(0, 10))).size,
    branches: new Set(recs.map(r => r.branch)).size,
  };
}

function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="okrChartTooltip">
      <div className="okrChartTooltipTitle">{label}</div>
      {payload.filter((p: any) => p.dataKey !== 'AttendedLine').map((p: any) => (
        <div key={p.dataKey} className="okrChartTooltipRow">
          <span className="okrChartTooltipDot" style={{ background: p.fill || p.stroke }} />
          <span>{p.dataKey}</span>
          <strong>{typeof p.value === 'number' && p.value % 1 !== 0 ? `${p.value.toFixed(1)}%` : (p.value as number).toLocaleString()}</strong>
        </div>
      ))}
    </div>
  );
}

function BranchRateTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="okrChartTooltip">
      <div className="okrChartTooltipTitle">{d?.branch ?? label}</div>
      <div className="okrChartTooltipRow"><span>Avg Rate</span><strong style={{ color: getRateColor(d?.avgRate) }}>{d?.avgRate?.toFixed(1)}%</strong></div>
      <div className="okrChartTooltipRow"><span>Rate w/ Freeze</span><strong style={{ color: getRateColor(d?.avgFreeze) }}>{d?.avgFreeze?.toFixed(1)}%</strong></div>
      <div className="okrChartTooltipRow"><span>Weeks of Data</span><strong>{d?.weeks}</strong></div>
    </div>
  );
}

export function YearlyDashboardView({ allRecords }: { allRecords: any[] }) {
  const availableYears = useMemo(() => {
    const ys = new Set<number>();
    for (const r of allRecords) { const y = getYear(r); if (!isNaN(y)) ys.add(y); }
    return Array.from(ys).sort((a, b) => a - b);
  }, [allRecords]);

  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear());
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);

  const activeYear  = availableYears.includes(selectedYear) ? selectedYear : (availableYears[availableYears.length - 1] ?? new Date().getFullYear());
  const monthData   = useMemo(() => buildMonthData(allRecords, activeYear), [allRecords, activeYear]);
  const branchData  = useMemo(() => buildBranchData(allRecords, activeYear), [allRecords, activeYear]);
  const yearMet     = useMemo(() => buildYearMet(allRecords, activeYear), [allRecords, activeYear]);

  // Branch monthly breakdown (for selected branch detail)
  const branchMonthData = useMemo(() => {
    if (!selectedBranch) return null;
    const recs = allRecords.filter(r => r.branch === selectedBranch && getYear(r) === activeYear);
    return buildMonthData(recs, activeYear);
  }, [allRecords, selectedBranch, activeYear]);

  if (!allRecords.length) {
    return (
      <div className="okrEmptyHero">
        <div className="okrEmptyIcon">📆</div>
        <h3>No yearly data yet</h3>
        <p>Data auto-aggregates from weekly entries once added</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* ── Year selector ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {availableYears.map(y => (
          <button key={y} type="button" onClick={() => { setSelectedYear(y); setSelectedBranch(null); }} style={{
            padding: '7px 24px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 15,
            background: activeYear === y ? 'var(--brand, #e1251b)' : '#e5e7eb',
            color: activeYear === y ? '#fff' : '#374151',
          }}>{y}</button>
        ))}
      </div>

      {/* ── Overall year KPIs ── */}
      {yearMet && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
          {[
            { label: 'Avg Rate',    val: `${yearMet.avgRate.toFixed(1)}%`,    color: getRateColor(yearMet.avgRate) },
            { label: 'Rate+Freeze', val: `${yearMet.avgFreeze.toFixed(1)}%`,  color: getRateColor(yearMet.avgFreeze) },
            { label: 'Attended',    val: yearMet.totalAttended.toLocaleString(),   color: C.Attended },
            { label: 'Absent',      val: yearMet.totalAbsent.toLocaleString(),     color: C.Absent },
            { label: 'Frozen',      val: yearMet.totalFrozen.toLocaleString(),     color: C.Frozen },
            { label: 'Replaced',    val: yearMet.totalReplaced.toLocaleString(),   color: C.Replaced },
            { label: 'Weeks',       val: String(yearMet.weeks),                    color: 'var(--text)' },
            { label: 'Branches',    val: String(yearMet.branches),                 color: 'var(--text)' },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ background: '#fff', border: '1.5px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--textSecondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color }}>{val}</div>
            </div>
          ))}
        </div>
      )}

      {/* ══ CHART 1: Overall Monthly Breakdown ══ */}
      <div className="okrChartWrap">
        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--textSecondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
          📊 Overall — {activeYear} Monthly Attendance (All Branches)
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={monthData} margin={{ top: 8, right: 16, left: -20, bottom: 0 }} barCategoryGap="24%">
            <CartesianGrid strokeDasharray="4 4" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12, fontWeight: 700, fill: 'var(--textSecondary)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '0.78rem', paddingTop: 8 }}
              formatter={(val) => val === 'AttendedLine' ? null : val} />
            <Bar dataKey="Absent"   fill={C.Absent}   radius={[4,4,0,0]} maxBarSize={22} />
            <Bar dataKey="Attended" fill={C.Attended} radius={[4,4,0,0]} maxBarSize={22} />
            <Bar dataKey="Frozen"   fill={C.Frozen}   radius={[4,4,0,0]} maxBarSize={22} />
            <Bar dataKey="Replaced" fill={C.Replaced} radius={[4,4,0,0]} maxBarSize={22} />
            <Line dataKey="AttendedLine" name="AttendedLine" stroke={C.Attended} strokeWidth={2}
              dot={{ r: 4, fill: C.Attended, stroke: '#fff', strokeWidth: 2 }}
              activeDot={{ r: 6 }} type="monotone" legendType="none" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ══ CHART 2: Branch Attendance Rate Comparison ══ */}
      {branchData.length > 0 && (
        <div className="okrChartWrap">
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--textSecondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            🏢 {activeYear} Avg Attendance Rate — All Branches (click to drill down)
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={branchData} margin={{ top: 4, right: 8, left: -24, bottom: 40 }} barCategoryGap="18%">
              <CartesianGrid strokeDasharray="4 4" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="code" tick={{ fontSize: 10, fontWeight: 700, fill: 'var(--textSecondary)', angle: -40, textAnchor: 'end', dy: 6 }} axisLine={false} tickLine={false} interval={0} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--muted)' }} axisLine={false} tickLine={false} unit="%" />
              <Tooltip content={<BranchRateTip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
              <Bar dataKey="avgRate" radius={[5,5,0,0]} maxBarSize={30} onClick={(d) => setSelectedBranch(prev => prev === d.branch ? null : d.branch)}>
                {branchData.map(d => (
                  <Cell key={d.branch}
                    fill={selectedBranch === d.branch ? '#6366f1' : getRateColor(d.avgRate)}
                    opacity={selectedBranch && selectedBranch !== d.branch ? 0.45 : 1}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ══ Branch breakdown list ══ */}
      {branchData.length > 0 && (
        <div>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--textSecondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 }}>
            Branch Breakdown — {activeYear}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {branchData.map((b, i) => (
              <div
                key={b.branch}
                onClick={() => setSelectedBranch(prev => prev === b.branch ? null : b.branch)}
                style={{
                  background: selectedBranch === b.branch ? '#f5f3ff' : '#fff',
                  border: `1.5px solid ${selectedBranch === b.branch ? '#6366f1' : 'var(--border)'}`,
                  borderRadius: 10, padding: '12px 16px', cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {/* Branch header row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: selectedBranch === b.branch ? 12 : 0 }}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', background: getRateColor(b.avgRate), color: '#fff', fontSize: '0.68rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                  <span style={{ fontWeight: 700, flex: 1 }}>{b.branch}</span>
                  <span style={{ fontSize: '0.72rem', background: '#f1f5f9', color: 'var(--textSecondary)', borderRadius: 5, padding: '2px 7px', fontWeight: 600 }}>R{b.region}</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--textSecondary)', minWidth: 55 }}>{b.weeks} wks</span>
                  {/* Rate bar */}
                  <div style={{ width: 120, background: '#f1f5f9', borderRadius: 6, height: 8, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(b.avgRate, 100)}%`, height: '100%', background: getRateColor(b.avgRate), borderRadius: 6 }} />
                  </div>
                  <span style={{ fontWeight: 800, fontSize: '0.95rem', color: getRateColor(b.avgRate), minWidth: 52, textAlign: 'right' }}>{b.avgRate.toFixed(1)}%</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--textSecondary)' }}>{selectedBranch === b.branch ? '▲' : '▼'}</span>
                </div>

                {/* Drill-down: monthly chart for this branch */}
                {selectedBranch === b.branch && branchMonthData && (
                  <div>
                    {/* Branch KPI row */}
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                      {[
                        { label: 'Rate+Freeze', val: `${b.avgFreeze.toFixed(1)}%`, color: getRateColor(b.avgFreeze) },
                        { label: 'Attended',    val: b.totalAttended.toLocaleString(),   color: C.Attended },
                        { label: 'Absent',      val: b.totalAbsent.toLocaleString(),     color: C.Absent },
                        { label: 'Frozen',      val: b.totalFrozen.toLocaleString(),     color: C.Frozen },
                        { label: 'Replaced',    val: b.totalReplaced.toLocaleString(),   color: C.Replaced },
                        { label: 'Total',       val: b.totalAttendance.toLocaleString(), color: 'var(--text)' },
                      ].map(({ label, val, color }) => (
                        <div key={label} style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', minWidth: 90 }}>
                          <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--textSecondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
                          <div style={{ fontSize: '1rem', fontWeight: 800, color }}>{val}</div>
                        </div>
                      ))}
                    </div>

                    {/* Branch monthly chart */}
                    <ResponsiveContainer width="100%" height={200}>
                      <ComposedChart data={branchMonthData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }} barCategoryGap="24%">
                        <CartesianGrid strokeDasharray="4 4" stroke="var(--border)" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fontWeight: 600, fill: 'var(--textSecondary)' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '0.75rem', paddingTop: 6 }}
                          formatter={(val) => val === 'AttendedLine' ? null : val} />
                        <Bar dataKey="Absent"   fill={C.Absent}   radius={[3,3,0,0]} maxBarSize={18} />
                        <Bar dataKey="Attended" fill={C.Attended} radius={[3,3,0,0]} maxBarSize={18} />
                        <Bar dataKey="Frozen"   fill={C.Frozen}   radius={[3,3,0,0]} maxBarSize={18} />
                        <Bar dataKey="Replaced" fill={C.Replaced} radius={[3,3,0,0]} maxBarSize={18} />
                        <Line dataKey="AttendedLine" name="AttendedLine" stroke={C.Attended} strokeWidth={2}
                          dot={{ r: 3, fill: C.Attended, stroke: '#fff', strokeWidth: 2 }}
                          activeDot={{ r: 5 }} type="monotone" legendType="none" />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
