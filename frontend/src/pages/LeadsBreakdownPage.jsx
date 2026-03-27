import { useQuery } from '@tanstack/react-query';
import { useState, useRef } from 'react';
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

function InfoTooltip({ tooltip }) {
  const [show, setShow] = useState(false);
  const timer = useRef(null);

  const handleEnter = () => { clearTimeout(timer.current); setShow(true); };
  const handleLeave = () => { timer.current = setTimeout(() => setShow(false), 120); };

  return (
    <span className="infoIconWrap" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <span className="infoIcon">ℹ</span>
      {show && (
        <div className="infoTooltip" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
          <div className="infoTooltipTitle">{tooltip.title}</div>
          <div className="infoTooltipDesc">{tooltip.desc}</div>
          <a href={tooltip.url} target="_blank" rel="noopener noreferrer" className="infoTooltipUrl">{tooltip.url}</a>
        </div>
      )}
    </span>
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
        <span className="sourceCardIcon">
          {source.img
            ? <img src={source.img} alt={source.name} style={{ width: '32px', height: '22px', objectFit: 'contain' }} />
            : source.icon}
        </span>
        <span className="sourceCardName">
          {source.displayName || source.name}
          {source.sublabel && <span className="sourceCardSublabel">{source.sublabel}</span>}
          {source.tooltip && <InfoTooltip tooltip={source.tooltip} />}
        </span>
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
  
  // Filter out inactive branches
  const inactiveBranches = ['Taman Melawati', 'Kajang Perdana', 'Bandar Sri Damansara', 'Kepong', 'Bandra East', 'Andheri West'];
  const filteredBranches = normalizedBranches.filter(
    (branch) => !inactiveBranches.includes(branch.clean_branch)
  );
  
  // Sort by total (30d) descending
  const sorted = [...filteredBranches].sort((a, b) => b.count_30_days - a.count_30_days);

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
  
  // Filter out inactive branches for the count as well
  const inactiveBranches = ['Taman Melawati', 'Kajang Perdana', 'Bandar Sri Damansara', 'Kepong', 'Bandra East', 'Andheri West'];
  const activeBranches = branches.filter(b => !inactiveBranches.includes(b.clean_branch));
  const branchCount = activeBranches.length;

  const leadSources = [
    { id: 'website', name: 'Website', icon: '🌐' },
    { id: 'trial class form', name: 'Trial Class Form', icon: '🌐' },
    { id: 'meta', name: 'Meta', img: '/meta_logo.svg' },
    { id: 'facebook', name: 'Facebook', icon: '📘' },
    { id: 'instagram', name: 'Instagram', icon: '📷' },
    { id: 'tiktok', name: 'TikTok', img: '/tiktok_logo.svg' },
    { id: 'google', name: 'Google', icon: '🔍' },
    { id: 'referral', name: 'Referral', icon: '🤝' },
    { id: 'walkin', name: 'Walk-in', icon: '🚶' },
    { id: 'phone', name: 'Phone', icon: '📞' },
    { id: 'roadshow', name: 'Roadshow', icon: '🎪' },
    { id: 'other', name: 'Other', icon: '📋' },
  ];

  const regionColors = ['#3b82f6', '#10b981', '#f59e0b', '#6366f1', '#ec4899', '#8b5cf6'];

  return (
    <div className="leadsBreakdownPage">
      <div className="pageHeader">
        <div className="backButtonContainer">
          <BackButton to="/" label="Back to Home" />
        </div>
        <div className="pageHeaderTitle">📊 Branch Distribution</div>
        <div className="pageHeaderSub">Lead counts by source, region & branch · Auto-refresh every 3 min</div>
        <div className="refreshButtonContainer">
          <button className="btn btnSmall" onClick={() => q.refetch()} disabled={q.isFetching}>
            {q.isFetching ? '⟳ Refreshing…' : '⟳ Refresh'}
          </button>
        </div>
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

          {/* Lead Sources — 4 fixed cards */}
          <div className="section">
            <h3 className="sectionTitle">📊 Lead Sources</h3>
            <p className="sectionSubtitle">Performance breakdown by acquisition channel</p>
            <div className="sourcesGrid">
              {[
                { key: 'Meta', icon: null, img: '/facebook_logo.svg', color: '#1877f2',
                  tooltip: { title: 'Meta', desc: 'Leads from Meta campaigns where the lead filled in an instant form on Facebook, Instagram, or Threads.', url: 'https://www.ebright.my/trial-classes' } },
                { key: 'TikTok', icon: null, img: '/tiktok_logo.svg', color: '#010101',
                  tooltip: { title: 'TikTok', desc: 'Leads from TikTok campaigns where the lead filled in an instant form on TikTok.', url: 'https://www.ebright.my/trial-classes' } },
                { key: 'Trial Class Form', icon: '🌐', img: null, color: '#3b82f6', sublabel: '(Conversion)', displayName: 'Website',
                  tooltip: { title: 'Website (Conversion)', desc: 'Leads from conversion campaigns (Meta/TikTok) where the lead filled in the form on the website.', url: 'https://www.ebright.my/trial-classes' } },
                { key: 'Roadshow', icon: '🎪', img: null, color: '#f97316',
                  tooltip: { title: 'Roadshow', desc: 'Leads from contacts collected during showcase, festival roadshows, and/or promotional events.', url: 'https://www.ebright.my/trial-class-roadshow' } },
                { key: 'Self Generated Lead', icon: '🤝', img: null, color: '#10b981',
                  tooltip: { title: 'Self Generated Lead', desc: 'Leads generated directly by staff through personal or direct contact. Staff can claim these leads when the lead enrolls.', url: 'https://www.ebright.my/trial-class-self-generated' } },
                { key: 'Walk In', icon: '🚶', img: null, color: '#6366f1',
                  tooltip: { title: 'Walk In', desc: 'Leads who visited the centre directly to inquire or attend a trial session by walking in.', url: 'https://www.ebright.my/trial-class-walk-in' } },
                { key: 'Website', icon: '💻', img: null, color: '#8b5cf6', sublabel: '(Organic)',
                  tooltip: { title: 'Website (Organic)', desc: 'Leads who found the website organically and clicked the trial class form on the website.', url: 'https://www.ebright.my/trial-class-website' } },
                { key: 'Others', icon: '📋', img: null, color: '#64748b',
                  tooltip: { title: 'Others', desc: 'Leads that do not fall under any other category (e.g. parent referrals).', url: 'https://www.ebright.my/trial-class-others' } },
              ].map(card => {
                const match = q.data?.total?.find(s => s.lead_source === card.key);
                return (
                  <SourceCard
                    key={card.key}
                    source={{ name: card.key, icon: card.icon, img: card.img, sublabel: card.sublabel, displayName: card.displayName, tooltip: card.tooltip }}
                    counts={match || { count_today: 0, count_yesterday: 0, count_7_days: 0, count_30_days: 0 }}
                    color={card.color}
                  />
                );
              })}
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

          {/* Others Detail — diagnostic breakdown of unclassified lead sources */}
          {q.data?.othersDetail && q.data.othersDetail.length > 0 && (
            <div className="section">
              <h3 className="sectionTitle">📋 Others — Raw Lead Source Breakdown</h3>
              <p className="sectionSubtitle">Unclassified lead_source values falling into "Others" category</p>
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="tableWrap" style={{ border: 'none', borderRadius: 0 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Raw Lead Source (from DB)</th>
                        <th style={{ textAlign: 'right' }}>Today</th>
                        <th style={{ textAlign: 'right' }}>All Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {q.data.othersDetail.map((row, idx) => (
                        <tr key={idx}>
                          <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{row.raw_lead_source || '(empty)'}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: parseInt(row.count_today) > 0 ? '#f97316' : undefined }}>{formatNumber(parseInt(row.count_today))}</td>
                          <td style={{ textAlign: 'right' }}>{formatNumber(parseInt(row.count_total))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

