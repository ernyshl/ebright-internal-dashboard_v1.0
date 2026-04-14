import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePermissions, canAccess, getAccessibleDashboards } from '../lib/permissions';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

const DAYS = ['wed', 'thu', 'fri', 'sat', 'sun'];

function calcOkrMetrics(r) {
  if (!r) return null;
  const totalAttended = DAYS.reduce((s, d) => s + (parseFloat(r[`${d}_attended`]) || 0), 0);
  const totalAbsent = DAYS.reduce((s, d) => s + (parseFloat(r[`${d}_absent`]) || 0), 0);
  const totalFrozen = DAYS.reduce((s, d) => s + (parseFloat(r[`${d}_frozen`]) || 0), 0);
  const totalReplaced = DAYS.reduce((s, d) => s + (parseFloat(r[`${d}_replaced`]) || 0), 0);
  const totalAttendance = totalAttended + totalFrozen + totalReplaced;
  const attendanceRate = (totalAttended + totalAbsent) > 0
    ? (totalAttended / (totalAttended + totalAbsent)) * 100 : 0;
  const attendanceRateWithFreeze = (totalAttended + totalFrozen + totalAbsent) > 0
    ? ((totalAttended + totalFrozen) / (totalAttended + totalFrozen + totalAbsent)) * 100 : 0;
  return { totalAttendance, attendanceRate, attendanceRateWithFreeze };
}

export function DashboardHomePage() {
  const navigate = useNavigate();
  const { permissions, dashboards, isLoading } = usePermissions();
  const [okrBranch, setOkrBranch] = useState('');
  const [okrWeek, setOkrWeek] = useState('');

  // Fetch recent events for dashboard overview
  const { data: eventsData } = useQuery({
    queryKey: ['events'],
    queryFn: () => apiFetch('/api/events'),
  });

  // OKR: branches list
  const { data: branchesData } = useQuery({
    queryKey: ['okr-branches'],
    queryFn: () => apiFetch('/api/okr-attendance/branches'),
  });
  const okrBranches = branchesData?.branches ?? [];

  // OKR: latest record for selected branch
  const { data: okrData } = useQuery({
    queryKey: ['okr-home', okrBranch, okrWeek],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '1' });
      if (okrBranch) params.set('branch', okrBranch);
      if (okrWeek) params.set('week_date', okrWeek);
      return apiFetch(`/api/okr-attendance?${params}`);
    },
    enabled: !!okrBranch,
  });
  const okrRecord = okrData?.records?.[0] ?? null;
  const okrMetrics = useMemo(() => calcOkrMetrics(okrRecord), [okrRecord]);

  const visibleDashboards = getAccessibleDashboards(permissions, dashboards);

  // Google Analytics report URLs
  const gaReports = [
    {
      label: '📊 Organic Leads',
      url: 'https://analytics.google.com/analytics/web/?authuser=3#/analysis/a374453486p512266664/edit/lrRZTnaTTJOgtAqkM8uTKQ'
    },
    {
      label: '📈 Paid Campaign Performance',
      url: 'https://analytics.google.com/analytics/web/?authuser=3#/analysis/a374453486p512266664/edit/P0KMghcdQV2gTzEYdrR97g'
    }
  ];

  const departmentData = [
    {
      id: 'academy',
      name: 'Academy',
      icon: '🎓',
      color: '#8b5cf6',
      links: [
        { label: 'Academy Dashboard', path: '/academy-dashboard', dashboard: 'academy' },
        { label: '🎓 FA Dashboard', path: '/fa-dashboard', dashboard: 'academy' }
      ]
    },
    {
      id: 'event_mkt',
      name: 'Event Marketing',
      icon: '🎪',
      color: '#f43f5e',
      links: [
        { label: 'Event Dashboard', path: '/events', dashboard: 'events' },
        { label: 'Event MKT Dashboard', path: '/event-mkt-dashboard', dashboard: 'events' },
      ]
    },
    {
      id: 'finance',
      name: 'Finance',
      icon: '💰',
      color: '#10b981',
      links: [
        { label: 'Finance Dashboard', path: '/finance', dashboard: 'finance' },
        { label: 'Branch Ranking', path: '/branch-ranking', dashboard: 'finance' }
      ]
    },
    {
      id: 'operations',
      name: 'Optimisation',
      icon: '⚙️',
      color: '#3b82f6',
      links: [
        { label: 'GHL Dashboard', path: '/dashboard', dashboard: 'operations' },
        { label: 'Branch Distribution', path: '/branch-distribution', dashboard: 'operations' }
      ]
    },
    {
      id: 'marketing',
      name: 'Marketing',
      icon: '📈',
      color: '#f59e0b',
      links: [
        { label: 'Marketing Performance', path: '/marketing-performance', dashboard: 'marketing' },
        { label: 'Enrolment by Platform', path: '/platform-breakdown', dashboard: 'marketing' }
      ],
      gaReports: gaReports
    },
    {
      id: 'department',
      name: 'Department',
      icon: '✅',
      color: '#6366f1',
      links: [
        { label: 'Department Dashboard', path: '/department', dashboard: 'department' }
      ]
    },
    {
      id: 'hr',
      name: 'HR',
      icon: '👥',
      color: '#ec4899',
      links: [
        { label: 'HR Recruitment Funnel', path: '/hr-recruitment-funnel', dashboard: 'hr' },
        { label: 'HR Overview Dashboard', path: '/hr-onb-ofb', dashboard: 'hr' },
      ]
    },
    {
      id: 'hr_db',
      name: 'HR Employee Database',
      icon: '🗄️',
      color: '#0891b2',
      links: [
        { label: 'Staff List', path: '/hr-staff-list', dashboard: 'hr_crud' },
        { label: 'Attendance', path: '/hr-attendance', dashboard: 'hr' },
        { label: 'Hiring Data', path: '/hr-hiring', dashboard: 'hr' },
        { label: 'Recruitment Funnel', path: '/hr-recruitment-funnel', dashboard: 'hr' },
      ]
    },
    {
      id: 'hr_crud',
      name: 'CRUD HR Data',
      icon: '📋',
      color: '#a855f7',
      links: [
        { label: 'Staff List', path: '/hr-staff-list', dashboard: 'hr_crud' },
        { label: 'MC (Medical Certificate)', path: '/hr-mc', dashboard: 'hr_crud' },
        { label: 'Annual Leave', path: '/hr-annual-leave', dashboard: 'hr_crud' },
      ]
    },
    {
      id: 'hr_testing',
      name: 'HR Testing Data',
      icon: '🧪',
      color: '#14b8a6',
      links: [
        { label: 'Attendance Dashboard', path: '/hrfs-attendance-dashboard', dashboard: 'testing' },
        { label: 'Attendance Log', path: '/hrfs-attendance', dashboard: 'testing' },
        { label: 'Branch Staff', path: '/hrfs-branch-staff', dashboard: 'testing' },
        { label: 'Leave Transactions', path: '/hrfs-leave-transactions', dashboard: 'testing' },
      ]
    },
    {
      id: 'admin',
      name: 'Admin',
      icon: '🔧',
      color: '#6b7280',
      links: [
        { label: 'User Management', path: '/users', dashboard: 'admin' },
        { label: 'Permissions', path: '/permissions', dashboard: 'admin' },
        { label: '📺 TV Devices', path: '/admin/devices', dashboard: 'admin' },
        { label: '📋 Audit Log', path: '/admin/audit-log', dashboard: 'admin' },
      ]
    },
    {
      id: 'testing',
      name: 'Testing Purposes Only (dnft)',
      icon: '🧪',
      color: '#f97316',
      links: [
        { label: 'GHL Lead Centre', path: '/ghl-lead-centre', dashboard: 'testing' },
        { label: 'GHL Dashboard (CT to NL)', path: '/ghl-dashboard', dashboard: 'testing' },
        { label: 'To Tally', path: '/tally', dashboard: 'testing' },
      ]
    },
    {
      id: 'rm_dashboard',
      name: 'For Regional Manager',
      icon: '📊',
      color: '#0ea5e9',
      gaReports: [
        { label: 'CT to NL (Dashboard by Region)', url: 'https://lookerstudio.google.com/embed/reporting/775a46b1-e020-465a-861e-067e6a21a004/page/p_7ocip3dd2d' },
        { label: 'Today Dashboard', url: 'https://lookerstudio.google.com/embed/reporting/775a46b1-e020-465a-861e-067e6a21a004/page/p_rzbux1co0d' },
        { label: 'Yesterday Dashboard', url: 'https://lookerstudio.google.com/embed/reporting/775a46b1-e020-465a-861e-067e6a21a004/page/p_ulmzo6co0d' },
      ],
      links: [
        { label: 'CT to NL (Overall)', path: '/leads-dashboard', dashboard: 'rm_dashboard' },
      ]
    }
  ];

  // Filter departments based on permissions
  const filteredDepartments = departmentData
      .map(dept => ({
        ...dept,
        gaReports: dept.gaReports && canAccess(dept.id, permissions) ? dept.gaReports : undefined,
        links: dept.links.filter(link => !link.dashboard || canAccess(link.dashboard, permissions)),
      }))
      .filter(dept => {
        const hasLinks = dept.links.length > 0;
        const hasGaReports = !!dept.gaReports;
        return hasLinks || hasGaReports;
      });

  if (isLoading) {
    return (
      <div className="dashboardHomePage">
        <div className="dashboardHomeHeader">
          <h1 className="pageHeaderTitle">Welcome to Ebright Dashboard</h1>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboardHomePage">
      <div className="dashboardHomeHeader">
        <h1 className="pageHeaderTitle">Welcome to Ebright Dashboard</h1>
        <p>{visibleDashboards.length} accessible dashboards</p>
      </div>

      {/* OKR Attendance Summary */}
      <div className="homeOkrPanel">
        <div className="homeOkrPanelHeader">
          <div>
            <h2 className="homeOkrTitle">OKR Attendance</h2>
            <p className="homeOkrSubtitle">Weekly student attendance at a glance</p>
          </div>
          <button className="btnSecondary" onClick={() => navigate('/okr-attendance')}>
            Open Full Dashboard
          </button>
        </div>

        <div className="homeOkrFilters">
          <div className="formGroup">
            <label>Branch</label>
            <select value={okrBranch} onChange={e => setOkrBranch(e.target.value)}>
              <option value="">Select branch...</option>
              {okrBranches.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div className="formGroup">
            <label>Week Date (optional)</label>
            <input type="date" value={okrWeek} onChange={e => setOkrWeek(e.target.value)} />
          </div>
        </div>

        {!okrBranch ? (
          <p className="homeOkrEmpty">Select a branch above to see its latest OKR summary.</p>
        ) : !okrRecord ? (
          <p className="homeOkrEmpty">No OKR data found for this branch. <button className="linkBtn" onClick={() => navigate('/okr-attendance')}>Add data</button></p>
        ) : (
          <div className="homeOkrStats">
            <div className="homeOkrStat">
              <span className="homeOkrStatLabel">Branch</span>
              <strong className="homeOkrStatValue">{okrRecord.branch}</strong>
            </div>
            <div className="homeOkrStat">
              <span className="homeOkrStatLabel">Week</span>
              <strong className="homeOkrStatValue">{okrRecord.week_date?.slice(0, 10)}</strong>
            </div>
            <div className="homeOkrStat">
              <span className="homeOkrStatLabel">Total Attendance</span>
              <strong className="homeOkrStatValue">{okrMetrics.totalAttendance}</strong>
            </div>
            <div className="homeOkrStat">
              <span className="homeOkrStatLabel">Attendance Rate</span>
              <strong className={`homeOkrStatValue ${okrMetrics.attendanceRate >= 80 ? 'okrGood' : 'okrBad'}`}>
                {okrMetrics.attendanceRate.toFixed(1)}%
              </strong>
            </div>
            <div className="homeOkrStat">
              <span className="homeOkrStatLabel">Rate w/ Freeze</span>
              <strong className={`homeOkrStatValue ${okrMetrics.attendanceRateWithFreeze >= 80 ? 'okrGood' : 'okrBad'}`}>
                {okrMetrics.attendanceRateWithFreeze.toFixed(1)}%
              </strong>
            </div>
            <div className="homeOkrStat">
              <span className="homeOkrStatLabel">Active Students</span>
              <strong className="homeOkrStatValue">{okrRecord.active_students ?? '-'}</strong>
            </div>
            <div className="homeOkrStat">
              <span className="homeOkrStatLabel">Outstanding Inv.</span>
              <strong className={`homeOkrStatValue ${parseFloat(okrRecord.outstanding_invoice_pct) <= 25 ? 'okrGood' : 'okrBad'}`}>
                {parseFloat(okrRecord.outstanding_invoice_pct || 0).toFixed(1)}%
              </strong>
            </div>
            <div className="homeOkrStat homeOkrStatAction">
              <button className="btnPrimary" onClick={() => navigate('/okr-attendance')}>
                Full View
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="dashboardHomeGrid">
        {filteredDepartments.map((dept) => (
          <div
            key={dept.id}
            className="dashboardHomeCard"
            style={{ '--card-color': dept.color }}
          >
            <div className="dashboardHomeCardHeader">
              <span className="dashboardHomeCardIcon">{dept.icon}</span>
              <h2>{dept.name}</h2>
            </div>

            <div className="dashboardHomeCardLinks">
              {dept.gaReports ? (
                <>
                  {dept.gaReports.map((report, idx) => (
                    <a
                      key={idx}
                      href={report.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="dashboardHomeLink"
                    >
                      {report.label} ↗
                    </a>
                  ))}
                  {dept.links.map((link) => (
                    <button
                      key={link.path}
                      className="dashboardHomeLink"
                      onClick={() => navigate(link.path)}
                    >
                      {link.label}
                    </button>
                  ))}
                </>
              ) : dept.links.length > 0 ? (
                dept.links.map((link) => (
                  <button
                    key={link.path}
                    className="dashboardHomeLink"
                    onClick={() => navigate(link.path)}
                  >
                    {link.label}
                  </button>
                ))
              ) : dept.comingSoon ? (
                <p className="dashboardHomeNoLink">Coming Soon</p>
              ) : (
                <p className="dashboardHomeNoLink">No access</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}