import { useMemo, useState } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { CHART_COLORS as C } from '../../lib/okr/constants';
import { calcMetrics, getRateColor } from '../../lib/okr/utils';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function n(val: any): number {
  const v = parseFloat(val);
  return isNaN(v) ? 0 : v;
}

function buildMonthData(records: any[], year: number) {
  return MONTHS.map((label, i) => {
    const month = i + 1;
    const recs = records.filter(r => {
      const d = new Date((r.week_date ?? '').slice(0, 10) + 'T00:00:00');
      return d.getFullYear() === year && (d.getMonth() + 1) === month;
    });
    const metrics = recs.map(r => calcMetrics(r));
    return {
      month:        label,
      Absent:       metrics.reduce((s, m) => s + m.totalAbsent, 0),
      Attended:     metrics.reduce((s, m) => s + m.totalAttended, 0),
      Frozen:       metrics.reduce((s, m) => s + m.totalFrozen, 0),
      Replaced:     metrics.reduce((s, m) => s + m.totalReplaced, 0),
      AttendedLine: metrics.reduce((s, m) => s + m.totalAttended, 0),
    };
  });
}

function buildYearMetrics(records: any[], year: number) {
  const recs = records.filter(r => {
    const d = new Date((r.week_date ?? '').slice(0, 10) + 'T00:00:00');
    return d.getFullYear() === year;
  });
  if (!recs.length) return null;
  const metrics = recs.map(r => calcMetrics(r));
  const totalAbsent   = metrics.reduce((s, m) => s + m.totalAbsent, 0);
  const totalAttended = metrics.reduce((s, m) => s + m.totalAttended, 0);
  const totalFrozen   = metrics.reduce((s, m) => s + m.totalFrozen, 0);
  const totalReplaced = metrics.reduce((s, m) => s + m.totalReplaced, 0);
  const totalAttendance = totalAbsent + totalAttended + totalFrozen + totalReplaced;
  const avgRate = metrics.reduce((s, m) => s + m.attendanceRate, 0) / metrics.length;
  const avgFreeze = metrics.reduce((s, m) => s + m.attendanceRateWithFreeze, 0) / metrics.length;
  const uniqueWeeks = new Set(recs.map(r => r.week_date?.slice(0, 10))).size;
  const uniqueBranches = new Set(recs.map(r => r.branch)).size;
  return { totalAbsent, totalAttended, totalFrozen, totalReplaced, totalAttendance, avgRate, avgFreeze, uniqueWeeks, uniqueBranches };
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
  const availableYears = useMemo(() => {
    const ys = new Set<number>();
    for (const r of allRecords) {
      const y = new Date((r.week_date ?? '').slice(0, 10) + 'T00:00:00').getFullYear();
      if (!isNaN(y)) ys.add(y);
    }
    return Array.from(ys).sort((a, b) => a - b);
  }, [allRecords]);

  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear());

  const activeYear = availableYears.includes(selectedYear) ? selectedYear : (availableYears[availableYears.length - 1] ?? new Date().getFullYear());
  const monthData  = useMemo(() => buildMonthData(allRecords, activeYear), [allRecords, activeYear]);
  const yearMet    = useMemo(() => buildYearMetrics(allRecords, activeYear), [allRecords, activeYear]);

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Year selector ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {availableYears.map(y => (
          <button key={y} type="button" onClick={() => setSelectedYear(y)} style={{
            padding: '7px 22px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 15,
            background: activeYear === y ? 'var(--brand, #e1251b)' : '#e5e7eb',
            color: activeYear === y ? '#fff' : '#374151',
          }}>{y}</button>
        ))}
      </div>

      {/* ── Month-by-month chart (same style as daily chart) ── */}
      <div className="okrChartWrap">
        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--textSecondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
          {activeYear} — Monthly Attendance Breakdown
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={monthData} margin={{ top: 8, right: 16, left: -20, bottom: 0 }} barCategoryGap="24%">
            <CartesianGrid strokeDasharray="4 4" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 12, fontWeight: 700, fill: 'var(--textSecondary)' }} axisLine={false} tickLine={false} />
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

      {/* ── Year summary metrics ── */}
      {yearMet && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
          {[
            { label: 'Avg Rate',         val: `${yearMet.avgRate.toFixed(1)}%`,         color: getRateColor(yearMet.avgRate) },
            { label: 'Rate w/ Freeze',   val: `${yearMet.avgFreeze.toFixed(1)}%`,       color: getRateColor(yearMet.avgFreeze) },
            { label: 'Total Attendance', val: yearMet.totalAttendance.toLocaleString(), color: 'var(--text)' },
            { label: 'Attended',         val: yearMet.totalAttended.toLocaleString(),   color: C.Attended },
            { label: 'Absent',           val: yearMet.totalAbsent.toLocaleString(),     color: C.Absent },
            { label: 'Frozen',           val: yearMet.totalFrozen.toLocaleString(),     color: C.Frozen },
            { label: 'Replaced',         val: yearMet.totalReplaced.toLocaleString(),   color: C.Replaced },
            { label: 'Weeks of Data',    val: String(yearMet.uniqueWeeks),             color: 'var(--text)' },
            { label: 'Branches',         val: String(yearMet.uniqueBranches),          color: 'var(--text)' },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ background: '#fff', border: '1.5px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--textSecondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color }}>{val}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
