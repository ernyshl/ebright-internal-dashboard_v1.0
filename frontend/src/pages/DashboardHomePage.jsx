import { useNavigate } from 'react-router-dom';
import { usePermissions, canAccess, getAccessibleDashboards } from '../lib/permissions';
import { getUser } from '../lib/auth';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

export function DashboardHomePage() {
  const navigate = useNavigate();
  const user = getUser();
  const isSuperAdmin = user?.role === 'super_admin';
  const { permissions, dashboards, isLoading } = usePermissions();

  // Fetch recent events for dashboard overview
  const { data: eventsData } = useQuery({
    queryKey: ['events'],
    queryFn: () => apiFetch('/api/events'),
  });

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
        { label: '🎪 Event Dashboard', path: '/events', dashboard: 'events' }
      ]
    },
    {
      id: 'finance',
      name: 'Finance',
      icon: '💰',
      color: '#10b981',
      links: [
        { label: 'Finance Dashboard', path: '/finance', dashboard: 'finance' }
      ]
    },
    {
      id: 'operations',
      name: 'Operations',
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
        { label: 'Marketing Performance', path: '/marketing-performance', dashboard: 'marketing' }
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
        { label: 'HR Recruitment Funnel', path: '/hr-recruitment-funnel', dashboard: 'hr' }
      ]
    }
  ];

  // Filter departments based on permissions - super admin sees everything
  const filteredDepartments = isSuperAdmin
    ? departmentData
    : departmentData
      .map(dept => ({
        ...dept,
        // For marketing, also check if user has permission (don't show just because of gaReports)
        gaReports: dept.gaReports && canAccess('marketing', permissions) ? dept.gaReports : undefined,
        links: dept.links.filter(link => !link.dashboard || canAccess(link.dashboard, permissions)),
      }))
      .filter(dept => {
        // Keep department if it has links OR (is marketing AND has marketing permission)
        const hasLinks = dept.links.length > 0;
        const hasMarketingAccess = dept.id === 'marketing' && canAccess('marketing', permissions);
        return hasLinks || hasMarketingAccess;
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