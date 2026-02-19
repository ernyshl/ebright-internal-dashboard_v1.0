import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { MarketingTable } from '../components/MarketingTable';
import { BackButton } from '../components/BackButton';

export function MarketingPerformancePage() {
  const q = useQuery({
    queryKey: ['marketing', 'performance'],
    queryFn: () => apiFetch('/api/marketing/performance'),
    refetchInterval: 180_000,
  });

  const channels = q.data?.channels;
  const groups = q.data?.groups;
  const campaigns = q.data?.campaigns;

  return (
    <div className="stack">
      <div className="pageHeader">
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16 }}>
          <div className="pageHeaderTitle">Marketing Performance</div>
          <div className="pageHeaderSub">Spend, leads, conversions, CPL & CPC · Auto-refresh every 3 min</div>
        </div>
        <button className="btn btnSmall" onClick={() => q.refetch()} disabled={q.isFetching}>
          {q.isFetching ? '⟳ Refreshing…' : '⟳ Refresh'}
        </button>
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
              title="Ebright Group Expenses"
              rows={[
                { label: 'FB (Group)', ...channels.fb_group },
                { label: 'TikTok', ...channels.tiktok },
                { label: 'TOTAL', ...groups?.ebright_group_expenses, isTotal: true },
              ]}
            />
          </div>

          <div className="grid2">
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <MarketingTable title="Sara Recruitment" rows={[{ label: 'Sara', ...channels.sara }]} />
            </div>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <MarketingTable title="Ebright Online By MOKHIR" rows={[{ label: 'Online', ...channels.online }]} />
            </div>
          </div>

          {channels.google && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <MarketingTable title="Google Ads" rows={[{ label: 'Google', ...channels.google }]} />
            </div>
          )}

          {/* Campaign Performance Section */}
          <div className="stack">
            <h3 style={{ margin: '24px 0 12px 0', fontSize: 18, fontWeight: 600 }}>Top Campaign Performance</h3>
            
            {campaigns?.fb_group?.length > 0 && (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <MarketingTable
                  title="Top FB Group Campaigns"
                  rows={campaigns.fb_group.map(c => ({ label: c.name, ...c }))}
                />
              </div>
            )}

            {campaigns?.tiktok?.length > 0 && (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <MarketingTable
                  title="Top TikTok Campaigns"
                  rows={campaigns.tiktok.map(c => ({ label: c.name, ...c }))}
                />
              </div>
            )}

            {campaigns?.sara?.length > 0 && (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <MarketingTable
                  title="Top Sara Recruitment Campaigns"
                  rows={campaigns.sara.map(c => ({ label: c.name, ...c }))}
                />
              </div>
            )}

            {campaigns?.online?.length > 0 && (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <MarketingTable
                  title="Top Online Campaigns"
                  rows={campaigns.online.map(c => ({ label: c.name, ...c }))}
                />
              </div>
            )}

            {campaigns?.google?.length > 0 && (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <MarketingTable
                  title="Top Google Ads Campaigns"
                  rows={campaigns.google.map(c => ({ label: c.name, ...c }))}
                />
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

