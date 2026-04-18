import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { BRANCH_META, CHART_COLORS } from '../../lib/okr/constants';

function ChartTooltip({ active, payload, label, chartData }) {
  if (!active || !payload?.length) return null;
  const entry = chartData.find(d => d.branch === label);
  return (
    <div className="okrChartTooltip">
      <div className="okrChartTooltipTitle">{entry?.fullName || label}</div>
      {payload.map(p => (
        <div key={p.name} className="okrChartTooltipRow">
          <span className="okrChartTooltipDot" style={{ background: p.fill || p.stroke }} />
          <span>{p.name}</span>
          <strong>{p.value}{p.name === 'Rate' ? '%' : ''}</strong>
        </div>
      ))}
    </div>
  );
}

export function AllBranchesGrid({ records, onSelect }) {
  if (!records.length) return (
    <div className="okrEmptyHero okrEmptySmall">
      <div className="okrEmptyIcon">📭</div>
      <h3>No data yet for this week</h3>
      <p>Add data via the Data Entry tab</p>
    </div>
  );

  const chartData = records.map(r => ({
    branch:   BRANCH_META[r.branch]?.code || r.branch,
    fullName: r.branch,
    region:   BRANCH_META[r.branch]?.region,
    Attended: r._m.totalAttended,
    Absent:   r._m.totalAbsent,
    Frozen:   r._m.totalFrozen,
    Replaced: r._m.totalReplaced,
    Rate:     parseFloat(r._m.attendanceRate.toFixed(1)),
  }));

  const handleChartClick = (data) => {
    if (!data?.activeLabel) return;
    const entry = chartData.find(d => d.branch === data.activeLabel);
    if (entry) onSelect(entry.fullName);
  };

  const chartWidth = Math.max(960, records.length * 56);

  return (
    <div className="okrAllBranchWrap">
      <div className="okrAllBranchTitleRow">
        <span className="okrAllBranchTitle">All Branches — Attendance Overview</span>
        <span className="okrAllBranchHint">Click any bar to view branch details</span>
      </div>
      <div className="okrAllBranchChartScroll">
        <div style={{ width: chartWidth, minWidth: '100%' }}>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart
              data={chartData}
              margin={{ top: 10, right: 20, left: -10, bottom: 48 }}
              barCategoryGap="22%"
              onClick={handleChartClick}
              style={{ cursor: 'pointer' }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="branch" tick={{ fontSize: 11, fontWeight: 700, fill: 'var(--textSecondary)' }} axisLine={false} tickLine={false} angle={-40} textAnchor="end" interval={0} />
              <YAxis yAxisId="left" tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--muted)' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
              <Tooltip content={(props) => <ChartTooltip {...props} chartData={chartData} />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '0.78rem', paddingTop: 6 }} />
              <Bar yAxisId="left" dataKey="Attended" fill={CHART_COLORS.Attended} radius={[3,3,0,0]} maxBarSize={16} />
              <Bar yAxisId="left" dataKey="Absent"   fill={CHART_COLORS.Absent}   radius={[3,3,0,0]} maxBarSize={16} />
              <Bar yAxisId="left" dataKey="Frozen"   fill={CHART_COLORS.Frozen}   radius={[3,3,0,0]} maxBarSize={16} />
              <Bar yAxisId="left" dataKey="Replaced" fill={CHART_COLORS.Replaced} radius={[3,3,0,0]} maxBarSize={16} />
              <Line yAxisId="right" dataKey="Rate" name="Attend. Rate %" stroke="#8b5cf6" strokeWidth={2.5} dot={{ r: 3.5, fill: '#8b5cf6', stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 5 }} type="monotone" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
