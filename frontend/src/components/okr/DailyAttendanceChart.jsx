import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { DAYS, CHART_COLORS as C } from '../../lib/okr/constants';
import { n } from '../../lib/okr/utils';

function Tip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="okrChartTooltip">
      <div className="okrChartTooltipTitle">{label}</div>
      {payload.filter(p => p.dataKey !== 'AttendedLine').map(p => (
        <div key={p.dataKey} className="okrChartTooltipRow">
          <span className="okrChartTooltipDot" style={{ background: p.fill || p.stroke }} />
          <span>{p.dataKey}</span>
          <strong>{p.value}</strong>
        </div>
      ))}
    </div>
  );
}

export function DailyAttendanceChart({ record: r }) {
  if (!r) return null;

  const data = DAYS.map(d => ({
    day:          d.label,
    Absent:       n(r[`${d.key}_absent`]),
    Attended:     n(r[`${d.key}_attended`]),
    Frozen:       n(r[`${d.key}_frozen`]),
    Replaced:     n(r[`${d.key}_replaced`]),
    AttendedLine: n(r[`${d.key}_attended`]),
  }));

  return (
    <div className="okrChartWrap">
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ top: 8, right: 16, left: -20, bottom: 0 }} barCategoryGap="24%">
          <CartesianGrid strokeDasharray="4 4" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="day" tick={{ fontSize: 12, fontWeight: 700, fill: 'var(--textSecondary)' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip content={<Tip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
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
  );
}
