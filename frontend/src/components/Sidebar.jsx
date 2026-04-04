import { NavLink } from 'react-router-dom';
import { getUser, clearToken } from '../lib/auth';
import { useNavigate } from 'react-router-dom';
import { usePermissions, canAccess } from '../lib/permissions';
import { getRoleLabel, getRoleBadgeClass } from '../lib/roles';

export function Sidebar({ onNavigate, autoHide, onToggleAutoHide }) {
  const user = getUser();
  const navigate = useNavigate();
  const { permissions } = usePermissions();

  const handleLogout = () => {
    clearToken();
    navigate('/login');
  };

  const handleNavClick = () => {
    if (onNavigate) {
      onNavigate();
    }
  };

  const getInitials = (name) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const linkClass = ({ isActive }) => (isActive ? 'navLink navLinkActive' : 'navLink');

  const navItems = [
    { to: '/', label: 'Dashboard Home', icon: '🏠', roles: null },
    { to: '/executive-summary', label: 'Executive Summary', icon: '📊', roles: ['super_admin', 'ceo'] },
    { to: '/branch-ranking', label: 'Branch Ranking', icon: '🏆', roles: ['super_admin', 'ceo', 'finance', 'od', 'rm'] },
    { to: '/leads-centre', label: 'Leads Centre', icon: '📋', roles: ['super_admin', 'ceo', 'rm', 'marketing', 'od', 'hr'] },
    { to: '/leads-ghl-view', label: 'Leads GHL View', icon: '🔍', roles: ['super_admin', 'rm'] },
    { to: '/event-entry', label: 'Event Entry', icon: '📝', dashboard: 'events' },
  ];

  const adminNavItems = [
    { to: '/users', label: 'User Management', icon: '👥', roles: ['super_admin'] },
  ];

  const isSuperAdmin = user?.role === 'super_admin';

  const visibleNavItems = isSuperAdmin
    ? [...navItems, ...adminNavItems]
    : navItems.filter(item => {
      if (item.roles !== null && item.roles !== undefined) {
        return item.roles.includes(user?.role);
      }
      return !item.dashboard || canAccess(item.dashboard, permissions);
    });

  return (
    <>
      {/* Header: logo on left (visible in 64px mini) */}
      <div className="sidebarHeader">
        <img src="/OD LOGO.png" alt="OD Logo" className="sidebarLogo" />
        <div className="sidebarBrandText">
          <div className="brandTitle">Ebright</div>
          <div className="brandSubtitle">Internal Dashboard</div>
        </div>
      </div>

      <nav className="nav">
        {visibleNavItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={linkClass}
            onClick={handleNavClick}
            title={item.label}
          >
            {/* Icon on left (visible in 64px mini) */}
            <span className="navIcon">{item.icon}</span>
            <span className="navLabel">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebarFooter">
        <div className="sidebarUserWrapper">
          <button
            className="sidebarUserButton"
            onClick={() => navigate('/profile')}
            title={user?.fullName || 'Profile'}
          >
            {/* Avatar on left (visible in 64px mini) */}
            <div className="sidebarUserAvatar">{getInitials(user?.fullName)}</div>
            <div className="sidebarUserInfo">
              <div className="sidebarUserName" title={user?.fullName}>{user?.fullName || 'User'}</div>
              <span className={`badge ${getRoleBadgeClass(user?.role)}`}>{getRoleLabel(user?.role)}</span>
            </div>
          </button>
          <button className="sidebarLogoutBtn sidebarLogoutBtnHidden" onClick={handleLogout} title="Logout">
            Logout
          </button>
        </div>
        <button
          className="autoHideToggle autoHideToggleHidden"
          onClick={onToggleAutoHide}
          title={autoHide ? 'Click to freeze sidebar' : 'Click to enable auto-hide'}
        >
          <span className="toggleIcon">{autoHide ? '✓' : '🔒'}</span>
          <span className="toggleText">Auto Hide: {autoHide ? 'ON' : 'OFF'}</span>
        </button>
      </div>
    </>
  );
}
