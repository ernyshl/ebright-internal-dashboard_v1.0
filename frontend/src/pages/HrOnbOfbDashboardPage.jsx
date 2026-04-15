import { useState } from 'react';
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

function daysFromNow(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const today = new Date(new Date().toDateString());
  return Math.round((d - today) / 86400000);
}

function DaysLabel({ days }) {
  if (days === null) return null;
  if (days === 0) return <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--brand)', background: 'var(--brandLight)', padding: '1px 6px', borderRadius: 4 }}>Today</span>;
  if (days < 0) return <span style={{ fontSize: 10, color: 'var(--muted)' }}>{Math.abs(days)}d ago</span>;
  return <span style={{ fontSize: 10, color: 'var(--muted)' }}>in {days}d</span>;
}

/* ─── Unified Dashboard Card ─── */
function DashCard({ title, subtitle, color, lightColor, records, dateField, mainCount, mainLabel, smallCount, smallLabel, extraField, onViewAll, maxItems }) {
  const displayRecords = records.slice(0, maxItems || 8);
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color, letterSpacing: '0.5px' }}>{title}</div>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{subtitle}</div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {smallCount !== undefined && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{smallCount}</div>
              <div style={{ fontSize: 8, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{smallLabel}</div>
            </div>
          )}
          <div style={{ background: lightColor, borderRadius: 10, padding: '8px 16px', textAlign: 'center', minWidth: 60 }}>
            <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1 }}>{mainCount}</div>
            <div style={{ fontSize: 8, color: 'var(--muted)', marginTop: 3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{mainLabel}</div>
          </div>
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, maxHeight: '200px', overflowY: 'auto', padding: '8px 0' }}>
        {records.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: 13, padding: '20px', textAlign: 'center' }}>No records in this period</div>
        ) : (
          displayRecords.map((r, i) => {
            const within2w = isInRange(r[dateField], 0, 14);
            const days = daysFromNow(r[dateField]);
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '6px 20px',
                background: within2w ? lightColor : 'transparent',
                borderLeft: within2w ? `3px solid ${color}` : '3px solid transparent',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: within2w ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', display: 'flex', gap: 6, marginTop: 1 }}>
                    <span>{r.position || r.department_branch}</span>
                    {r.position && r.department_branch && <span>· {r.department_branch}</span>}
                    {extraField && r[extraField] && <span>· {r[extraField]}</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 500 }}>{fmtDate(r[dateField])}</div>
                  <DaysLabel days={days} />
                </div>
              </div>
            );
          })
        )}
        {records.length > (maxItems || 8) && (
          <div style={{ textAlign: 'center', padding: '8px' }}>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>+{records.length - (maxItems || 8)} more</span>
          </div>
        )}
      </div>

      {/* Footer */}
      {onViewAll && records.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '8px 20px', textAlign: 'center' }}>
          <button onClick={onViewAll} style={{ background: 'none', border: 'none', color, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '4px 12px' }}>
            View All {records.length} Records →
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Detail Table ─── */
function DetailView({ title, color, lightColor, records, dateField, dateLabel, onBack }) {
  return (
    <div>
      <div style={{ background: `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 70%, black))`, color: '#fff', borderRadius: 12, padding: '20px 24px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{title}</div>
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>{records.length} staff · Highlighted = within 2 weeks</div>
        </div>
        <button className="btn btnSmall" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none', backdropFilter: 'blur(4px)' }} onClick={onBack}>← Back</button>
      </div>
      <div className="card" style={{ overflowX: 'auto', padding: 0 }}>
        <table className="dataTable">
          <thead>
            <tr><th>#</th><th>Name</th><th>Position</th><th>Dept / Branch</th><th>{dateLabel}</th><th></th></tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>No records</td></tr>
            ) : records.map((r, i) => {
              const within2w = isInRange(r[dateField], 0, 14);
              const days = daysFromNow(r[dateField]);
              return (
                <tr key={r.id} style={within2w ? { background: lightColor } : {}}>
                  <td style={{ color: 'var(--muted)', fontSize: 11 }}>{i + 1}</td>
                  <td style={{ fontSize: 13 }}>
                    {within2w && <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: color, marginRight: 8 }} />}
                    <strong>{r.name}</strong>
                  </td>
                  <td style={{ fontSize: 12 }}>{r.position}</td>
                  <td style={{ fontSize: 12 }}>{r.department_branch}</td>
                  <td style={{ whiteSpace: 'nowrap', fontSize: 12, fontWeight: within2w ? 600 : 400 }}>{fmtDate(r[dateField])}</td>
                  <td><DaysLabel days={days} /></td>
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
  const [detailView, setDetailView] = useState(null);

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

  const onb2w = onboarding.filter(r => isInRange(r.start_date, 0, 14)).length;
  const ofb2w = offboarding.filter(r => isInRange(r.end_date, 0, 14)).length;

  return (
    <div className="dashboardPage">
      <div className="dashboardHeader">
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16 }}>
          <h1 className="pageHeaderTitle">HR Overview Dashboard</h1>
          <p className="headerSubtitle">Onboarding · Offboarding · MC · Annual Leave</p>
        </div>
      </div>

      {isLoading ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div className="loadingDots"><span /><span /><span /></div>
          <p style={{ marginTop: 12, color: 'var(--muted)' }}>Loading...</p>
        </div>
      ) : detailView === 'onboarding' ? (
        <DetailView
          title="Onboarding"
          color="var(--success)"
          lightColor="var(--successLight)"
          records={onboarding}
          dateField="start_date"
          dateLabel="Start Date"
          onBack={() => setDetailView(null)}
        />
      ) : detailView === 'offboarding' ? (
        <DetailView
          title="Offboarding"
          color="var(--brand)"
          lightColor="var(--brandLight)"
          records={offboarding}
          dateField="end_date"
          dateLabel="End Date"
          onBack={() => setDetailView(null)}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <DashCard
            title="ONBOARDING"
            subtitle="-1 month → +6 months"
            color="var(--success)"
            lightColor="var(--successLight)"
            records={onboarding}
            dateField="start_date"
            mainCount={onb2w}
            mainLabel="+2 Weeks"
            smallCount={onboarding.length}
            smallLabel="+6 Months"
            onViewAll={() => setDetailView('onboarding')}
          />
          <DashCard
            title="OFFBOARDING"
            subtitle="-1 week → +2 months"
            color="var(--brand)"
            lightColor="var(--brandLight)"
            records={offboarding}
            dateField="end_date"
            mainCount={ofb2w}
            mainLabel="+2 Weeks"
            smallCount={offboarding.length}
            smallLabel="+2 Months"
            onViewAll={() => setDetailView('offboarding')}
          />
          <DashCard
            title="MC"
            subtitle="-1 week → today"
            color="var(--warning)"
            lightColor="var(--warningLight)"
            records={mcRecords}
            dateField="mc_date"
            mainCount={mcRecords.length}
            mainLabel="Total"
            extraField="reason"
          />
          <DashCard
            title="ANNUAL LEAVE"
            subtitle="-2 weeks → today"
            color="#7c3aed"
            lightColor="rgba(124, 58, 237, 0.08)"
            records={alRecords}
            dateField="al_date"
            mainCount={alRecords.length}
            mainLabel="Total"
            extraField="al_duration"
          />
        </div>
      )}
    </div>
  );
}
