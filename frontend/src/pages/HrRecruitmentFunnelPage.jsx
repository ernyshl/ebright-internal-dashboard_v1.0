import { BackButton } from '../components/BackButton';

export function HrRecruitmentFunnelPage() {
  return (
    <div className="dashboardPage">
      <div className="dashboardHeader">
        <BackButton to="/" label="Back to Home" />
        <h1 style={{ marginTop: 16 }}>HR Recruitment Funnel</h1>
      </div>
      <div className="dashboardContent">
        <iframe
          src="https://app.ebright.my/v2/location/qRppdrVmN6aMHvRFq4mB/dashboard/6916f1c0d600ed32ca813033"
          title="HR Recruitment Funnel"
          style={{ width: '100%', height: 'calc(100vh - 180px)', border: 'none' }}
          allowFullScreen
        />
      </div>
    </div>
  );
}