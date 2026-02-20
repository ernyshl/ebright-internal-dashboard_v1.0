import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { BackButton } from '../components/BackButton';

function formatNumber(num) {
  if (num === null || num === undefined) return '—';
  // Ensure we're working with a number
  const n = typeof num === 'string' ? parseInt(num, 10) : num;
  if (isNaN(n)) return '—';
  return new Intl.NumberFormat('en-MY').format(n);
}

function StatCard({ title, value, icon, color, subtitle }) {
  // Ensure value is a number
  const numValue = typeof value === 'string' ? parseInt(value, 10) : value;
  
  return (
    <div className="statCard" style={{ '--stat-color': color }}>
      <div className="statCardIcon">{icon}</div>
      <div className="statCardContent">
        <div className="statCardValue">{formatNumber(numValue)}</div>
        <div className="statCardTitle">{title}</div>
        {subtitle && <div className="statCardSubtitle">{subtitle}</div>}
      </div>
    </div>
  );
}

function SourceCard({ source, counts, color }) {
  // Ensure all counts are numbers
  const today = typeof counts?.count_today === 'string' ? parseInt(counts.count_today, 10) : (counts?.count_today || 0);
  const yesterday = typeof counts?.count_yesterday === 'string' ? parseInt(counts.count_yesterday, 10) : (counts?.count_yesterday || 0);
  const days7 = typeof counts?.count_7_days === 'string' ? parseInt(counts.count_7_days, 10) : (counts?.count_7_days || 0);
  const days30 = typeof counts?.count_30_days === 'string' ? parseInt(counts.count_30_days, 10) : (counts?.count_30_days || 0);
  
  const trend = today - yesterday;
  const trendPercent = yesterday ? ((trend / yesterday) * 100).toFixed(1) : 0;
  
  return (
    <div className="sourceCard" style={{ '--source-color': color }}>
      <div className="sourceCardHeader">
        <span className="sourceCardIcon">{source.icon}</span>
        <span className="sourceCardName">{source.name}</span>
      </div>
      <div className="sourceCardTotal">
        <span className="sourceCardTotalValue">{formatNumber(today)}</span>
        <span className="sourceCardTotalLabel">Today's Leads</span>
      </div>
      <div className="sourceCardStats">
        <div className="sourceStat">
          <span className="sourceStatValue">{formatNumber(yesterday)}</span>
          <span className="sourceStatLabel">Yesterday</span>
        </div>
        <div className="sourceStat">
          <span className="sourceStatValue">{formatNumber(days7)}</span>
          <span className="sourceStatLabel">7 Days</span>
        </div>
        <div className="sourceStat">
          <span className="sourceStatValue">{formatNumber(days30)}</span>
          <span className="sourceStatLabel">30 Days</span>
        </div>
      </div>
      <div className={`sourceCardTrend ${trend >= 0 ? 'trendUp' : 'trendDown'}`}>
        {trend >= 0 ? '↑' : '↓'} {formatNumber(Math.abs(trend))} vs yesterday ({Math.abs(trendPercent)}%)
      </div>
    </div>
  );
}

function RegionCard({ region, counts, color }) {
  // Ensure all counts are numbers
  const today = typeof counts?.count_today === 'string' ? parseInt(counts.count_today, 10) : (counts?.count_today || 0);
  const yesterday = typeof counts?.count_yesterday === 'string' ? parseInt(counts.count_yesterday, 10) : (counts?.count_yesterday || 0);
  const days7 = typeof counts?.count_7_days === 'string' ? parseInt(counts.count_7_days, 10) : (counts?.count_7_days || 0);
  const days30 = typeof counts?.count_30_days === 'string' ? parseInt(counts.count_30_days, 10) : (counts?.count_30_days || 0);
  
  // Total leads = 30 days count (not sum of all periods since they overlap)
  const total = days30;
  
  return (
    <div className="regionCard" style={{ '--region-color': color }}>
      <div className="regionCardHeader">
        <span className="regionCardName">{region.name}</span>
        <span className="regionCardTotal">{formatNumber(total)}</span>
      </div>
      <div className="regionCardBars">
        <div className="regionBarItem">
          <div className="regionBarLabel">Today</div>
          <div className="regionBarTrack">
            <div 
              className="regionBarFill" 
              style={{ width: `${Math.min((today / total) * 100 || 0, 100)}%` }}
            />
          </div>
          <div className="regionBarValue">{formatNumber(today)}</div>
        </div>
        <div className="regionBarItem">
          <div className="regionBarLabel">Yesterday</div>
          <div className="regionBarTrack">
            <div 
              className="regionBarFill" 
              style={{ width: `${Math.min((yesterday / total) * 100 || 0, 100)}%` }}
            />
          </div>
          <div className="regionBarValue">{formatNumber(yesterday)}</div>
        </div>
        <div className="regionBarItem">
          <div className="regionBarLabel">7 Days</div>
          <div className="regionBarTrack">
            <div 
              className="regionBarFill" 
              style={{ width: `${Math.min((days7 / total) * 100 || 0, 100)}%` }}
            />
          </div>
          <div className="regionBarValue">{formatNumber(days7)}</div>
        </div>
        <div className="regionBarItem">
          <div className="regionBarLabel">30 Days</div>
          <div className="regionBarTrack">
            <div 
              className="regionBarFill" 
              style={{ width: `${Math.min((days30 / total) * 100 || 0, 100)}%` }}
            />
          </div>
          <div className="regionBarValue">{formatNumber(days30)}</div>
        </div>
      </div>
    </div>
  );
}

function BranchTable({ branches }) {
  if (!branches || branches.length === 0) return <div className="muted">No branch data available.</div>;

  // Ensure all values are numbers
  const normalizeBranch = (branch) => ({
    ...branch,
    count_today: typeof branch.count_today === 'string' ? parseInt(branch.count_today, 10) : (branch.count_today || 0),
    count_yesterday: typeof branch.count_yesterday === 'string' ? parseInt(branch.count_yesterday, 10) : (branch.count_yesterday || 0),
    count_7_days: typeof branch.count_7_days === 'string' ? parseInt(branch.count_7_days, 10) : (branch.count_7_days || 0),
    count_30_days: typeof branch.count_30_days === 'string' ? parseInt(branch.count_30_days, 10) : (branch.count_30_days || 0),
  });

  const normalizedBranches = branches.map(normalizeBranch);
  
  // Sort by total (30d) descending
  const sorted = [...normalizedBranches].sort((a, b) => b.count_30_days - a.count_30_days);

  return (
    <div className="branchTableWrap">
      <table className="branchTable">
        <thead>
          <tr>
            <th>Branch</th>
            <th className="textRight">Today</th>
            <th className="textRight">Yesterday</th>
            <th className="textRight">7 Days</th>
            <th className="textRight">30 Days</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((branch, idx) => {
            const isTop = idx < 3;
            
            return (
              <tr key={branch.clean_branch || idx} className={isTop ? 'rowTop' : ''}>
                <td>
                  <div className="branchName">
                    {isTop && <span className="rankBadge">#{idx + 1}</span>}
                    {branch.clean_branch || 'Unknown'}
                  </div>
                </td>
                <td className="textRight">{formatNumber(branch.count_today)}</td>
                <td className="textRight">{formatNumber(branch.count_yesterday)}</td>
                <td className="textRight">{formatNumber(branch.count_7_days)}</td>
                <td className="textRight fontBold">{formatNumber(branch.count_30_days)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function LeadsBreakdownPage() {
  const q = useQuery({
    queryKey: ['leads', 'breakdown'],
    queryFn: () => apiFetch('/api/leads/breakdown'),
    refetchInterval: 180_000,
  });

  // Use grandTotal from backend for accurate summary
  const grandTotal = q.data?.grandTotal || {};
  const totalLeads = parseInt(grandTotal.count_30_days) || 0;
  const todayTotal = parseInt(grandTotal.count_today) || 0;
  const yesterdayTotal = parseInt(grandTotal.count_yesterday) || 0;
  
  // Calculate from branches for display table
  const branches = q.data?.branches || [];
  const regionCount = q.data?.regions?.length || 0;
  const branchCount = branches.length;

  const leadSources = [
    { id: 'website', name: 'Website', icon: '🌐' },
    { id: 'facebook', name: 'Facebook', icon: '📘' },
    { id: 'instagram', name: 'Instagram', icon: '📷' },
    { id: 'google', name: 'Google', icon: '🔍' },
    { id: 'referral', name: 'Referral', icon: '🤝' },
    { id: 'walkin', name: 'Walk-in', icon: '🚶' },
    { id: 'phone', name: 'Phone', icon: '📞' },
    { id: 'other', name: 'Other', icon: '📋' },
  ];

  const regionColors = ['#3b82f6', '#10b981', '#f59e0b', '#6366f1', '#ec4899', '#8b5cf6'];

  return (
    <div className="leadsBreakdownPage">
      <div className="pageHeader">
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16 }}>
          <div className="pageHeaderTitle">📊 Branch Distribution</div>
          <div className="pageHeaderSub">Lead counts by source, region & branch · Auto-refresh every 3 min</div>
        </div>
        <button className="btn btnSmall" onClick={() => q.refetch()} disabled={q.isFetching}>
          {q.isFetching ? '⟳ Refreshing…' : '⟳ Refresh'}
        </button>
      </div>

      {q.isLoading ? (
        <div className="card">
          <div className="loadingCard"><div className="loadingDots"><span /><span /><span /></div> Loading leads data…</div>
        </div>
      ) : q.isError ? (
        <div className="errorText">
          {q.error?.data?.error || 'Failed to load leads data.'}{' '}
          <span className="muted small">{q.error?.data?.hint || ''}</span>
        </div>
      ) : (
        <>
          {/* Summary Stats */}
          <div className="summaryStats">
            <StatCard 
              title="Total Leads (30d)" 
              value={totalLeads} 
              icon="📈" 
              color="#3b82f6"
              subtitle="All sources combined"
            />
            <StatCard 
              title="Today's Leads" 
              value={todayTotal} 
              icon="📅" 
              color="#10b981"
              subtitle={`${yesterdayTotal ? ((todayTotal/yesterdayTotal - 1) * 100).toFixed(1) : 0}% vs yesterday`}
            />
            <StatCard 
              title="Yesterday's Leads" 
              value={yesterdayTotal} 
              icon="📆" 
              color="#f59e0b"
              subtitle={`${todayTotal ? ((todayTotal/yesterdayTotal - 1) * 100).toFixed(1) : 0}% change today`}
            />
            <StatCard 
              title="Active Regions" 
              value={regionCount} 
              icon="🗺️" 
              color="#6366f1"
              subtitle="With lead activity"
            />
            <StatCard 
              title="Active Branches" 
              value={branchCount} 
              icon="🏢" 
              color="#ec4899"
              subtitle="With lead activity"
            />
          </div>

          {/* Lead Sources */}
          <div className="section">
            <h3 className="sectionTitle">📊 Lead Sources</h3>
            <p className="sectionSubtitle">Performance breakdown by acquisition channel</p>
            <div className="sourcesGrid">
              {q.data?.total?.map((source, idx) => (
                <SourceCard 
                  key={source.lead_source || idx}
                  source={{
                    name: source.lead_source || 'Unknown',
                    icon: leadSources.find(s => s.id === source.lead_source?.toLowerCase())?.icon || '📋'
                  }}
                  counts={{
                    count_today: source.count_today,
                    count_yesterday: source.count_yesterday,
                    count_7_days: source.count_7_days,
                    count_30_days: source.count_30_days
                  }}
                  color={leadSources[idx % leadSources.length]?.id === 'website' ? '#3b82f6' : 
                         leadSources[idx % leadSources.length]?.id === 'facebook' ? '#1877f2' :
                         leadSources[idx % leadSources.length]?.id === 'instagram' ? '#e4405f' :
                         leadSources[idx % leadSources.length]?.id === 'google' ? '#ea4335' :
                         leadSources[idx % leadSources.length]?.id === 'referral' ? '#10b981' :
                         leadSources[idx % leadSources.length]?.id === 'walkin' ? '#f59e0b' :
                         leadSources[idx % leadSources.length]?.id === 'phone' ? '#6366f1' : '#8b5cf6'}
                />
              ))}
            </div>
          </div>

          {/* Regions */}
          <div className="section">
            <h3 className="sectionTitle">🗺️ Regional Breakdown</h3>
            <p className="sectionSubtitle">Lead distribution across mapped regions</p>
            <div className="regionsGrid">
              {q.data?.regions?.map((region, idx) => (
                <RegionCard 
                  key={region.region || idx}
                  region={{ name: region.region || 'Unknown' }}
                  counts={{
                    count_today: region.count_today,
                    count_yesterday: region.count_yesterday,
                    count_7_days: region.count_7_days,
                    count_30_days: region.count_30_days
                  }}
                  color={regionColors[idx % regionColors.length]}
                />
              ))}
            </div>
          </div>

          {/* Branches */}
          <div className="section">
            <h3 className="sectionTitle">🏢 Branch Performance</h3>
            <p className="sectionSubtitle">Lead counts by branch office (sorted by 30-day total)</p>
            <BranchTable branches={q.data?.branches} />
          </div>
        </>
      )}
    </div>
  );
}

