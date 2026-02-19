import { BackButton } from '../components/BackButton';

export function AcademyDashboardPage() {
  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100vh',
      margin: -20,
    }}>
      {/* Compact Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '12px 20px',
        background: 'var(--bg)',
        borderBottom: '1px solid var(--border)',
        gap: 16,
      }}>
        <BackButton to="/" label="Back" />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 16 }}>Academy Dashboard</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>GoHighLevel Integration</div>
        </div>
      </div>

      {/* Full-Width Iframe */}
      <div style={{ 
        flex: 1,
        width: '100%',
        border: 'none',
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
  );
}