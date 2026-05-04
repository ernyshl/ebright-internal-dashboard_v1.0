import { useQuery } from '@tanstack/react-query';
import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { BackButton } from '../components/BackButton';

const REGION_BRANCHES = {
  'Region A': ['Bandar Rimbayu', 'Klang', 'Shah Alam', 'Setia Alam', 'Denai Alam', 'Eco Grandeur', 'Subang Taipan'],
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
  const n = typeof num === 'string' ? parseInt(num, 10) : num;
  if (isNaN(n)) return '—';
  return new Intl.NumberFormat('en-MY').format(n);
}

/* ─── SVG-style icon: colored circle with letter ─── */
function Icon({ letter, color, size = 28 }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: size, height: size, borderRadius: '50%',
      background: color, color: '#fff', fontSize: size * 0.45, fontWeight: 700,
      flexShrink: 0, lineHeight: 1,
    }}>{letter}</span>
  );
}

/* ─── Stat Card — no emojis ─── */
function StatCard({ title, value, icon, color, subtitle, to, bracketValue }) {
  const numValue = typeof value === 'string' ? parseInt(value, 10) : value;

  const inner = (
    <div style={{
      background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
      padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14,
      transition: 'transform 0.15s, box-shadow 0.15s', cursor: to ? 'pointer' : 'default',
    }}
    onMouseEnter={e => { if (to) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}}
    onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}>
      <Icon letter={icon} color={color} size={36} />
      <div>
        <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>
          {formatNumber(numValue)}
          {bracketValue !== undefined && <span style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 500 }}> | {formatNumber(bracketValue)}</span>}
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--textSecondary)', marginTop: 2 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>{subtitle}</div>}
      </div>
    </div>
  );

  return to ? <Link to={to} style={{ textDecoration: 'none' }}>{inner}</Link> : inner;
}

/* ─── Info Tooltip ─── */
function InfoTooltip({ tooltip }) {
  const [show, setShow] = useState(false);
  const timer = useRef(null);
  const handleEnter = () => { clearTimeout(timer.current); setShow(true); };
  const handleLeave = () => { timer.current = setTimeout(() => setShow(false), 120); };

  return (
    <span style={{ position: 'relative', cursor: 'help', marginLeft: 6 }} onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 16, height: 16, borderRadius: '50%', border: '1.5px solid var(--muted)',
        fontSize: 10, fontWeight: 700, color: 'var(--muted)', lineHeight: 1,
      }}>i</span>
      {show && (
        <div style={{
          position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
          marginBottom: 8, padding: '10px 14px', borderRadius: 'var(--radius-sm)',
          background: 'var(--panel)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)',
          minWidth: 200, maxWidth: 280, zIndex: 100, whiteSpace: 'pre-line',
        }} onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', marginBottom: 4 }}>{tooltip.title}</div>
          <div style={{ fontSize: 11, color: 'var(--textSecondary)', lineHeight: 1.5 }}>{tooltip.desc}</div>
          {tooltip.url && <a href={tooltip.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: 'var(--info)', marginTop: 6, display: 'block' }}>{tooltip.url}</a>}
        </div>
      )}
    </span>
  );
}

/* ─── Source/Region Card — proper dark mode, no emojis ─── */
function SourceCard({ source, counts, color }) {
  const today = typeof counts?.count_today === 'string' ? parseInt(counts.count_today, 10) : (counts?.count_today || 0);
  const yesterday = typeof counts?.count_yesterday === 'string' ? parseInt(counts.count_yesterday, 10) : (counts?.count_yesterday || 0);
  const days7 = typeof counts?.count_7_days === 'string' ? parseInt(counts.count_7_days, 10) : (counts?.count_7_days || 0);
  const days30 = typeof counts?.count_30_days === 'string' ? parseInt(counts.count_30_days, 10) : (counts?.count_30_days || 0);
  const trend = today - yesterday;
  const trendPercent = yesterday ? ((trend / yesterday) * 100).toFixed(1) : 0;

  const isRegion = !source.name || source.name.startsWith('Region');
  const linkFn = (period) => isRegion ? getLeadCentreUrl('', period, source.name) : getLeadCentreUrl(source.name, period);

  return (
    <div style={{
      background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
      padding: 0, overflow: 'hidden', transition: 'transform 0.15s, box-shadow 0.15s',
    }}
    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}
    onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)' }}>
        {source.img
          ? <img src={source.img} alt={source.name} style={{ width: 28, height: 20, objectFit: 'contain' }} />
          : <Icon letter={(source.displayName || source.name || 'T').charAt(0)} color={color} size={28} />
        }
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
          {source.displayName || source.name}
          {source.sublabel && <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 400, marginLeft: 4 }}>{source.sublabel}</span>}
        </span>
        {source.tooltip && <InfoTooltip tooltip={source.tooltip} />}
      </div>

      {/* Today big number */}
      <div style={{ padding: '14px 16px', textAlign: 'center' }}>
        <Link to={linkFn('today')} style={{ textDecoration: 'none' }}>
          <div style={{ fontSize: 32, fontWeight: 800, color, lineHeight: 1 }}>{formatNumber(today)}</div>
        </Link>
        <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Today's Leads</div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', borderTop: '1px solid var(--border)' }}>
        {[
          { label: 'Yesterday', value: yesterday, period: 'yesterday' },
          { label: '7 Days', value: days7, period: '7days' },
          { label: '30 Days', value: days30, period: '30days' },
        ].map(s => (
          <div key={s.label} style={{ flex: 1, padding: '10px 8px', textAlign: 'center', borderRight: '1px solid var(--border)' }}>
            <Link to={linkFn(s.period)} style={{ textDecoration: 'none' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{formatNumber(s.value)}</div>
            </Link>
            <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 500, textTransform: 'uppercase', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Trend */}
      <div style={{
        padding: '8px 16px', fontSize: 11, fontWeight: 600, textAlign: 'center',
        color: trend >= 0 ? 'var(--success)' : 'var(--brand)',
        background: trend >= 0 ? 'var(--successLight)' : 'var(--brandLight)',
      }}>
        {trend >= 0 ? '↑' : '↓'} {formatNumber(Math.abs(trend))} vs yesterday ({Math.abs(trendPercent)}%)
      </div>
    </div>
  );
}

/* ─── Branch Table ─── */
function BranchTable({ branches }) {
  if (!branches || branches.length === 0) return <div style={{ color: 'var(--muted)' }}>No branch data available.</div>;

  const normalizeBranch = (branch) => ({
    ...branch,
    count_today: typeof branch.count_today === 'string' ? parseInt(branch.count_today, 10) : (branch.count_today || 0),
    count_yesterday: typeof branch.count_yesterday === 'string' ? parseInt(branch.count_yesterday, 10) : (branch.count_yesterday || 0),
    count_7_days: typeof branch.count_7_days === 'string' ? parseInt(branch.count_7_days, 10) : (branch.count_7_days || 0),
    count_30_days: typeof branch.count_30_days === 'string' ? parseInt(branch.count_30_days, 10) : (branch.count_30_days || 0),
  });

  const inactiveBranches = ['Taman Melawati', 'Kajang Perdana', 'Bandar Sri Damansara', 'Kepong', 'Bandra East', 'Andheri West'];
  const sorted = [...branches.map(normalizeBranch)]
    .filter(b => !inactiveBranches.includes(b.clean_branch))
    .sort((a, b) => b.count_30_days - a.count_30_days);

  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <table className="dataTable">
        <thead>
          <tr>
            <th>Branch</th>
            <th style={{ textAlign: 'right' }}>Today</th>
            <th style={{ textAlign: 'right' }}>Yesterday</th>
            <th style={{ textAlign: 'right' }}>7 Days</th>
            <th style={{ textAlign: 'right' }}>30 Days</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((branch, idx) => (
            <tr key={branch.clean_branch || idx} style={idx < 3 ? { background: 'var(--successLight)' } : {}}>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {idx < 3 && <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 20, height: 20, borderRadius: '50%', fontSize: 10, fontWeight: 700,
                    background: idx === 0 ? '#f59e0b' : idx === 1 ? '#94a3b8' : '#cd7f32',
                    color: '#fff',
                  }}>#{idx + 1}</span>}
                  <span style={{ fontWeight: idx < 3 ? 600 : 400 }}>{branch.clean_branch || 'Unknown'}</span>
                </div>
              </td>
              <td style={{ textAlign: 'right' }}>{formatNumber(branch.count_today)}</td>
              <td style={{ textAlign: 'right' }}>{formatNumber(branch.count_yesterday)}</td>
              <td style={{ textAlign: 'right' }}>{formatNumber(branch.count_7_days)}</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatNumber(branch.count_30_days)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Section Header ─── */
function SectionHeader({ icon, letter, color, title, subtitle }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
        <Icon letter={letter} color={color} size={30} />
        {title}
      </div>
      {subtitle && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, marginLeft: 40 }}>{subtitle}</div>}
    </div>
  );
}

export function UiUxTestingPage() {
  const q = useQuery({
    queryKey: ['leads', 'breakdown'],
    queryFn: () => apiFetch('/api/leads/breakdown'),
    refetchInterval: 180_000,
  });

  const grandTotal = q.data?.grandTotal || {};
  const totalLeads = parseInt(grandTotal.count_30_days) || 0;
  const todayTotal = parseInt(grandTotal.count_today) || 0;
  const yesterdayTotal = parseInt(grandTotal.count_yesterday) || 0;
  const branches = q.data?.branches || [];
  const regionCount = q.data?.regions?.length || 0;

  const inactiveBranches = ['Taman Melawati', 'Kajang Perdana', 'Bandar Sri Damansara', 'Kepong', 'Bandra East', 'Andheri West'];
  const activeBranches = branches.filter(b => !inactiveBranches.includes(b.clean_branch));
  const branchCount = activeBranches.length;

  const onlineBranch = branches.find(b => b.clean_branch && b.clean_branch.toLowerCase().includes('online'));
  const onlineToday = parseInt(onlineBranch?.count_today) || 0;

  const regionColors = ['#3b82f6', '#10b981', '#f59e0b'];

  return (
    <div className="dashboardPage">
      <div className="dashboardHeader">
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16 }}>
          <h1 className="pageHeaderTitle" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon letter="T" color="#f97316" size={32} />
            UI/UX Testing
          </h1>
          <p className="headerSubtitle">Lead counts by source, region & branch · Auto-refresh every 3 min</p>
        </div>
        <button className="btn btnGhost btnSmall" onClick={() => q.refetch()} disabled={q.isFetching} style={{ marginLeft: 'auto' }}>
          {q.isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {q.isLoading ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div className="loadingDots"><span /><span /><span /></div>
          <p style={{ marginTop: 12, color: 'var(--muted)' }}>Loading...</p>
        </div>
      ) : q.isError ? (
        <div className="errorText">{q.error?.data?.error || 'Failed to load leads data.'}</div>
      ) : (
        <>
          {/* Hourly Target + Summary Stats — integrated flex row */}
          <div style={{ display: 'flex', gap: 14, marginBottom: 24, alignItems: 'stretch' }}>
            <div style={{ position: 'relative', width: 220, minHeight: 180, flexShrink: 0 }}>
              <HourlyTargetCard currentLeads={todayTotal} />
            </div>
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              <StatCard title="Total Leads (30d)" value={totalLeads} icon="L" color="#3b82f6" subtitle="All sources combined" to={getLeadCentreUrl('', '30days')} />
              <StatCard title="Today's Leads | Online" value={todayTotal - onlineToday} bracketValue={onlineToday} icon="T" color="#10b981" subtitle={`${yesterdayTotal ? ((todayTotal/yesterdayTotal - 1) * 100).toFixed(1) : 0}% vs yesterday`} to={getLeadCentreUrl('', 'today')} />
              <StatCard title="Yesterday's Leads" value={yesterdayTotal} icon="Y" color="#f59e0b" subtitle={`${todayTotal ? ((todayTotal/yesterdayTotal - 1) * 100).toFixed(1) : 0}% change today`} to={getLeadCentreUrl('', 'yesterday')} />
              <StatCard title="Active Regions" value={regionCount} icon="R" color="#6366f1" subtitle="With lead activity" />
              <StatCard title="Active Branches" value={branchCount} icon="B" color="#ec4899" subtitle="With lead activity" />
            </div>
          </div>

          {/* Lead Sources */}
          <div style={{ marginBottom: 32 }}>
            <SectionHeader letter="S" color="#3b82f6" title="Lead Sources (without siblings)" subtitle="Performance breakdown by acquisition channel" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
              {[
                { key: 'Meta', img: '/facebook_logo.svg', color: '#1877f2', tooltip: { title: 'Meta', desc: 'Leads from Meta campaigns where the lead filled in an instant form on Facebook, Instagram, or Threads.' } },
                { key: 'TikTok', img: '/tiktok_logo.svg', color: '#69c9d0', tooltip: { title: 'TikTok', desc: 'Leads from TikTok campaigns where the lead filled in an instant form on TikTok.' } },
                { key: 'Trial Class Form', color: '#3b82f6', sublabel: '(Conversion)', displayName: 'Website', tooltip: { title: 'Website (Conversion)', desc: 'Leads from conversion campaigns (Meta/TikTok) where the lead filled in the form on the website.', url: 'https://www.ebright.my/trial-classes' } },
                { key: 'Roadshow', color: '#f97316', tooltip: { title: 'Roadshow', desc: 'Leads from contacts collected during showcase, festival roadshows, and/or promotional events.' } },
                { key: 'Self Generated Lead', color: '#10b981', tooltip: { title: 'Self Generated Lead', desc: 'Leads generated directly by staff through personal or direct contact.' } },
                { key: 'Walk In', color: '#6366f1', tooltip: { title: 'Walk In', desc: 'Leads who visited the centre directly to inquire or attend a trial session.' } },
                { key: 'Website', color: '#8b5cf6', sublabel: '(Organic)', tooltip: { title: 'Website (Organic)', desc: 'Leads who found the website organically and clicked the trial class form.' } },
                { key: 'Others', color: '#64748b', tooltip: { title: 'Others', desc: 'Leads that do not fall under any other category.' } },
              ].map(card => {
                const match = q.data?.total?.find(s => s.lead_source === card.key);
                return (
                  <SourceCard
                    key={card.key}
                    source={{ name: card.key, img: card.img, sublabel: card.sublabel, displayName: card.displayName, tooltip: card.tooltip }}
                    counts={match || { count_today: 0, count_yesterday: 0, count_7_days: 0, count_30_days: 0 }}
                    color={card.color}
                  />
                );
              })}
            </div>
          </div>

          {/* Regions */}
          <div style={{ marginBottom: 32 }}>
            <SectionHeader letter="R" color="#10b981" title="Regional Breakdown (with siblings)" subtitle="Lead distribution across mapped regions" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
              {(() => {
                const regions = q.data?.regions || [];
                const totalCounts = {
                  count_today: regions.reduce((s, r) => s + (parseInt(r.count_today) || 0), 0),
                  count_yesterday: regions.reduce((s, r) => s + (parseInt(r.count_yesterday) || 0), 0),
                  count_7_days: regions.reduce((s, r) => s + (parseInt(r.count_7_days) || 0), 0),
                  count_30_days: regions.reduce((s, r) => s + (parseInt(r.count_30_days) || 0), 0),
                };
                const cards = [
                  { key: 'Total', color: '#3b82f6', counts: totalCounts, regionName: '', tooltip: { title: 'Total', desc: 'Combined leads from all regions.' } },
                  ...regions.map((r, idx) => ({
                    key: r.region, color: regionColors[idx % regionColors.length], counts: r, regionName: r.region,
                    tooltip: { title: r.region, desc: (REGION_BRANCHES[r.region] || []).join('\n') },
                  })),
                ];
                return cards.map(card => (
                  <SourceCard key={card.key} source={{ name: card.regionName || '', displayName: card.key, tooltip: card.tooltip }} counts={card.counts} color={card.color} />
                ));
              })()}
            </div>
          </div>

          {/* Branches */}
          <div style={{ marginBottom: 32 }}>
            <SectionHeader letter="B" color="#ec4899" title="Branch Performance" subtitle="Lead counts by branch office (sorted by 30-day total)" />
            <BranchTable branches={q.data?.branches} />
          </div>

          {/* Others Detail */}
          {q.data?.othersDetail && q.data.othersDetail.length > 0 && (
            <div style={{ marginBottom: 32 }}>
              <SectionHeader letter="O" color="#64748b" title="Others — Raw Lead Source Breakdown" subtitle="Unclassified lead_source values" />
              <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                <table className="dataTable">
                  <thead>
                    <tr>
                      <th>Raw Lead Source</th>
                      <th style={{ textAlign: 'right' }}>Today</th>
                      <th style={{ textAlign: 'right' }}>All Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {q.data.othersDetail.map((row, idx) => (
                      <tr key={idx}>
                        <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{row.raw_lead_source || '(empty)'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: parseInt(row.count_today) > 0 ? 'var(--warning)' : 'var(--text)' }}>{formatNumber(parseInt(row.count_today))}</td>
                        <td style={{ textAlign: 'right' }}>{formatNumber(parseInt(row.count_total))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
