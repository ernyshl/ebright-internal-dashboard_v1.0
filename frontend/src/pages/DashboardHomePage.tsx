import { useNavigate } from 'react-router-dom';
import { usePermissions, canAccess, getAccessibleDashboards } from '../lib/permissions';

export function DashboardHomePage() {
  const navigate = useNavigate();
  const { permissions, dashboards, isLoading } = usePermissions();


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

  const departmentData: any[] = [
    {
      id: 'operations_dept',
      name: 'Operations',
      icon: '🎯',
      color: '#0ea5e9',
      links: [
        { label: 'GHL Lead Centre', path: '/ghl-lead-centre', dashboard: 'operations_dept' },
        { label: 'GHL Dashboard (CT to NL)', path: '/ghl-dashboard', dashboard: 'operations_dept' },
        { label: 'CT with time slot', path: '/ct-with-time-slot', dashboard: 'operations_dept' },
      ]
    },
    {
      id: 'academy',
      name: 'Academy',
      icon: '🎓',
      color: '#8b5cf6',
      links: [
        { label: 'Academy Dashboard', path: '/academy-dashboard', dashboard: 'academy' },
        { label: '🎓 FA Dashboard', path: '/fa-dashboard', dashboard: 'academy' },
        { label: 'OKR Dashboard', path: '/okr-attendance', dashboard: 'academy' },
        { label: 'Branch Revenue & Renewals', path: '/academy/branch-revenue-renewals', dashboard: 'academy' },
        { label: 'Renewal by Branch', path: '/academy/renewal-by-branch', dashboard: 'academy' }
      ]
    },
    {
      id: 'fa_testing',
      name: 'FA Dashboard Testing',
      icon: '🧪',
      color: '#6366f1',
      links: [
        { label: '🎓 FA Dashboard', path: '/fa-dashboard-testing', dashboard: 'fa_testing' }
      ]
    },
    {
      id: 'event_mkt',
      name: 'Event Marketing',
      icon: '🎪',
      color: '#f43f5e',
      links: [
        { label: 'Event Dashboard', path: '/events', dashboard: 'event_mkt' },
        { label: 'Event MKT Dashboard', path: '/event-mkt-dashboard', dashboard: 'event_mkt' },
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
        { label: 'Staff List', path: '/hr-staff-list', dashboard: 'hr_db' },
        { label: 'Attendance', path: '/hr-attendance', dashboard: 'hr_db' },
        { label: 'Hiring Data', path: '/hr-hiring', dashboard: 'hr_db' },
        { label: 'Recruitment Funnel', path: '/hr-recruitment-funnel', dashboard: 'hr_db' },
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
        { label: 'Overview v2', path: '/hrfs-overview-v2', dashboard: 'hr_testing' },
        { label: 'Attendance Dashboard', path: '/hrfs-attendance-dashboard', dashboard: 'hr_testing' },
        { label: 'Attendance Log', path: '/hrfs-attendance', dashboard: 'hr_testing' },
        { label: 'Branch Staff', path: '/hrfs-branch-staff', dashboard: 'hr_testing' },
        { label: 'Leave Transactions', path: '/hrfs-leave-transactions', dashboard: 'hr_testing' },
      ]
    },
    {
      id: 'student_db',
      name: 'Student Database',
      icon: '📚',
      color: '#7c3aed',
      links: [
        { label: 'Student Records', path: '/student-database', dashboard: 'student_db' },
        { label: '🗂 Archived Students', path: '/archived-students', dashboard: 'student_db' },
        { label: '📋 Student Attendance', path: '/student-attendance', dashboard: 'student_db' },
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
        { label: '🚫 GHL Ignored Payloads', path: '/admin/ghl-ignored', dashboard: 'admin' },
      ]
    },
    {
      id: 'testing',
      name: 'Testing Purposes Only (dnft)',
      icon: '🧪',
      color: '#f97316',
      links: [
        { label: 'Branch Performance', path: '/branch-performance', dashboard: 'testing' },
        { label: 'To Tally', path: '/tally', dashboard: 'testing' },
        { label: 'UI/UX Testing', path: '/ui-ux-testing', dashboard: 'testing' },
      ]
    },
    {
      id: 'manjeet',
      name: 'For Manjeet',
      icon: '🎯',
      color: '#f59e0b',
      links: [
        { label: 'Leads Dashboard v2', path: '/leads-dashboard-v2', dashboard: 'manjeet' },
        { label: 'Day Distribution',    path: '/day-distribution',    dashboard: 'manjeet' },
        { label: 'Time Slot Distribution', path: '/time-slot-distribution', dashboard: 'manjeet' },
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

  const filteredDepartments = departmentData
    .map(dept => ({
      ...dept,
      gaReports: dept.gaReports && canAccess(dept.id, permissions) ? dept.gaReports : undefined,
      links: dept.links.filter(link => !link.dashboard || canAccess(link.dashboard, permissions)),
    }))
    .filter(dept => dept.links.length > 0 || !!dept.gaReports);

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

      <div className="dashboardHomeGrid">
        {filteredDepartments.map((dept) => (
          <div
            key={dept.id}
            className="dashboardHomeCard"
            style={{ '--card-color': dept.color } as React.CSSProperties}
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