import { useQuery } from '@tanstack/react-query';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { useState, useMemo } from 'react';
import { apiFetch } from '../lib/api';
import { MarketingTable } from '../components/MarketingTable';
import { BackButton } from '../components/BackButton';

const COLORS = ['#dc2626', '#f97316', '#0284c7', '#059669', '#8b5cf6', '#ec4899', '#f59e0b', '#64748b', '#334155', '#475569'];

function CampaignPieChart({ data, title, period = 'd30' }) {
  const chartData = useMemo(() => {
    if (!data || !Array.isArray(data) || data.length === 0) return [];
    return data
      .map(c => ({
        name: c?.name || 'Unknown',
        value: Number(c?.[period]?.spend || 0)
      }))
      .filter(c => c.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [data, period]);

  const totalSpend = useMemo(() => {
    return chartData.reduce((sum, item) => sum + (item?.value || 0), 0);
  }, [chartData]);

  if (chartData.length === 0) {
    return (
      <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '420px' }}>
        <h4 style={{ margin: '0 0 20px 0', fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{title}</h4>
        <div style={{ color: 'var(--textSecondary)', fontSize: '14px' }}>No campaign data available for this period</div>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '420px' }}>
      <h4 style={{ margin: '0 0 20px 0', fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{title}</h4>
      <div style={{ width: '100%', height: 280, position: 'relative' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={70}
              outerRadius={95}
              paddingAngle={4}
              dataKey="value"
              stroke="none"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => [`RM ${Number(value).toLocaleString()}`, 'Spend']}
              contentStyle={{
                borderRadius: '12px',
                border: '1px solid var(--border)',
                background: 'var(--glassBg)',
                backdropFilter: 'blur(8px)',
                boxShadow: '0 8px 24px var(--glassShadow)',
                padding: '10px 14px',
                fontSize: '13px',
                color: 'var(--text)'
              }}
              itemStyle={{ color: 'var(--text)' }}
            />
          </PieChart>
        </ResponsiveContainer>
        {/* Center Text */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          pointerEvents: 'none'
        }}>
          <div style={{ fontSize: '12px', color: 'var(--textSecondary)', fontWeight: 600, textTransform: 'uppercase' }}>Total</div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text)' }}>RM {Math.round(totalSpend).toLocaleString()}</div>
        </div>
      </div>

      {/* Custom Legend */}
      <div style={{
        width: '100%',
        marginTop: '20px',
        display: 'grid',
        gridTemplateColumns: '1fr',
        gap: '8px',
        maxHeight: '120px',
        overflowY: 'auto',
        paddingRight: '4px'
      }}>
        {chartData.slice(0, 5).map((entry, index) => (
          <div key={entry.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: COLORS[index % COLORS.length], flexShrink: 0 }} />
              <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 500, color: 'var(--textSecondary)' }}>
                {entry.name}
              </div>
            </div>
            <div style={{ fontWeight: 700, color: 'var(--text)', marginLeft: '12px' }}>
              {((entry.value / totalSpend) * 100).toFixed(1)}%
            </div>
          </div>
        ))}
        {chartData.length > 5 && (
          <div style={{ textAlign: 'center', fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
            + {chartData.length - 5} more campaigns
          </div>
        )}
      </div>
    </div>
  );
}

export function MarketingPerformancePage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const q = useQuery({
    queryKey: ['marketing', 'performance', month, year],
    queryFn: () => {
      const params = new URLSearchParams();
      params.append('month', month);
      params.append('year', year);
      return apiFetch(`/api/marketing/performance?${params.toString()}`);
    },
    refetchInterval: 180_000,
  });

  const channels = q.data?.channels;
  const groups = q.data?.groups;
  const campaigns = q.data?.campaigns;

  const months = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' },
  ];

  const years = [2024, 2025, 2026];

  return (
    <div className="stack">
      <div className="pageHeader">
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16 }}>
          <div className="pageHeaderTitle">Marketing Performance</div>
          <div className="pageHeaderSub">
            <span className="live-dot" />
            Spend, leads, conversions, CPL & CPC · Auto-refresh every 3 min
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 16 }}>
          <button className="btn btnSmall" onClick={() => q.refetch()} disabled={q.isFetching}>
            {q.isFetching ? '⟳ Refreshing…' : '⟳ Refresh'}
          </button>
        </div>
      </div>

      {q.isLoading ? (
        <div className="card">
          <div className="loadingCard"><div className="loadingDots"><span /><span /><span /></div> Loading marketing data…</div>
        </div>
      ) : q.isError ? (
        <div className="errorText">
          {q.error?.data?.error || 'Failed to load marketing data.'}{' '}
          <span className="muted small">{q.error?.data?.hint || ''}</span>
        </div>
      ) : channels ? (
        <div className="stack">
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <MarketingTable
              title="Main Marketing"
              rows={[
                { label: 'FB (Group)', ...channels.fb_group },
                { label: 'FB (Mokhir)', ...channels.online },
                { label: 'TikTok', ...channels.tiktok },
                { label: 'Google Ads', ...channels.google, isGoogle: true },
                { label: 'TOTAL', ...groups?.main_marketing, isTotal: true },
              ]}
            />
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <MarketingTable title="Sara Recruitment" rows={[{ label: 'Sara', ...channels.sara }]} />
          </div>

          {/* Campaign Performance Section */}
          <div className="stack">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '24px 0 12px 0' }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
                Top Campaign Performance ({months.find(m => m.value === month).label} {year})
              </h3>

              <div className="card" style={{ padding: '6px 12px', display: 'flex', gap: 10, alignItems: 'center', boxShadow: 'none', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--textSecondary)' }}>Chart Filter:</span>
                <select
                  value={month}
                  onChange={(e) => setMonth(parseInt(e.target.value))}
                  className="input"
                  style={{ padding: '2px 6px', fontSize: 12, height: 'auto' }}
                >
                  {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <select
                  value={year}
                  onChange={(e) => setYear(parseInt(e.target.value))}
                  className="input"
                  style={{ padding: '2px 6px', fontSize: 12, height: 'auto' }}
                >
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>

            <div className="campaignGrid">
              <CampaignPieChart data={campaigns?.fb_group} title="FB Group Campaigns" period="monthly" />
              <CampaignPieChart data={campaigns?.tiktok} title="TikTok Campaigns" period="monthly" />
              <CampaignPieChart data={campaigns?.sara} title="Sara Recruitment Campaigns" period="monthly" />
              <CampaignPieChart data={campaigns?.online} title="Online Campaigns" period="monthly" />
              <CampaignPieChart data={campaigns?.google} title="Google Ads Campaigns" period="monthly" />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

