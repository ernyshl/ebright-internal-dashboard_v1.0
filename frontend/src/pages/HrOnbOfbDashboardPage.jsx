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

function isToday(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr).toDateString();
  return d === new Date().toDateString();
}

/* ─── Summary Card (Onboarding / Offboarding) ─── */
function SummaryCard({ title, subtitle, color, lightColor, todayCount, twoWeekCount, totalCount, twoWeekLabel, totalLabel, onClick }) {
  return (
    <div className="card" onClick={onClick} style={{ cursor: 'pointer', padding: 0, overflow: 'hidden', transition: 'transform 0.15s', border: '1px solid var(--border)' }}
      onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
      onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontWeight: 700, fontSize: 16, color }}>{title}</div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{subtitle}</div>
      </div>
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <div style={{ fontSize: 48, fontWeight: 800, color, lineHeight: 1 }}>{todayCount}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6, fontWeight: 600, textTransform: 'uppercase' }}>Today</div>
      </div>
      <div style={{ display: 'flex', borderTop: '1px solid var(--border)' }}>
        <div style={{ flex: 1, padding: '12px 16px', textAlign: 'center', background: lightColor }}>
          <div style={{ fontSize: 22, fontWeight: 700, color }}>{twoWeekCount}</div>
          <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>{twoWeekLabel}</div>
        </div>
        <div style={{ flex: 1, padding: '12px 16px', textAlign: 'center', borderLeft: '1px solid var(--border)' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{totalCount}</div>
          <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>{totalLabel}</div>
        </div>
      </div>
    </div>
  );
}

/* ─── Inline Card (MC / Annual Leave) ─── */
function InlineCard({ title, subtitle, color, lightColor, records, dateField, nameField, extraField }) {
  const todayRecords = records.filter(r => isToday(r[dateField]));
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--border)' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontWeight: 700, fontSize: 16, color }}>{title}</div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{subtitle}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', padding: '16px 20px', gap: 20 }}>
        <div style={{ background: lightColor, borderRadius: 10, padding: '14px 20px', textAlign: 'center', minWidth: 80 }}>
          <div style={{ fontSize: 36, fontWeight: 800, color, lineHeight: 1 }}>{todayRecords.length}</div>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4, fontWeight: 600, textTransform: 'uppercase' }}>Today</div>
        </div>
        <div style={{ flex: 1 }}>
          {todayRecords.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 13, padding: '10px 0' }}>No {title.toLowerCase()} for today</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {todayRecords.map((r, i) => (
                <div key={i} style={{ fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                  <strong>{r.name}</strong>
                  <span style={{ color: 'var(--muted)', fontSize: 11 }}>{r.department_branch}</span>
                  {extraField && <span style={{ color: 'var(--muted)', fontSize: 11 }}>— {r[extraField]}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Detail Table (full view when card is clicked) ─── */
function DetailView({ title, color, lightColor, records, dateField, dateLabel, onBack }) {
  return (
    <div>
      <div style={{ background: color, color: '#fff', borderRadius: 10, padding: '16px 24px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{title} ({records.length})</div>
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>Green = within 2 weeks</div>
        </div>
        <button className="btn btnSmall" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none' }} onClick={onBack}>← Back</button>
      </div>
      <div className="card" style={{ overflowX: 'auto', padding: 0 }}>
        <table className="dataTable">
          <thead>
            <tr><th>#</th><th>Name</th><th>Position</th><th>Dept / Branch</th><th>{dateLabel}</th></tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>No records</td></tr>
            ) : records.map((r, i) => {
              const within2w = isInRange(r[dateField], 0, 14);
              return (
                <tr key={r.id} style={within2w ? { background: lightColor } : {}}>
                  <td style={{ color: 'var(--muted)', fontSize: 11 }}>{i + 1}</td>
                  <td style={{ fontSize: 13 }}>
                    {within2w && <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: 'var(--success)', marginRight: 8 }} />}
                    <strong>{r.name}</strong>
                  </td>
                  <td style={{ fontSize: 12 }}>{r.position}</td>
                  <td style={{ fontSize: 12 }}>{r.department_branch}</td>
                  <td style={{ whiteSpace: 'nowrap', fontSize: 12, fontWeight: within2w ? 600 : 400 }}>{fmtDate(r[dateField])}</td>
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
  const [detailView, setDetailView] = useState(null); // 'onboarding' | 'offboarding' | null

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

  // Counts
  const onbToday = onboarding.filter(r => isToday(r.start_date)).length;
  const onb2w = onboarding.filter(r => isInRange(r.start_date, 0, 14)).length;
  const ofbToday = offboarding.filter(r => isToday(r.end_date)).length;
  const ofb2w = offboarding.filter(r => isInRange(r.end_date, 0, 14)).length;

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
      ) : detailView === 'onboarding' ? (
        <DetailView
          title="Onboarding (today to +6 months)"
          color="var(--success)"
          lightColor="var(--successLight)"
          records={onboarding}
          dateField="start_date"
          dateLabel="Start Date"
          onBack={() => setDetailView(null)}
        />
      ) : detailView === 'offboarding' ? (
        <DetailView
          title="Offboarding (today to +1 month)"
          color="var(--brand)"
          lightColor="var(--brandLight)"
          records={offboarding}
          dateField="end_date"
          dateLabel="End Date"
          onBack={() => setDetailView(null)}
        />
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <SummaryCard
              title="ONBOARDING"
              subtitle="Today → +6 months"
              color="var(--success)"
              lightColor="var(--successLight)"
              todayCount={onbToday}
              twoWeekCount={onb2w}
              totalCount={onboarding.length}
              twoWeekLabel="+2 Weeks"
              totalLabel="+6 Months"
              onClick={() => setDetailView('onboarding')}
            />
            <SummaryCard
              title="OFFBOARDING"
              subtitle="Today → +1 month"
              color="var(--brand)"
              lightColor="var(--brandLight)"
              todayCount={ofbToday}
              twoWeekCount={ofb2w}
              totalCount={offboarding.length}
              twoWeekLabel="+2 Weeks"
              totalLabel="+1 Month"
              onClick={() => setDetailView('offboarding')}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <InlineCard
              title="MC"
              subtitle="Today"
              color="var(--warning)"
              lightColor="var(--warningLight)"
              records={mcRecords}
              dateField="mc_date"
              nameField="name"
              extraField="reason"
            />
            <InlineCard
              title="ANNUAL LEAVE"
              subtitle="Today"
              color="#7c3aed"
              lightColor="rgba(124, 58, 237, 0.08)"
              records={alRecords}
              dateField="al_date"
              nameField="name"
              extraField="al_duration"
            />
          </div>
        </>
      )}
    </div>
  );
}
