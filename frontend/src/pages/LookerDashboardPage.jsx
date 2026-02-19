import { BackButton } from '../components/BackButton';

export function LookerDashboardPage() {
  return (
    <div>
      <div className="pageHeader">
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16 }}>
          <h1 className="pageHeaderTitle">Executive Dashboard</h1>
          <p className="pageHeaderSub">Real-time business metrics and insights</p>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden', height: 'calc(100vh - 180px)' }}>
        <iframe
          src="https://lookerstudio.google.com/embed/reporting/775a46b1-e020-465a-861e-067e6a21a004/page/73gmF"
          width="100%"
          height="100%"
          frameBorder="0"
          style={{ border: 0 }}
          allowFullScreen
          sandbox="allow-forms allow-scripts allow-same-origin allow-popups"
        />
      </div>
    </div>
  );
}