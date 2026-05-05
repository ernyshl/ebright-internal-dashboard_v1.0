import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BackButton } from '../components/BackButton';
import { apiFetch } from '../lib/api';

function SummaryCard({ title, icon, color, summary, active, onClick }) {
  return (
    <div className="sourceCard" style={{ '--source-color': color, cursor: 'pointer', outline: active ? '2px solid ' + color : 'none', outlineOffset: 2 }} onClick={onClick}>
      <div className="sourceCardHeader">
        <span className="sourceCardIcon">{icon}</span>
        <span className="sourceCardName">{title}</span>
      </div>
      <div className="sourceCardTotal">
        <span className="sourceCardTotalValue">{summary.total}</span>
        <span className="sourceCardTotalLabel">Total Staff</span>
      </div>
      <div className="sourceCardStats">
        <div className="sourceStat">
          <span className="sourceStatValue" style={{ color: 'var(--success)' }}>{summary.on_time}</span>
          <span className="sourceStatLabel">On Time</span>
        </div>
        <div className="sourceStat">
          <span className="sourceStatValue" style={{ color: 'var(--brand)' }}>{summary.late}</span>
          <span className="sourceStatLabel">Late</span>
        </div>
        <div className="sourceStat">
          <span className="sourceStatValue" style={{ color: 'var(--muted)' }}>{summary.no_clock_out}</span>
          <span className="sourceStatLabel">No Clock Out</span>
        </div>
      </div>
    </div>
  );
}

function StaffTable({ title, records, color }) {
  return (
    <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontWeight: 600, color, fontSize: 14 }}>
        {title} ({records.length})
      </div>
      <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
        <table className="dataTable">
          <thead>
            <tr>
              <th>#</th>
              <th>Employee</th>
              <th>Clock In</th>
              <th>Clock Out</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>No records</td></tr>
            ) : records.map((r, i) => (
              <tr key={i} style={r.isLate ? { background: 'var(--brandLight)' } : {}}>
                <td style={{ color: 'var(--muted)', fontSize: 11 }}>{i + 1}</td>
                <td>
                  <strong>{r.empName || r.empNo}</strong>
                  {r.empName && <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 6 }}>{r.empNo}</span>}
                </td>
                <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{r.clockIn || '—'}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{r.clockOut || '—'}</td>
                <td>
                  {r.isLate ? (
                    <span style={{ background: 'var(--brandLight)', color: 'var(--brand)', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>Late</span>
                  ) : r.clockIn ? (
                    <span style={{ background: 'var(--successLight)', color: 'var(--success)', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>On Time</span>
                  ) : (
                    <span style={{ color: 'var(--muted)', fontSize: 11 }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExpectedTable({ title, records, color }) {
  return (
    <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontWeight: 600, color, fontSize: 14 }}>
        {title} ({records.length})
      </div>
      <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
        <table className="dataTable">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Position</th>
              <th>Branch</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>Everyone expected today has clocked in</td></tr>
            ) : records.map((r, i) => (
              <tr key={i}>
                <td style={{ color: 'var(--muted)', fontSize: 11 }}>{i + 1}</td>
                <td><strong>{r.name}</strong></td>
                <td style={{ fontSize: 12, color: 'var(--muted)' }}>{r.position || '—'}</td>
                <td style={{ fontSize: 12 }}>{r.branch || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Branch codes that are merged behind a single "HQ" filter button. Mirrors the
// list in backend/src/routes/hrfs.js HQ_BRANCHES (includes ACD/FNC short codes).
const HQ_BRANCH_CODES = ['HQ', 'HR', 'OD', 'MKT', 'FNC', 'FINANCE', 'ACD', 'ACADEMY', 'OPERATION'];

export function HrfsAttendanceDashboardPage() {
  const [branch, setBranch] = useState<string>('all');
  const [view, setView]     = useState<'today' | 'yesterday' | 'last_sat' | 'last_sun'>('today');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['hrfsAttendanceDashboard', branch],
    queryFn: () => apiFetch(`/api/hrfs/attendance-dashboard?branch=${encodeURIComponent(branch)}`),
    staleTime: 2 * 60 * 1000,
  });

  const emptyDay = { total: 0, on_time: 0, late: 0, no_clock_in: 0, no_clock_out: 0, records: [], not_clocked_in_yet: [] };
  const today = data?.today || emptyDay;
  const yesterday = data?.yesterday || emptyDay;
  const lastSat = data?.last_sat || emptyDay;
  const lastSun = data?.last_sun || emptyDay;

  // Split known branches: HQ-types collapse into one "HQ" button; everything
  // else gets its own button, alphabetised.
  const allBranches: string[] = data?.branches || [];
  const operationalBranches = allBranches
    .filter(b => !HQ_BRANCH_CODES.includes(b.toUpperCase()))
    .sort();
  const hasHqBranches = allBranches.some(b => HQ_BRANCH_CODES.includes(b.toUpperCase()));

  // Clocked-in list is just the records from AttendanceLog with a clockIn time.
  const clockedIn = (records: any[]) => {
    const list = records.filter(r => r.clockIn);
    list.sort((a, b) => String(b.clockIn).localeCompare(String(a.clockIn)));
    return list;
  };

  return (
    <div className="dashboardPage">
      <div className="dashboardHeader">
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16 }}>
          <h1 className="pageHeaderTitle">Attendance Dashboard</h1>
          <p className="headerSubtitle">Clock in at 09:01 or later = Late</p>
        </div>
        <button className="btn btnGhost btnSmall" onClick={() => refetch()} style={{ marginLeft: 'auto' }}>↺ Refresh</button>
      </div>

      {/* Branch filter row */}
      <div className="ldFilterBar" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
        <button className={`btn ${branch === 'all' ? 'btnPrimary' : 'btnGhost'} btnSmall`} onClick={() => setBranch('all')}>All</button>
        {hasHqBranches && (
          <button className={`btn ${branch === 'HQ' ? 'btnPrimary' : 'btnGhost'} btnSmall`} onClick={() => setBranch('HQ')}>HQ</button>
        )}
        {operationalBranches.map(b => (
          <button key={b} className={`btn ${branch === b ? 'btnPrimary' : 'btnGhost'} btnSmall`} onClick={() => setBranch(b)}>{b}</button>
        ))}
      </div>

      {isLoading ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}><div className="loadingDots"><span /><span /><span /></div></div>
      ) : (
        <>
          {/* Summary Cards — centered, two-up */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 16,
            flexWrap: 'wrap',
            marginBottom: 16,
          }}>
            <div style={{ flex: '0 1 360px', minWidth: 280, maxWidth: 420 }}>
              <SummaryCard title="Today" icon="📅" color="#3b82f6" summary={today} active={view === 'today'} onClick={() => setView('today')} />
            </div>
            <div style={{ flex: '0 1 360px', minWidth: 280, maxWidth: 420 }}>
              <SummaryCard title="Yesterday" icon="📆" color="#f59e0b" summary={yesterday} active={view === 'yesterday'} onClick={() => setView('yesterday')} />
            </div>
          </div>

          {/* Day toggle */}
          <div className="ldFilterBar" style={{ marginBottom: 16 }}>
            <button className={`btn ${view === 'today' ? 'btnPrimary' : 'btnGhost'} btnSmall`} onClick={() => setView('today')}>Today ({today.total})</button>
            <button className={`btn ${view === 'yesterday' ? 'btnPrimary' : 'btnGhost'} btnSmall`} onClick={() => setView('yesterday')}>Yesterday ({yesterday.total})</button>
            <button className={`btn ${view === 'last_sat' ? 'btnPrimary' : 'btnGhost'} btnSmall`} onClick={() => setView('last_sat')}>Last Sat ({lastSat.total})</button>
            <button className={`btn ${view === 'last_sun' ? 'btnPrimary' : 'btnGhost'} btnSmall`} onClick={() => setView('last_sun')}>Last Sun ({lastSun.total})</button>
          </div>

          {/* Staff lists — clocked-in (latest first) | expected today, no clock-in */}
          {(() => {
            const dayMap = { today, yesterday, last_sat: lastSat, last_sun: lastSun };
            const colorMap = { today: '#3b82f6', yesterday: '#f59e0b', last_sat: '#8b5cf6', last_sun: '#ec4899' };
            const day = dayMap[view];
            const dayColor = colorMap[view];
            return (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <StaffTable title="Clocked In · latest → earliest" records={clockedIn(day.records)} color={dayColor} />
                <ExpectedTable title="Not Clocked In Yet" records={day.not_clocked_in_yet || []} color="var(--muted)" />
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
