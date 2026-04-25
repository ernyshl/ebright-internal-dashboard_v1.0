import { useMemo } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { CHART_COLORS as C } from '../../lib/okr/constants';
import { calcMetrics, getRateColor } from '../../lib/okr/utils';

function n(val: any): number {
  const v = parseFloat(val);
  return isNaN(v) ? 0 : v;
}

interface YearGroup {
  year: number;
  weeks: number;
  totalAbsent: number;
  totalAttended: number;
  totalFrozen: number;
  totalReplaced: number;
  totalAttendance: number;
  avgRate: number;
  avgRateWithFreeze: number;
  totalActive: number;
  branchCount: number;
}

function buildYearGroups(records: any[]): YearGroup[] {
  const byYear: Record<number, any[]> = {};
  for (const r of records) {
    const year = new Date((r.week_date ?? '').slice(0, 10) + 'T00:00:00').getFullYear();
    if (!isNaN(year)) {
      if (!byYear[year]) byYear[year] = [];
      byYear[year].push(r);
    }
  }
  return Object.entries(byYear)
    .map(([yearStr, recs]) => {
      const year = Number(yearStr);
      const metrics = recs.map(r => calcMetrics(r));
      const totalAbsent   = metrics.reduce((s, m) => s + m.totalAbsent, 0);
      const totalAttended = metrics.reduce((s, m) => s + m.totalAttended, 0);
      const totalFrozen   = metrics.reduce((s, m) => s + m.totalFrozen, 0);
      const totalReplaced = metrics.reduce((s, m) => s + m.totalReplaced, 0);
      const totalAttendance = totalAbsent + totalAttended + totalFrozen + totalReplaced;
      const avgRate = metrics.length > 0
        ? metrics.reduce((s, m) => s + m.attendanceRate, 0) / metrics.length : 0;
      const avgRateWithFreeze = metrics.length > 0
        ? metrics.reduce((s, m) => s + m.attendanceRateWithFreeze, 0) / metrics.length : 0;
      const totalActive = recs.reduce((s: number, r: any) => s + n(r.active_students), 0);
      const uniqueWeeks = new Set(recs.map((r: any) => r.week_date?.slice(0, 10))).size;
      const uniqueBranches = new Set(recs.map((r: any) => r.branch)).size;
      return {
        year, weeks: uniqueWeeks, branchCount: uniqueBranches,
        totalAbsent, totalAttended, totalFrozen, totalReplaced, totalAttendance,
        avgRate, avgRateWithFreeze, totalActive,
      };
    })
    .sort((a, b) => a.year - b.year);
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
          <strong>{(p.value as number).toLocaleString()}</strong>
        </div>
      ))}
    </div>
  );
}

export function YearlyDashboardView({ allRecords }: { allRecords: any[] }) {
  const yearGroups = useMemo(() => buildYearGroups(allRecords), [allRecords]);

  if (!yearGroups.length) {
    return (
      <div className="okrEmptyHero">
        <div className="okrEmptyIcon">📆</div>
        <h3>No yearly data yet</h3>
        <p>Data auto-aggregates from weekly entries once added</p>
      </div>
    );
  }

  const chartData = yearGroups.map(g => ({
    year: String(g.year),
    Absent:       g.totalAbsent,
    Attended:     g.totalAttended,
    Frozen:       g.totalFrozen,
    Replaced:     g.totalReplaced,
    AttendedLine: g.totalAttended,
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Year metric cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
        {yearGroups.map(g => (
          <div key={g.year} style={{ background: '#fff', border: '1.5px solid var(--border)', borderRadius: 14, padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text)' }}>{g.year}</span>
              <span style={{ fontSize: '0.7rem', background: '#f1f5f9', color: 'var(--textSecondary)', borderRadius: 6, padding: '2px 8px', fontWeight: 600 }}>
                {g.weeks} weeks · {g.branchCount} branches
              </span>
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: getRateColor(g.avgRate), lineHeight: 1 }}>
              {g.avgRate.toFixed(1)}%
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--textSecondary)', marginTop: 2, marginBottom: 12 }}>Avg Attendance Rate</div>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {[
                ['Rate w/ Freeze', `${g.avgRateWithFreeze.toFixed(1)}%`, getRateColor(g.avgRateWithFreeze)],
                ['Total Attendance', g.totalAttendance.toLocaleString(), 'var(--text)'],
                ['Total Attended', g.totalAttended.toLocaleString(), C.Attended],
                ['Total Absent', g.totalAbsent.toLocaleString(), C.Absent],
                ['Total Frozen', g.totalFrozen.toLocaleString(), C.Frozen],
                ['Total Replaced', g.totalReplaced.toLocaleString(), C.Replaced],
              ].map(([label, val, color]) => (
                <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                  <span style={{ color: 'var(--textSecondary)' }}>{label}</span>
                  <strong style={{ color: color as string }}>{val}</strong>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── Year-over-year attendance bar chart ── */}
      <div className="okrChartWrap">
        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--textSecondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
          Year-over-Year Attendance Breakdown
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: -20, bottom: 0 }} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="4 4" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="year" tick={{ fontSize: 14, fontWeight: 700, fill: 'var(--textSecondary)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '0.78rem', paddingTop: 8 }}
              formatter={(val) => val === 'AttendedLine' ? null : val} />
            <Bar dataKey="Absent"   fill={C.Absent}   radius={[4,4,0,0]} maxBarSize={60} />
            <Bar dataKey="Attended" fill={C.Attended} radius={[4,4,0,0]} maxBarSize={60} />
            <Bar dataKey="Frozen"   fill={C.Frozen}   radius={[4,4,0,0]} maxBarSize={60} />
            <Bar dataKey="Replaced" fill={C.Replaced} radius={[4,4,0,0]} maxBarSize={60} />
            <Line dataKey="AttendedLine" name="AttendedLine" stroke={C.Attended} strokeWidth={2.5}
              dot={{ r: 5, fill: C.Attended, stroke: '#fff', strokeWidth: 2 }}
              activeDot={{ r: 7 }} type="monotone" legendType="none" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ── Attendance rate horizontal bars ── */}
      <div className="okrChartWrap">
        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--textSecondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>
          Avg Attendance Rate — Year over Year
        </div>
        {yearGroups.map(g => (
          <div key={g.year} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 5 }}>
              <span style={{ width: 44, fontWeight: 800, fontSize: '0.9rem', color: 'var(--text)' }}>{g.year}</span>
              <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 8, height: 22, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(g.avgRate, 100)}%`, height: '100%', background: getRateColor(g.avgRate), borderRadius: 8, transition: 'width 0.6s ease', display: 'flex', alignItems: 'center', paddingLeft: 8 }} />
              </div>
              <span style={{ width: 56, textAlign: 'right', fontWeight: 700, color: getRateColor(g.avgRate), fontSize: '0.95rem' }}>
                {g.avgRate.toFixed(1)}%
              </span>
              <span style={{ fontSize: '0.72rem', color: 'var(--textSecondary)', minWidth: 60 }}>({g.weeks} wks)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 44, fontSize: '0.7rem', color: 'var(--textSecondary)' }}>+Freeze</span>
              <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 8, height: 13, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(g.avgRateWithFreeze, 100)}%`, height: '100%', background: getRateColor(g.avgRateWithFreeze), opacity: 0.55, borderRadius: 8, transition: 'width 0.6s ease' }} />
              </div>
              <span style={{ width: 56, textAlign: 'right', fontSize: '0.8rem', color: getRateColor(g.avgRateWithFreeze) }}>
                {g.avgRateWithFreeze.toFixed(1)}%
              </span>
              <span style={{ minWidth: 60 }} />
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
