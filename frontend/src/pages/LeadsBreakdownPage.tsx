import { useQuery } from '@tanstack/react-query';
import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { BackButton } from '../components/BackButton';

const REGION_BRANCHES = {
  'Region A': ['Bandar Rimbayu', 'Rimbayu', 'Klang', 'Shah Alam', 'Setia Alam', 'Denai Alam', 'Eco Grandeur', 'Subang Taipan'],
  'Region B': ['Danau Kota', 'Kota Damansara', 'Ampang', 'Sri Petaling', 'Bandar Tun Hussein Onn', 'Kajang Perdana', 'Kajang', 'Taman Sri Gombak'],
  'Region C': ['Putrajaya', 'Kota Warisan', 'Bandar Baru Bangi', 'Cyberjaya', 'Bandar Seri Putra', 'Dataran Puchong Utama', 'Online'],
};

const HOURLY_TARGETS = [
  { label: '9:00 AM',  hour: 9,  minute: 0, target: 30  },
  { label: '11:00 AM', hour: 11, minute: 0, target: 45  },
  { label: '4:00 PM',  hour: 16, minute: 0, target: 70  },
  { label: '6:00 PM',  hour: 18, minute: 0, target: 85  },
  { label: '8:00 PM',  hour: 20, minute: 0, target: 130 },
];

function HourlyTargetCard({ currentLeads }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const checkpoints = HOURLY_TARGETS.map(t => ({ ...t, totalMinutes: t.hour * 60 + t.minute }));
  const previous = [...checkpoints].reverse().find(c => nowMinutes >= c.totalMinutes);
  const next = checkpoints.find(c => nowMinutes < c.totalMinutes);

  const prevMet = previous ? currentLeads >= previous.target : null;
  const statusTone = previous == null ? 'pending' : (prevMet ? 'good' : 'bad');

  const previousClass = prevMet === true ? 'hourlyTargetBlock--met' : prevMet === false ? 'hourlyTargetBlock--missed' : '';

  return (
    <div className={`hourlyTargetCard hourlyTargetCard--${statusTone}`}>
      <div className="hourlyTargetHeader">
        <span className="hourlyTargetHeaderIcon">🎯</span>
        <span className="hourlyTargetHeaderTitle">Hourly Target</span>
      </div>
      <div className="hourlyTargetBody">
        <div className={`hourlyTargetBlock hourlyTargetBlock--previous ${previousClass}`}>
          <div className="hourlyTargetLabel">
            <span className="hourlyTargetLabelKey">Previous</span>
            {previous && <span className="hourlyTargetLabelTime">· {previous.label}</span>}
          </div>
          {previous ? (
            <div className="hourlyTargetMetric">
              <span className="hourlyTargetNumber">{formatNumber(previous.target)}</span>
              <span className="hourlyTargetUnit">
                {prevMet ? `✓ ${formatNumber(currentLeads)} today` : `✗ short by ${previous.target - currentLeads}`}
              </span>
            </div>
          ) : (
            <div className="hourlyTargetMetric">
              <span className="hourlyTargetUnit">Before 9:00 AM — not yet due</span>
            </div>
          )}
        </div>

        <div className="hourlyTargetBlock hourlyTargetBlock--next">
          <div className="hourlyTargetLabel">
            <span className="hourlyTargetLabelKey">Next</span>
            {next && <span className="hourlyTargetLabelTime">· {next.label}</span>}
          </div>
          {next ? (
            <div className="hourlyTargetMetric">
              <span className="hourlyTargetNumber">{formatNumber(next.target)}</span>
              <span className="hourlyTargetUnit">leads needed</span>
            </div>
          ) : (
            <div className="hourlyTargetMetric">
              <span className="hourlyTargetUnit">All checkpoints passed</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function getLeadCentreUrl(leadSourceKey, period, region = '') {
  const now = new Date();
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const today = fmt(now);
  const yesterday = fmt(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const days7 = fmt(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6));
  const days30 = fmt(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29));
  const dow = now.getDay();
  const thisWeekStart = fmt(new Date(now.getFullYear(), now.getMonth(), now.getDate() + (dow === 0 ? -6 : 1 - dow)));
  const thisMonthStart = fmt(new Date(now.getFullYear(), now.getMonth(), 1));

  const ranges = {
    today:     { date_from: today,          date_to: today },
    yesterday: { date_from: yesterday,      date_to: yesterday },
    '7days':   { date_from: days7,          date_to: today },
    '30days':  { date_from: days30,         date_to: today },
    thisweek:  { date_from: thisWeekStart,  date_to: today },
    thismonth: { date_from: thisMonthStart, date_to: today },
  };
  const { date_from, date_to } = ranges[period] || {};
  const params = new URLSearchParams({ date_from, date_to });
  if (leadSourceKey) params.set('lead_source', leadSourceKey);
  if (region) params.set('region', region);
  return `/leads-centre?${params}`;
}

function formatNumber(num) {
  if (num === null || num === undefined) return '—';
  // Ensure we're working with a number
  const n = typeof num === 'string' ? parseInt(num, 10) : num;
  if (isNaN(n)) return '—';
  return new Intl.NumberFormat('en-MY').format(n);
}

function StatCard({ title, value, icon, color, subtitle, to, bracketValue }) {
  // Ensure value is a number
  const numValue = typeof value === 'string' ? parseInt(value, 10) : value;

  const inner = (
    <div className="statCard" style={{ '--stat-color': color }}>
      <div className="statCardIcon">{icon}</div>
      <div className="statCardContent">
        <div className="statCardValue">
          {formatNumber(numValue)}
          {bracketValue !== undefined && <span style={{ fontSize: '0.6em', color: 'var(--muted)', fontWeight: 500 }}> | {formatNumber(bracketValue)}</span>}
        </div>
        <div className="statCardTitle">{title}</div>
        {subtitle && <div className="statCardSubtitle">{subtitle}</div>}
      </div>
    </div>
  );

  return to ? <Link to={to} className="statCardLink">{inner}</Link> : inner;
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
          <div className="infoTooltipDesc" style={{ whiteSpace: 'pre-line' }}>{tooltip.desc}</div>
          {tooltip.url && <a href={tooltip.url} target="_blank" rel="noopener noreferrer" className="infoTooltipUrl">{tooltip.url}</a>}
        </div>
      )}
    </span>
  );
}

function SourceCard({ source, counts, color }) {
  const today = typeof counts?.count_today === 'string' ? parseInt(counts.count_today, 10) : (counts?.count_today || 0);
  const yesterday = typeof counts?.count_yesterday === 'string' ? parseInt(counts.count_yesterday, 10) : (counts?.count_yesterday || 0);
  const days7 = typeof counts?.count_7_days === 'string' ? parseInt(counts.count_7_days, 10) : (counts?.count_7_days || 0);
  const days30 = typeof counts?.count_30_days === 'string' ? parseInt(counts.count_30_days, 10) : (counts?.count_30_days || 0);

  const trend = today - yesterday;
  const trendPercent = yesterday ? ((trend / yesterday) * 100).toFixed(1) : 0;

  // Determine if this is a region card (name matches Region A/B/C or empty for total)
  const isRegion = !source.name || source.name.startsWith('Region');
  const linkFn = (period) => isRegion
    ? getLeadCentreUrl('', period, source.name)
    : getLeadCentreUrl(source.name, period);

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
        <Link to={linkFn('today')} className="sourceCardTotalLink">
          <span className="sourceCardTotalValue">{formatNumber(today)}</span>
        </Link>
        <span className="sourceCardTotalLabel">Today's Leads</span>
      </div>
      <div className="sourceCardStats">
        <div className="sourceStat">
          <Link to={linkFn('yesterday')} className="sourceStatLink">
            <span className="sourceStatValue">{formatNumber(yesterday)}</span>
          </Link>
          <span className="sourceStatLabel"><span className="labelDesktop">Yesterday</span><span className="labelMobile">-1 day</span></span>
        </div>
        <div className="sourceStat">
          <Link to={linkFn('7days')} className="sourceStatLink">
            <span className="sourceStatValue">{formatNumber(days7)}</span>
          </Link>
          <span className="sourceStatLabel"><span className="labelDesktop">Last 7 Days</span><span className="labelMobile">-7 days</span></span>
        </div>
        <div className="sourceStat">
          <Link to={linkFn('30days')} className="sourceStatLink">
            <span className="sourceStatValue">{formatNumber(days30)}</span>
          </Link>
          <span className="sourceStatLabel"><span className="labelDesktop">Last 30 Days</span><span className="labelMobile">-30 days</span></span>
        </div>
      </div>
      <div className={`sourceCardTrend ${trend >= 0 ? 'trendUp' : 'trendDown'}`}>
        {trend >= 0 ? '↑' : '↓'} {formatNumber(Math.abs(trend))} vs yesterday ({Math.abs(trendPercent)}%)
      </div>
    </div>
  );
}

function RegionCard({ region, counts, color }) {
  const [showTooltip, setShowTooltip] = useState(false);

  const n = (v) => (typeof v === 'string' ? parseInt(v, 10) : (v || 0));
  const today     = n(counts?.count_today);
  const yesterday = n(counts?.count_yesterday);
  const days7     = n(counts?.count_7_days);
  const days30    = n(counts?.count_30_days);

  const total = days30 || 1;
  const regionName = region.name;
  const branches = REGION_BRANCHES[regionName] || [];

  const bars = [
    { labelDesktop: 'Today',        labelMobile: 'Today',    value: today,     period: 'today' },
    { labelDesktop: 'Yesterday',    labelMobile: '-1 day',   value: yesterday, period: 'yesterday' },
    { labelDesktop: 'Last 7 Days',  labelMobile: '-7 days',  value: days7,     period: '7days' },
    { labelDesktop: 'Last 30 Days', labelMobile: '-30 days', value: days30,    period: '30days' },
  ];

  return (
    <div className="regionCard" style={{ '--region-color': color }}>
      <div className="regionCardHeader">
        <span
          className="regionCardName"
          style={{ position: 'relative', cursor: 'default' }}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          {regionName}
          {showTooltip && branches.length > 0 && (
            <div className="regionBranchTooltip">
              {branches.map(b => <div key={b}>{b}</div>)}
            </div>
          )}
        </span>
        <Link
          to={getLeadCentreUrl('', 'today', regionName)}
          className="regionCardTotalLink"
        >
          <span className="regionCardTotal">{formatNumber(today)}</span>
          <span className="regionCardTotalLabel">Today</span>
        </Link>
      </div>
      <div className="regionCardBars">
        {bars.map(({ labelDesktop, labelMobile, value, period }) => (
          <div key={labelDesktop} className="regionBarItem">
            <div className="regionBarLabel">
              <span className="labelDesktop">{labelDesktop}</span>
              <span className="labelMobile">{labelMobile}</span>
            </div>
            <div className="regionBarTrack">
              <div
                className="regionBarFill"
                style={{ width: `${Math.min((value / total) * 100 || 0, 100)}%` }}
              />
            </div>
            {labelDesktop === 'Today' ? (
              <Link to={getLeadCentreUrl('', period, regionName)} className="regionBarValueLink">
                {formatNumber(value)}
              </Link>
            ) : (
              <div className="regionBarValue">{formatNumber(value)}</div>
            )}
          </div>
        ))}
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
            <th className="textRight"><span className="labelDesktop">Yesterday</span><span className="labelMobile">-1 day</span></th>
            <th className="textRight"><span className="labelDesktop">Last 7 Days</span><span className="labelMobile">-7 days</span></th>
            <th className="textRight"><span className="labelDesktop">Last 30 Days</span><span className="labelMobile">-30 days</span></th>
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

  // Online count without siblings — comes from grandTotal to stay consistent with Lead Sources section
  const onlineToday = parseInt(grandTotal.count_online_today) || 0;

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
          {/* Summary Stats — without siblings (matches Lead Sources section) */}
          <div className="section">
            <h3 className="sectionTitle">📈 Summary (without siblings)</h3>
            <p className="sectionSubtitle">Hourly target + headline lead counts</p>
          </div>
          <div className="summaryStatsRow">
            <HourlyTargetCard currentLeads={todayTotal} />
            <div className="summaryStats">
            <StatCard
              title="Total Leads (30d)"
              value={totalLeads}
              icon="📈"
              color="#3b82f6"
              subtitle="All sources combined"
              to={getLeadCentreUrl('', '30days')}
            />
            <StatCard
              title="Today's Leads | Online"
              value={todayTotal - onlineToday}
              bracketValue={onlineToday}
              icon="📅"
              color="#10b981"
              subtitle={`${yesterdayTotal ? ((todayTotal/yesterdayTotal - 1) * 100).toFixed(1) : 0}% vs yesterday`}
              to={getLeadCentreUrl('', 'today')}
            />
            <StatCard
              title="Yesterday's Leads"
              value={yesterdayTotal}
              icon="📆"
              color="#f59e0b"
              subtitle={`${todayTotal ? ((todayTotal/yesterdayTotal - 1) * 100).toFixed(1) : 0}% change today`}
              to={getLeadCentreUrl('', 'yesterday')}
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
          </div>

          {/* Lead Sources — 4 fixed cards */}
          <div className="section">
            <h3 className="sectionTitle">📊 Lead Sources (without siblings)</h3>
            <p className="sectionSubtitle">Performance breakdown by acquisition channel</p>
            <div className="sourcesGrid">
              {[
                { key: 'Meta', icon: null, img: '/facebook_logo.svg', color: '#1877f2',
                  tooltip: { title: 'Meta', desc: 'Leads from Meta campaigns where the lead filled in an instant form on Facebook, Instagram, or Threads.' } },
                { key: 'TikTok', icon: null, img: '/tiktok_logo.svg', color: '#010101',
                  tooltip: { title: 'TikTok', desc: 'Leads from TikTok campaigns where the lead filled in an instant form on TikTok.' } },
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

          {/* Regions — same layout as Lead Sources */}
          <div className="section">
            <h3 className="sectionTitle">🗺️ Regional Breakdown (with siblings)</h3>
            <p className="sectionSubtitle">Lead distribution across mapped regions</p>
            <div className="sourcesGrid">
              {(() => {
                const regions = q.data?.regions || [];
                const totalCounts = {
                  count_today: regions.reduce((s, r) => s + (parseInt(r.count_today) || 0), 0),
                  count_yesterday: regions.reduce((s, r) => s + (parseInt(r.count_yesterday) || 0), 0),
                  count_7_days: regions.reduce((s, r) => s + (parseInt(r.count_7_days) || 0), 0),
                  count_30_days: regions.reduce((s, r) => s + (parseInt(r.count_30_days) || 0), 0),
                };
                const cards = [
                  { key: 'Total', icon: '📊', color: '#3b82f6', counts: totalCounts, regionName: '',
                    tooltip: { title: 'Total', desc: 'Combined leads from all regions.' } },
                  ...regions.map((r, idx) => ({
                    key: r.region,
                    icon: ['🔵', '🟢', '🟡'][idx] || '⚪',
                    color: regionColors[idx % regionColors.length],
                    counts: r,
                    regionName: r.region,
                    tooltip: { title: r.region, desc: (REGION_BRANCHES[r.region] || []).join('\n') },
                  })),
                ];
                return cards.map(card => (
                  <SourceCard
                    key={card.key}
                    source={{ name: card.regionName || '', icon: card.icon, displayName: card.key, tooltip: card.tooltip }}
                    counts={card.counts}
                    color={card.color}
                  />
                ));
              })()}
            </div>
          </div>

          {/* Branches */}
          <div className="section">
            <h3 className="sectionTitle">🏢 Branch Performance (with siblings)</h3>
            <p className="sectionSubtitle">Lead counts by branch office, sorted by 30-day total</p>
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

