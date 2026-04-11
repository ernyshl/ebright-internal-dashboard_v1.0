import { useQuery } from '@tanstack/react-query';
import { BackButton } from '../components/BackButton';
import { apiFetch } from '../lib/api';

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function isInRange(dateStr, startDaysAgo, endDaysAhead) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const today = new Date(new Date().toDateString());
  const start = new Date(today); start.setDate(start.getDate() - startDaysAgo);
  const end = new Date(today); end.setDate(end.getDate() + endDaysAhead);
  return d >= start && d <= end;
}

function DashTable({ title, titleColor, records, dateField, dateLabel, highlightFn, highlightBg, extraCols, maxHeight }) {
  return (
    <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontWeight: 600, color: titleColor, fontSize: 14 }}>
        {title} ({records.length})
      </div>
      <div style={{ maxHeight: maxHeight || '45vh', overflowY: 'auto' }}>
        <table className="dataTable">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Position</th>
              <th>Dept / Branch</th>
              <th>{dateLabel}</th>
              {extraCols && extraCols.map(c => <th key={c.header}>{c.header}</th>)}
            </tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr><td colSpan={5 + (extraCols?.length || 0)} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24, fontSize: 13 }}>No records</td></tr>
            ) : records.map((r, i) => {
              const highlight = highlightFn(r);
              return (
                <tr key={r.id} style={highlight ? { background: highlightBg } : {}}>
                  <td style={{ color: 'var(--muted)', fontSize: 11 }}>{i + 1}</td>
                  <td style={{ fontSize: 13 }}><strong>{r.name}</strong></td>
                  <td style={{ fontSize: 12 }}>{r.position}</td>
                  <td style={{ fontSize: 12 }}>{r.department_branch}</td>
                  <td style={{ whiteSpace: 'nowrap', fontSize: 12, fontWeight: highlight ? 600 : 400 }}>{fmtDate(r[dateField])}</td>
                  {extraCols && extraCols.map(c => <td key={c.field} style={{ fontSize: 12 }}>{r[c.field] || '—'}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function HrOnbOfbDashboardPage() {
  const { data: staffData, isLoading: staffLoading } = useQuery({
    queryKey: ['hrOnbOfbDashboard'],
    queryFn: () => apiFetch('/api/hr-staff-movements/dashboard'),
    staleTime: 2 * 60 * 1000,
  });

  const { data: mcData, isLoading: mcLoading } = useQuery({
    queryKey: ['hrMcDashboard'],
    queryFn: () => apiFetch('/api/hr-mc/dashboard'),
    staleTime: 2 * 60 * 1000,
  });

  const { data: alData, isLoading: alLoading } = useQuery({
    queryKey: ['hrAnnualLeaveDashboard'],
    queryFn: () => apiFetch('/api/hr-annual-leave/dashboard'),
    staleTime: 2 * 60 * 1000,
  });

  const isLoading = staffLoading || mcLoading || alLoading;
  const onboarding = staffData?.onboarding || [];
  const offboarding = staffData?.offboarding || [];
  const mcRecords = mcData?.records || [];
  const alRecords = alData?.records || [];

  return (
    <div className="dashboardPage">
      <div className="dashboardHeader">
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16 }}>
          <h1 className="pageHeaderTitle">HR Overview Dashboard</h1>
          <p className="headerSubtitle">Onboarding, Offboarding, MC, Annual Leave</p>
        </div>
      </div>

      {isLoading ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div className="loadingDots"><span /><span /><span /></div>
          <p style={{ marginTop: 12, color: 'var(--muted)' }}>Loading...</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <DashTable
            title="Onboarding (today to +6 months)"
            titleColor="var(--success)"
            records={onboarding}
            dateField="start_date"
            dateLabel="Start Date"
            highlightFn={(r) => isInRange(r.start_date, 0, 14)}
            highlightBg="var(--successLight)"
          />
          <DashTable
            title="Offboarding (today to +1 month)"
            titleColor="var(--brand)"
            records={offboarding}
            dateField="end_date"
            dateLabel="End Date"
            highlightFn={(r) => isInRange(r.end_date, 0, 14)}
            highlightBg="var(--brandLight)"
          />
          <DashTable
            title="MC (-2 weeks to today)"
            titleColor="var(--warning)"
            records={mcRecords}
            dateField="mc_date"
            dateLabel="MC Date"
            highlightFn={(r) => isInRange(r.mc_date, 3, 0)}
            highlightBg="var(--warningLight)"
            extraCols={[{ header: 'Reason', field: 'reason' }]}
          />
          <DashTable
            title="Annual Leave (-1 week to +2 weeks)"
            titleColor="#7c3aed"
            records={alRecords}
            dateField="al_date"
            dateLabel="AL Date"
            highlightFn={(r) => isInRange(r.al_date, 0, 7)}
            highlightBg="rgba(124, 58, 237, 0.08)"
            extraCols={[{ header: 'Duration', field: 'al_duration' }]}
          />
        </div>
      )}
    </div>
  );
}
