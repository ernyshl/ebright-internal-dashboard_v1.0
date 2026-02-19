import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { BackButton } from '../components/BackButton';

export function AcademyDashboardPage() {
  const q = useQuery({
    queryKey: ['academy', 'dashboard'],
    queryFn: () => apiFetch('/api/academy/stats'),
    refetchInterval: 300_000, // Refresh every 5 minutes
  });

  return (
    <div className="stack">
      <div className="pageHeader">
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16 }}>
          <div className="pageHeaderTitle">Academy Dashboard</div>
          <div className="pageHeaderSub">GoHighLevel Integration · Auto-refresh every 5 min</div>
        </div>
        <button className="btn btnSmall" onClick={() => q.refetch()} disabled={q.isFetching}>
          {q.isFetching ? '⟳ Refreshing…' : '⟳ Refresh'}
        </button>
      </div>

      {q.isLoading ? (
        <div className="card">
          <div className="loadingCard">
            <div className="loadingDots"><span /><span /><span /></div> Loading academy data…
          </div>
        </div>
      ) : q.isError ? (
        <div className="errorText">
          {q.error?.data?.error || 'Failed to load academy data.'}{' '}
          <span className="muted small">{q.error?.data?.hint || ''}</span>
        </div>
      ) : (
        <div className="stack">
          {/* GHL Embedded Dashboard */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{
              padding: '14px 18px',
              fontWeight: 700,
              fontSize: 14,
              borderBottom: '1px solid var(--border)',
              background: '#f8fafc',
            }}>
              📊 GoHighLevel Academy Dashboard
            </div>
            <div style={{ 
              width: '100%', 
              height: 'calc(100vh - 280px)',
              minHeight: '600px',
              border: 'none'
            }}>
              <iframe
                src="https://app.ebright.my/v2/location/uCIrspLXxSiM9hj1g1sd/dashboard"
                title="Academy GHL Dashboard"
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>

          {/* Quick Stats from API (if available) */}
          {q.data?.stats && (
            <div className="grid2">
              <div className="card">
                <h3 style={{ margin: '0 0 16px 0', fontSize: 16 }}>📈 Quick Overview</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                  {Object.entries(q.data.stats).map(([key, value]) => (
                    <div key={key} style={{ padding: 12, background: 'var(--bg)', borderRadius: 8 }}>
                      <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--brand)' }}>
                        {typeof value === 'number' ? value.toLocaleString() : value}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'capitalize' }}>
                        {key.replace(/_/g, ' ')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="card">
                <h3 style={{ margin: '0 0 16px 0', fontSize: 16 }}>ℹ️ About This Dashboard</h3>
                <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6 }}>
                  This dashboard embeds the GoHighLevel Academy dashboard from{' '}
                  <code>app.ebright.my</code>. The embedded view shows real-time data including:
                </p>
                <ul style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.8, paddingLeft: 20 }}>
                  <li>Pipeline and deal status</li>
                  <li>Appointment metrics</li>
                  <li>Team performance</li>
                  <li>Revenue analytics</li>
                </ul>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 16 }}>
                  💡 Tip: Use the refresh button above to update the data.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}