import { BackButton } from '../components/BackButton';

export function LookerDashboardPage() {
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', margin: '-24px' }}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        padding: '12px 24px', 
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg)',
        flexShrink: 0
      }}>
        <BackButton to="/" label="" />
        <div style={{ marginLeft: 8 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Operations Dashboard</h1>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>Real-time business metrics and insights</p>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'hidden' }}>
        <iframe
          src="https://lookerstudio.google.com/embed/reporting/775a46b1-e020-465a-861e-067e6a21a004/page/73gmF"
          width="100%"
          height="100%"
          frameBorder="0"
          style={{ border: 'none' }}
          allowFullScreen
          sandbox="allow-forms allow-scripts allow-same-origin allow-popups"
        />
      </div>
    </div>
  );
}