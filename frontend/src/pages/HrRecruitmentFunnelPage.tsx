import { BackButton } from '../components/BackButton';

export function HrRecruitmentFunnelPage() {
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
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>HR Recruitment Funnel</h1>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>Recruitment pipeline and metrics</p>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'hidden' }}>
        <iframe
          src="https://app.ebright.my/v2/location/qRppdrVmN6aMHvRFq4mB/dashboard/6916f1c0d600ed32ca813033"
          title="HR Recruitment Funnel"
          width="100%"
          height="100%"
          style={{ border: 'none' }}
          allowFullScreen
        />
      </div>
    </div>
  );
}