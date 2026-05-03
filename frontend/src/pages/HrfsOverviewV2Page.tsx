import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BackButton } from '../components/BackButton';
import { apiFetch } from '../lib/api';

// ─── tiny formatting helpers ────────────────────────────────────────────────
function fmtDate(d: any) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function daysFromNow(dateStr: any) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const today = new Date(new Date().toDateString());
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function DaysLabel({ days }: { days: number | null }) {
  if (days === null) return null;
  if (days === 0)
    return (
      <span style={{
        fontSize: 10, fontWeight: 700, color: 'var(--brand)',
        background: 'var(--brandLight)', padding: '2px 8px', borderRadius: 999,
      }}>Today</span>
    );
  if (days < 0)
    return <span style={{ fontSize: 10, color: 'var(--muted)' }}>{Math.abs(days)}d ago</span>;
  return <span style={{ fontSize: 10, color: 'var(--muted)' }}>in {days}d</span>;
}

const STATUS_META: Record<string, { label: string; bg: string; color: string }> = {
  A: { label: 'Approved',  bg: 'var(--successLight)', color: 'var(--success)' },
  N: { label: 'Pending',   bg: 'var(--warningLight)', color: 'var(--warning)' },
  R: { label: 'Rejected',  bg: 'var(--brandLight)',   color: 'var(--brand)' },
  C: { label: 'Cancelled', bg: 'var(--bg2)',          color: 'var(--muted)' },
};

function StatusBadge({ status }: { status?: string }) {
  if (!status) return null;
  const m = STATUS_META[status];
  if (!m) return <span style={{ fontSize: 10, color: 'var(--muted)' }}>{status}</span>;
  return (
    <span style={{
      background: m.bg, color: m.color, borderRadius: 999, padding: '2px 8px',
      fontSize: 10, fontWeight: 700, letterSpacing: '0.2px',
    }}>{m.label}</span>
  );
}

// ─── unified card used for the 4 buckets ─────────────────────────────────────
type CardConfig = {
  title: string;
  subtitle: string;
  color: string;
  lightColor: string;
  records: any[];
  rowKey: 'staff' | 'leave';
  onViewAll: () => void;
};

function DashCard({ title, subtitle, color, lightColor, records, rowKey, onViewAll }: CardConfig) {
  const display = records.slice(0, 8);
  return (
    <div className="card" style={{
      padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column',
      border: '1px solid var(--border)', borderRadius: 12,
      transition: 'box-shadow 150ms ease, transform 150ms ease',
    }}
    onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
    onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
    >
      {/* Header */}
      <div style={{
        padding: '14px 20px', borderBottom: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color, letterSpacing: '0.4px' }}>
            {title}
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
            {subtitle}
          </div>
        </div>
        <div style={{
          background: lightColor, borderRadius: 12, padding: '8px 18px', textAlign: 'center', minWidth: 64,
        }}>
          <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1 }}>{records.length}</div>
          <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
            Total
          </div>
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, maxHeight: 220, overflowY: 'auto', padding: '6px 0' }}>
        {records.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: 13, padding: '24px 20px', textAlign: 'center' }}>
            No records in this period
          </div>
        ) : (
          display.map((r: any, i: number) => (
            <Row key={r.id || i} rowKey={rowKey} record={r} accentColor={color} />
          ))
        )}
        {records.length > 8 && (
          <div style={{ textAlign: 'center', padding: '6px' }}>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>+{records.length - 8} more</span>
          </div>
        )}
      </div>

      {/* Footer / View All */}
      {records.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', textAlign: 'center', padding: '6px 20px' }}>
          <button onClick={onViewAll} style={{
            background: 'none', border: 'none', color, fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '6px 12px',
          }}>
            View All {records.length} Records →
          </button>
        </div>
      )}
    </div>
  );
}

function Row({ rowKey, record: r, accentColor }: { rowKey: 'staff' | 'leave'; record: any; accentColor: string }) {
  if (rowKey === 'staff') {
    const dateField = r.createdAt || r.updatedAt;
    const days = daysFromNow(dateField);
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 20px', borderLeft: '3px solid transparent' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {r.name || '—'}
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>
            {r.position || 'No position'} {r.branch ? `· ${r.branch}` : ''} {r.employeeId ? `· ${r.employeeId}` : ''}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 500 }}>{fmtDate(dateField)}</div>
          <DaysLabel days={days} />
        </div>
      </div>
    );
  }
  // Leave row
  const days = daysFromNow(r.LeaveDate);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 20px', borderLeft: '3px solid transparent' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {r.employee_name || r.EmployeeCode || '—'}
        </div>
        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1, display: 'flex', gap: 6, alignItems: 'center' }}>
          <span>{r.EmployeeCode}</span>
          {r.Days != null && <span>· {r.Days}d</span>}
          <StatusBadge status={r.ApplyStatus} />
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 500 }}>{fmtDate(r.LeaveDate)}</div>
        <DaysLabel days={days} />
      </div>
    </div>
  );
}

// ─── detail tables ───────────────────────────────────────────────────────────
function StaffDetail({ title, color, lightColor, records, dateField, dateLabel, onBack }: any) {
  return (
    <div>
      <div style={{
        background: `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 70%, black))`,
        color: '#fff', borderRadius: 12, padding: '20px 24px', marginBottom: 16,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{title}</div>
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>{records.length} record{records.length === 1 ? '' : 's'}</div>
        </div>
        <button className="btn btnSmall" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none' }} onClick={onBack}>← Back</button>
      </div>
      <div className="card" style={{ overflowX: 'auto', padding: 0 }}>
        <table className="dataTable">
          <thead>
            <tr><th>#</th><th>Name</th><th>Position</th><th>Branch</th><th>Employee ID</th><th>{dateLabel}</th></tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>No records</td></tr>
            ) : records.map((r: any, i: number) => (
              <tr key={r.id || i}>
                <td style={{ color: 'var(--muted)', fontSize: 11 }}>{i + 1}</td>
                <td><strong>{r.name || '—'}</strong></td>
                <td style={{ fontSize: 12 }}>{r.position || '—'}</td>
                <td style={{ fontSize: 12 }}>{r.branch || '—'}</td>
                <td style={{ fontSize: 12, fontFamily: 'monospace' }}>{r.employeeId || '—'}</td>
                <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDate(r[dateField])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LeaveDetail({ title, color, records, onBack }: any) {
  return (
    <div>
      <div style={{
        background: `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 70%, black))`,
        color: '#fff', borderRadius: 12, padding: '20px 24px', marginBottom: 16,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{title}</div>
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>{records.length} record{records.length === 1 ? '' : 's'}</div>
        </div>
        <button className="btn btnSmall" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none' }} onClick={onBack}>← Back</button>
      </div>
      <div className="card" style={{ overflowX: 'auto', padding: 0 }}>
        <table className="dataTable">
          <thead>
            <tr><th>#</th><th>Employee</th><th>Code</th><th>Type</th><th>Apply Date</th><th>Leave Date</th><th>Days</th><th>Status</th><th>Reason</th></tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>No records</td></tr>
            ) : records.map((r: any, i: number) => (
              <tr key={r.id || i}>
                <td style={{ color: 'var(--muted)', fontSize: 11 }}>{i + 1}</td>
                <td><strong>{r.employee_name || '—'}</strong></td>
                <td style={{ fontSize: 12, fontFamily: 'monospace' }}>{r.EmployeeCode || '—'}</td>
                <td style={{ fontSize: 12 }}>{r.LeaveTypeCode || '—'}</td>
                <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDate(r.ApplyDate)}</td>
                <td style={{ whiteSpace: 'nowrap', fontSize: 12, fontWeight: 600 }}>{fmtDate(r.LeaveDate)}</td>
                <td style={{ fontSize: 12 }}>{r.Days ?? r.DayNo ?? '—'}</td>
                <td><StatusBadge status={r.ApplyStatus} /></td>
                <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: 'var(--muted)' }}>
                  {r.ApplyReason || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── main page ──────────────────────────────────────────────────────────────
export function HrfsOverviewV2Page() {
  const [detail, setDetail] = useState<null | 'new_hires' | 'offboarded' | 'mc' | 'annual_leave'>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['hrfsOverviewV2'],
    queryFn: () => apiFetch('/api/hrfs/overview-v2'),
    staleTime: 2 * 60 * 1000,
  });

  const newHires    = data?.new_hires    || [];
  const offboarded  = data?.offboarded   || [];
  const mc          = data?.mc           || [];
  const annualLeave = data?.annual_leave || [];

  return (
    <div className="dashboardPage">
      <div className="dashboardHeader">
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16 }}>
          <h1 className="pageHeaderTitle">Overview v2</h1>
          <p className="headerSubtitle">Live HRFS data · BranchStaff + Leave Transactions</p>
        </div>
        <button className="btn btnGhost btnSmall" onClick={() => refetch()} style={{ marginLeft: 'auto' }}>
          {isFetching ? '↻ …' : '↺ Refresh'}
        </button>
      </div>

      {isLoading ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div className="loadingDots"><span /><span /><span /></div>
        </div>
      ) : detail === 'new_hires' ? (
        <StaffDetail title="New Hires" color="var(--success)" lightColor="var(--successLight)" records={newHires} dateField="createdAt" dateLabel="Hired On" onBack={() => setDetail(null)} />
      ) : detail === 'offboarded' ? (
        <StaffDetail title="Offboarded" color="var(--brand)"   lightColor="var(--brandLight)"   records={offboarded} dateField="updatedAt" dateLabel="Last Update" onBack={() => setDetail(null)} />
      ) : detail === 'mc' ? (
        <LeaveDetail title="Sick Leave (MC)" color="var(--warning)" records={mc} onBack={() => setDetail(null)} />
      ) : detail === 'annual_leave' ? (
        <LeaveDetail title="Annual Leave" color="#7c3aed" records={annualLeave} onBack={() => setDetail(null)} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
          <DashCard
            title="NEW HIRES"
            subtitle="Active · added in last 30 days"
            color="var(--success)"
            lightColor="var(--successLight)"
            records={newHires}
            rowKey="staff"
            onViewAll={() => setDetail('new_hires')}
          />
          <DashCard
            title="OFFBOARDED"
            subtitle="Inactive · updated in last 30 days"
            color="var(--brand)"
            lightColor="var(--brandLight)"
            records={offboarded}
            rowKey="staff"
            onViewAll={() => setDetail('offboarded')}
          />
          <DashCard
            title="SICK LEAVE (MC)"
            subtitle="-1 week → today"
            color="var(--warning)"
            lightColor="var(--warningLight)"
            records={mc}
            rowKey="leave"
            onViewAll={() => setDetail('mc')}
          />
          <DashCard
            title="ANNUAL LEAVE"
            subtitle="today → +2 weeks"
            color="#7c3aed"
            lightColor="rgba(124, 58, 237, 0.10)"
            records={annualLeave}
            rowKey="leave"
            onViewAll={() => setDetail('annual_leave')}
          />
        </div>
      )}
    </div>
  );
}
