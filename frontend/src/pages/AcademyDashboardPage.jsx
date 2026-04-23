import { BackButton } from '../components/BackButton';

export function AcademyDashboardPage() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      margin: -20,
      background: 'var(--bg)',
    }}>
      {/* Compact Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '12px 16px',
        background: 'var(--bg)',
        borderBottom: '1px solid var(--border)',
        gap: 12,
        flexWrap: 'wrap',
      }}>
        <BackButton to="/" label="Back" />
        <div style={{ flex: 1, minWidth: '150px' }}>
          <div style={{ marginTop: 16 }}>
            <h1 className="pageHeaderTitle">Academy Dashboard</h1>
            <p className="headerSubtitle">Academy metrics</p>
          </div>
        </div>
      </div>

      {/* Full-Width Iframe */}
      <div style={{
        flex: 1,
        width: '100%',
        border: 'none',
        minHeight: 0,
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