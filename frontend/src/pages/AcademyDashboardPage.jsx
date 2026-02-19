import { useQuery } from '@tanstack/react-query';
import { BackButton } from '../components/BackButton';

export function AcademyDashboardPage() {
  return (
    <div className="stack">
      <div className="pageHeader">
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16 }}>
          <div className="pageHeaderTitle">Academy Dashboard</div>
          <div className="pageHeaderSub">GoHighLevel Integration</div>
        </div>
      </div>

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
          height: 'calc(100vh - 220px)',
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
    </div>
  );
}