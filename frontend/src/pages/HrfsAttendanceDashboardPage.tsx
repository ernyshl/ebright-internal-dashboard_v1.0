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

export function HrfsAttendanceDashboardPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['hrfsAttendanceDashboard'],
    queryFn: () => apiFetch('/api/hrfs/attendance-dashboard'),
    staleTime: 2 * 60 * 1000,
  });

  const today = data?.today || { total: 0, on_time: 0, late: 0, no_clock_in: 0, no_clock_out: 0, records: [] };
  const yesterday = data?.yesterday || { total: 0, on_time: 0, late: 0, no_clock_in: 0, no_clock_out: 0, records: [] };

  const [view, setView] = useState('today');

  return (
    <div className="dashboardPage">
      <div className="dashboardHeader">
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16 }}>
          <h1 className="pageHeaderTitle">Attendance Dashboard</h1>
          <p className="headerSubtitle">Clock in after 09:00 = Late</p>
        </div>
        <button className="btn btnGhost btnSmall" onClick={() => refetch()} style={{ marginLeft: 'auto' }}>↺ Refresh</button>
      </div>

      {isLoading ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}><div className="loadingDots"><span /><span /><span /></div></div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="sourcesGrid" style={{ marginBottom: 16 }}>
            <SummaryCard title="Today" icon="📅" color="#3b82f6" summary={today} active={view === 'today'} onClick={() => setView('today')} />
            <SummaryCard title="Yesterday" icon="📆" color="#f59e0b" summary={yesterday} active={view === 'yesterday'} onClick={() => setView('yesterday')} />
          </div>

          {/* Toggle */}
          <div className="ldFilterBar" style={{ marginBottom: 16 }}>
            <button className={`btn ${view === 'today' ? 'btnPrimary' : 'btnGhost'} btnSmall`} onClick={() => setView('today')}>Today ({today.total})</button>
            <button className={`btn ${view === 'yesterday' ? 'btnPrimary' : 'btnGhost'} btnSmall`} onClick={() => setView('yesterday')}>Yesterday ({yesterday.total})</button>
          </div>

          {/* Staff List */}
          <StaffTable
            title={view === 'today' ? 'Today' : 'Yesterday'}
            records={view === 'today' ? today.records : yesterday.records}
            color={view === 'today' ? '#3b82f6' : '#f59e0b'}
          />
        </>
      )}
    </div>
  );
}
