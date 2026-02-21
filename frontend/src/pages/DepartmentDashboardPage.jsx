import { BackButton } from '../components/BackButton';

export function DepartmentDashboardPage() {
  return (
    <div className="dashboardPage">
      <div className="dashboardHeader">
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16 }}>
          <h1 className="pageHeaderTitle">Department Dashboard</h1>
          <p className="headerSubtitle">Department level metrics</p>
        </div>
      </div>
      <div className="dashboardContent">
        <iframe
          src="https://lookerstudio.google.com/embed/reporting/8c4a6370-15f8-4b61-9b43-1af9a702046f/page/kFKnF"
          title="Department Dashboard"
          style={{ width: '100%', height: 'calc(100vh - 180px)', border: 'none' }}
          allowFullScreen
        />
      </div>
    </div>
  );
}