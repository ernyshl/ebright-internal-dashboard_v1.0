import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BackButton } from '../components/BackButton';
import { apiFetch } from '../lib/api';

type Preset = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'custom';

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'today',      label: 'Today' },
  { value: 'yesterday',  label: 'Yesterday' },
  { value: 'this_week',  label: 'This Week' },
  { value: 'last_week',  label: 'Last Week' },
  { value: 'custom',     label: 'Custom' },
];

function fmt(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getPresetRange(preset: Preset) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = today.getDay(); // 0=Sun
  const daysToMonday = dow === 0 ? -6 : 1 - dow;

  switch (preset) {
    case 'today':
      return { startDate: fmt(today), endDate: fmt(today) };
    case 'yesterday': {
      const d = new Date(today); d.setDate(d.getDate() - 1);
      return { startDate: fmt(d), endDate: fmt(d) };
    }
    case 'this_week': {
      const mon = new Date(today); mon.setDate(today.getDate() + daysToMonday);
      return { startDate: fmt(mon), endDate: fmt(today) };
    }
    case 'last_week': {
      const thisMon = new Date(today); thisMon.setDate(today.getDate() + daysToMonday);
      const lastMon = new Date(thisMon); lastMon.setDate(thisMon.getDate() - 7);
      const lastSun = new Date(thisMon); lastSun.setDate(thisMon.getDate() - 1);
      return { startDate: fmt(lastMon), endDate: fmt(lastSun) };
    }
    default:
      return { startDate: '', endDate: '' };
  }
}

function GradientCard({ title, icon, gradient, value, label, onClick }: {
  title: string; icon: string; gradient: string; value: number | string; label: string; onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
      style={{
        background: gradient,
        color: '#fff',
        borderRadius: 16,
        padding: 22,
        cursor: onClick ? 'pointer' : 'default',
        boxShadow: '0 10px 28px rgba(15, 23, 42, 0.18)',
        transition: 'transform 0.18s ease, box-shadow 0.18s ease',
        position: 'relative',
        overflow: 'hidden',
        minHeight: 140,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-4px)';
        e.currentTarget.style.boxShadow = '0 18px 38px rgba(15, 23, 42, 0.26)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 10px 28px rgba(15, 23, 42, 0.18)';
      }}
    >
      {/* decorative blob */}
      <div style={{
        position: 'absolute', top: -40, right: -40, width: 140, height: 140,
        background: 'rgba(255,255,255,0.12)', borderRadius: '50%', pointerEvents: 'none',
      }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, position: 'relative' }}>
        <span style={{ fontSize: 30, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.25))' }}>{icon}</span>
        <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase', opacity: 0.95 }}>{title}</span>
      </div>
      <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1, position: 'relative', textShadow: '0 2px 6px rgba(0,0,0,0.18)' }}>{value}</div>
      <div style={{ fontSize: 12, opacity: 0.92, marginTop: 8, position: 'relative' }}>{label}</div>
      {onClick && (
        <div style={{ position: 'absolute', bottom: 14, right: 16, fontSize: 11, fontWeight: 700, opacity: 0.9, letterSpacing: 0.3 }}>
          VIEW LIST →
        </div>
      )}
    </div>
  );
}

function StaffModal({ staff, onClose }: { staff: any[]; onClose: () => void }) {
  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <div className="modalTitle">ST Staff — Thumb Registration ({staff.length})</div>
          <button className="modalClose" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div style={{ padding: 0, maxHeight: '70vh', overflowY: 'auto' }}>
          <table className="dataTable">
            <thead>
              <tr>
                <th>Name</th>
                <th>Employee ID</th>
                <th style={{ textAlign: 'center' }}>Thumb Registered</th>
              </tr>
            </thead>
            <tbody>
              {staff.length === 0 ? (
                <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>No staff</td></tr>
              ) : staff.map((s) => (
                <tr key={s.id}>
                  <td><strong>{s.name}</strong></td>
                  <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{s.employeeId}</td>
                  <td style={{ textAlign: 'center' }}>
                    {s.thumbRegistered ? (
                      <span style={{ background: 'var(--successLight)', color: 'var(--success)', borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        ✅ Registered
                      </span>
                    ) : (
                      <span style={{ background: 'var(--brandLight)', color: 'var(--brand)', borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        ✗ Not Registered
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function StAttendancePage() {
  const [preset, setPreset] = useState<Preset>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [showStaffModal, setShowStaffModal] = useState(false);

  const range = preset === 'custom'
    ? { startDate: customFrom, endDate: customTo }
    : getPresetRange(preset);
  const hasRange = !!(range.startDate && range.endDate);

  // Polling cadence is tied to the stSync interval (30s) — refetching at 15s
  // means a fresh scan shows up on the dashboard within at most ~45s end to
  // end (one stSync tick + one frontend tick). staleTime is dropped to 10s so
  // the interval-triggered refetches actually fire instead of being short-
  // circuited by the cache. refetchOnWindowFocus catches the case where the
  // user comes back to the tab after a while and wants instant freshness.
  const { data: attendanceData, isLoading: isLoadingAttendance, isError: isAttendanceError, refetch } = useQuery({
    queryKey: ['stAttendance', range.startDate, range.endDate],
    queryFn: () => apiFetch(`/api/st-attendance?startDate=${range.startDate}&endDate=${range.endDate}`),
    enabled: hasRange,
    staleTime: 10 * 1000,
    refetchInterval: 15 * 1000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });

  const { data: staffData, isLoading: isLoadingStaff } = useQuery({
    queryKey: ['stStaff'],
    queryFn: () => apiFetch('/api/st-staff'),
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const records = attendanceData?.records || [];
  const staff = staffData?.records || [];

  const totalStaff = staff.length;
  const totalScans = records.length;
  const totalClockedIn = records.filter((r: any) => r.clockInTime).length;
  const totalClockedOut = records.filter((r: any) => r.clockOutTime).length;


  const fmtTime = (d: any) => (d ? String(d).slice(0, 5) : '—');
  const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const isLoading = isLoadingAttendance || isLoadingStaff;

  const rangeLabel = hasRange
    ? (range.startDate === range.endDate ? range.startDate : `${range.startDate} → ${range.endDate}`)
    : 'Pick a date range';

  return (
    <div className="dashboardPage">
      <div className="dashboardHeader">
        <BackButton to="/" label="Back to Home" />
        <div style={{ marginTop: 16 }}>
          <h1 className="pageHeaderTitle">ST Branch Attendance</h1>
          <p className="headerSubtitle">{totalScans} scans · {rangeLabel}</p>
        </div>
        <button className="btn btnGhost btnSmall" onClick={() => refetch()} style={{ marginLeft: 'auto' }}>↺ Refresh</button>
      </div>

      {/* Pill date-range selector */}
      <div className="ldFilterBar" style={{ marginBottom: preset === 'custom' ? 12 : 16, flexWrap: 'wrap' }}>
        {PRESETS.map(p => (
          <button
            key={p.value}
            className={`btn ${preset === p.value ? 'btnPrimary' : 'btnGhost'} btnSmall`}
            onClick={() => setPreset(p.value)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {preset === 'custom' && (
        <div className="brRankFilters" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div className="brRankFilterGroup">
            <label className="brRankLabel">From</label>
            <input type="date" className="filterInput" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          </div>
          <div className="brRankFilterGroup">
            <label className="brRankLabel">To</label>
            <input type="date" className="filterInput" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </div>
          {(customFrom || customTo) && (
            <div className="brRankFilterGroup" style={{ alignSelf: 'flex-end' }}>
              <button className="btn btnGhost btnSmall" onClick={() => { setCustomFrom(''); setCustomTo(''); }}>Clear</button>
            </div>
          )}
        </div>
      )}

      {/* Gradient summary cards */}
      <div className="sourcesGrid" style={{ marginBottom: 20 }}>
        <GradientCard
          title="Total ST Staff"
          icon="👥"
          gradient="linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)"
          value={totalStaff}
          label="Click to view staff list"
          onClick={() => setShowStaffModal(true)}
        />
        <GradientCard
          title="Total Scans"
          icon="📋"
          gradient="linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)"
          value={totalScans}
          label={preset === 'today' ? 'Scans today' : `Scans in range`}
        />
        <GradientCard
          title="Clocked In"
          icon="🟢"
          gradient="linear-gradient(135deg, #10b981 0%, #059669 100%)"
          value={totalClockedIn}
          label="With clock-in"
        />
        <GradientCard
          title="Clocked Out"
          icon="🔴"
          gradient="linear-gradient(135deg, #f97316 0%, #dc2626 100%)"
          value={totalClockedOut}
          label="With clock-out"
        />
      </div>

      {!hasRange ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
          Pick a date range (From / To) to view scans.
        </div>
      ) : isLoading ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div className="loadingDots"><span /><span /><span /></div>
        </div>
      ) : isAttendanceError ? (
        <div className="errorText">Failed to load data.</div>
      ) : (
        <div className="card" style={{ overflowX: 'auto', padding: 0 }}>
          <table className="dataTable">
            <thead>
              <tr>
                <th>#</th>
                <th>Date</th>
                <th>Employee Name</th>
                <th>Employee No</th>
                <th>Clock In Time</th>
                <th>Clock Out Time</th>
                <th>Clock In Serial No</th>
                <th>Clock Out Serial No</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>No scans for {rangeLabel}</td></tr>
              ) : records.map((r: any, i: number) => {
                const clockedOut = !!r.clockOutTime;
                return (
                  <tr key={r.id}>
                    <td style={{ color: 'var(--muted)', fontSize: 11 }}>{i + 1}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.date)}</td>
                    <td><strong>{r.fullname || r.empName || '—'}</strong></td>
                    <td>{r.empNo || '—'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 13, whiteSpace: 'nowrap' }}>
                      <span style={{ marginRight: 6, opacity: 0.75 }}>🕒</span>
                      {fmtTime(r.clockInTime)}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 13, whiteSpace: 'nowrap' }}>
                      {clockedOut ? (
                        <>
                          {fmtTime(r.clockOutTime)}
                          <span style={{
                            marginLeft: 8, background: 'var(--successLight)', color: 'var(--success)',
                            borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 700,
                            fontFamily: 'inherit',
                          }}>✓ Out</span>
                        </>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', color: '#c2410c', fontFamily: 'inherit', fontSize: 12, fontWeight: 700 }}>
                          <span className="stAttDotPulse" />Still In
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: 12 }}>{r.clockInSerialNo || '—'}</td>
                    <td style={{ fontSize: 12 }}>{r.clockOutSerialNo || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showStaffModal && <StaffModal staff={staff} onClose={() => setShowStaffModal(false)} />}
    </div>
  );
}
