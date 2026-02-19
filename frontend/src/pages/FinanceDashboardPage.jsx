import { BackButton } from '../components/BackButton';

export function FinanceDashboardPage() {
  return (
    <div>
      <div className="pageHeader">
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16 }}>
          <h1 className="pageHeaderTitle">Finance Dashboard</h1>
          <p className="pageHeaderSub">Financial metrics and insights</p>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden', height: 'calc(100vh - 180px)' }}>
        <iframe
          src="https://lookerstudio.google.com/embed/reporting/081a331d-fded-4517-9716-f9054591d758/page/ORbmF"
          width="100%"
          height="100%"
          frameBorder="0"
          style={{ border: 0 }}
          allowFullScreen
          sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        />
      </div>
    </div>
  );
}