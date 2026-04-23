import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { CHART_COLORS as C } from '../../lib/okr/constants';
import { n } from '../../lib/okr/utils';

const WEEK_LABELS = ['3 Weeks', '2 Weeks', 'Last Week', 'This Week'];

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

export function FourWeekChart({ trendWeeks }) {
  if (!trendWeeks || trendWeeks.length === 0) return null;

  const data = trendWeeks.map((w, i) => {
    const r = w.record;
    return {
      week:         WEEK_LABELS[i],
      Absent:       r ? n(r.wed_absent)   + n(r.thu_absent)   + n(r.fri_absent)   + n(r.sat_absent)   + n(r.sun_absent)   : 0,
      Attended:     r ? n(r.wed_attended) + n(r.thu_attended) + n(r.fri_attended) + n(r.sat_attended) + n(r.sun_attended) : 0,
      Frozen:       r ? n(r.wed_frozen)   + n(r.thu_frozen)   + n(r.fri_frozen)   + n(r.sat_frozen)   + n(r.sun_frozen)   : 0,
      Replaced:     r ? n(r.wed_replaced) + n(r.thu_replaced) + n(r.fri_replaced) + n(r.sat_replaced) + n(r.sun_replaced) : 0,
      AttendedLine: r ? n(r.wed_attended) + n(r.thu_attended) + n(r.fri_attended) + n(r.sat_attended) + n(r.sun_attended) : 0,
    };
  });

  return (
    <div className="okrChartWrap">
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ top: 8, right: 16, left: -20, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid strokeDasharray="4 4" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="week" tick={{ fontSize: 12, fontWeight: 700, fill: 'var(--textSecondary)' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip content={<Tip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '0.78rem', paddingTop: 8 }}
            formatter={(val) => val === 'AttendedLine' ? null : val} />
          <Bar dataKey="Absent"   fill={C.Absent}   radius={[4,4,0,0]} maxBarSize={28} />
          <Bar dataKey="Attended" fill={C.Attended} radius={[4,4,0,0]} maxBarSize={28} />
          <Bar dataKey="Frozen"   fill={C.Frozen}   radius={[4,4,0,0]} maxBarSize={28} />
          <Bar dataKey="Replaced" fill={C.Replaced} radius={[4,4,0,0]} maxBarSize={28} />
          <Line dataKey="AttendedLine" name="AttendedLine" stroke={C.Attended} strokeWidth={2}
            dot={{ r: 4, fill: C.Attended, stroke: '#fff', strokeWidth: 2 }}
            activeDot={{ r: 6 }} type="monotone" legendType="none" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
