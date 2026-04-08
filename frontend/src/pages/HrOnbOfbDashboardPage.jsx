import { useQuery } from '@tanstack/react-query';
import { BackButton } from '../components/BackButton';
import { apiFetch } from '../lib/api';

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function isUpcoming(d) {
  return d && new Date(d) >= new Date(new Date().toDateString());
}

function Table({ title, records, type, dateField, dateLabel }) {
  const isOnb = type === 'onboarding';
  return (
    <div className="card" style={{ flex: 1, overflowX: 'auto', padding: 0 }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600, color: isOnb ? 'var(--success)' : 'var(--brand)' }}>
        {title} ({records.length})
      </div>
      <table className="dataTable">
        <thead>
          <tr>
            <th>#</th>
            <th>Name</th>
            <th>Position</th>
            <th>Department / Branch</th>
            <th>{dateLabel}</th>
          </tr>
        </thead>
        <tbody>
          {records.length === 0 ? (
            <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>No records</td></tr>
          ) : records.map((r, i) => {
            const upcoming = isUpcoming(r[dateField]);
            return (
              <tr key={r.id} style={upcoming ? { background: isOnb ? 'var(--successLight)' : 'var(--brandLight)' } : {}}>
                <td style={{ color: 'var(--muted)', fontSize: 12 }}>{i + 1}</td>
                <td><strong>{r.name}</strong></td>
                <td>{r.position}</td>
                <td>{r.department_branch}</td>
                <td style={{ whiteSpace: 'nowrap', fontWeight: upcoming ? 600 : 400 }}>{fmtDate(r[dateField])}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function HrOnbOfbDashboardPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['hrOnbOfbDashboard'],
    queryFn: () => apiFetch('/api/hr-staff-movements/dashboard'),
    staleTime: 2 * 60 * 1000,
  });

  const onboarding = data?.onboarding || [];
  const offboarding = data?.offboarding || [];

  return (
    <div className="dashboardPage">
      <div className="dashboardHeader">
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16 }}>
          <h1 className="pageHeaderTitle">Onboarding / Offboarding Dashboard</h1>
          <p className="headerSubtitle">Showing -2 weeks to +2 months from today</p>
        </div>
        <button className="btn btnGhost btnSmall" onClick={() => refetch()} style={{ marginLeft: 'auto' }}>↺ Refresh</button>
      </div>

      {isLoading ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div className="loadingDots"><span /><span /><span /></div>
          <p style={{ marginTop: 12, color: 'var(--muted)' }}>Loading...</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Table title="Onboarding" records={onboarding} type="onboarding" dateField="start_date" dateLabel="Start Date" />
          <Table title="Offboarding" records={offboarding} type="offboarding" dateField="end_date" dateLabel="End Date" />
        </div>
      )}
    </div>
  );
}
