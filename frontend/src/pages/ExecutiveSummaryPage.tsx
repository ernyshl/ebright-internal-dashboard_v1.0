import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

function fmtNum(n) {
  return Number(n || 0).toLocaleString();
}

function fmtRM(n) {
  return `RM ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ExecutiveSummaryPage() {
  const marketing = useQuery({
    queryKey: ['marketing', 'performance'],
    queryFn: () => apiFetch('/api/marketing/performance'),
    refetchInterval: 180_000,
    retry: 1,
  });

  const leads = useQuery({
    queryKey: ['leads', 'breakdown'],
    queryFn: () => apiFetch('/api/leads/breakdown'),
    refetchInterval: 180_000,
    retry: 1,
  });

  const channels = marketing.data?.channels;
  const groups = marketing.data?.groups;
  const totalRow = groups?.main_marketing;

  // Sum up leads from all sources
  const totalLeadsToday = leads.data?.total?.reduce((s, r) => s + Number(r.count_today || 0), 0) || 0;
  const totalLeads7d = leads.data?.total?.reduce((s, r) => s + Number(r.count_7_days || 0), 0) || 0;
  const totalLeads30d = leads.data?.total?.reduce((s, r) => s + Number(r.count_30_days || 0), 0) || 0;

  return (
    <div className="stack">
      <div className="pageHeader">
        <div>
          <div className="pageHeaderTitle">Executive Summary</div>
          <div className="pageHeaderSub">
            <span className="live-dot" />
            Real-time overview of marketing spend and lead generation
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid4">
        <div className="statCard statCardBrand">
          <div className="statLabel">Total Spend Today</div>
          <div className="statValue">{totalRow ? fmtRM(totalRow.today?.spend) : '—'}</div>
          <div className="statMeta">Ebright Group (FB + TikTok)</div>
        </div>
        <div className="statCard statCardInfo">
          <div className="statLabel">Leads Today</div>
          <div className="statValue">{totalLeadsToday > 0 ? fmtNum(totalLeadsToday) : '—'}</div>
          <div className="statMeta">All sources combined</div>
        </div>
        <div className="statCard statCardSuccess">
          <div className="statLabel">Leads (7 Days)</div>
          <div className="statValue">{totalLeads7d > 0 ? fmtNum(totalLeads7d) : '—'}</div>
          <div className="statMeta">Rolling 7-day total</div>
        </div>
        <div className="statCard">
          <div className="statLabel">Leads (30 Days)</div>
          <div className="statValue">{totalLeads30d > 0 ? fmtNum(totalLeads30d) : '—'}</div>
          <div className="statMeta">Rolling 30-day total</div>
        </div>
      </div>

      {/* Channel breakdown */}
      <div className="grid2">
        <div className="card">
          <div className="cardTitle">📈 Marketing Spend by Channel</div>
          <div className="cardDescription">Today's spend across all ad accounts</div>
          {marketing.isLoading ? (
            <div className="loadingCard"><div className="loadingDots"><span /><span /><span /></div> Loading…</div>
          ) : marketing.isError ? (
            <div className="errorText">{marketing.error?.data?.error || 'Failed to load marketing data'}</div>
          ) : channels ? (
            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Channel</th>
                    <th>Spend</th>
                    <th>Leads</th>
                    <th>CPL</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: 'FB (Group)', data: channels.fb_group },
                    { label: 'TikTok', data: channels.tiktok },
                    { label: 'Google Ads', data: channels.google },
                    { label: 'Sara', data: channels.sara },
                    { label: 'Online', data: channels.online },
                  ].map(ch => (
                    <tr key={ch.label}>
                      <td style={{ fontWeight: 600 }}>{ch.label}</td>
                      <td>{fmtRM(ch.data?.today?.spend)}</td>
                      <td>{fmtNum(ch.data?.today?.leads)}</td>
                      <td>{fmtRM(ch.data?.today?.cpl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        <div className="card">
          <div className="cardTitle">🏢 Leads by Source</div>
          <div className="cardDescription">Today's lead count per source</div>
          {leads.isLoading ? (
            <div className="loadingCard"><div className="loadingDots"><span /><span /><span /></div> Loading…</div>
          ) : leads.isError ? (
            <div className="errorText">{leads.error?.data?.error || 'Failed to load leads data'}</div>
          ) : leads.data?.total ? (
            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Today</th>
                    <th>7 Days</th>
                    <th>30 Days</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.data.total.map((r, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{r.lead_source || 'Unknown'}</td>
                      <td>{fmtNum(r.count_today)}</td>
                      <td>{fmtNum(r.count_7_days)}</td>
                      <td>{fmtNum(r.count_30_days)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

