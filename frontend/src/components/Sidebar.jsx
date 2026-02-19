import { NavLink } from 'react-router-dom';
import { getUser, clearToken } from '../lib/auth';
import { useNavigate } from 'react-router-dom';
import { usePermissions, canAccess } from '../lib/permissions';

// Role labels for display
const ROLE_LABELS = {
  super_admin: 'Super Admin',
  ceo: 'CEO',
  rm: 'RM',
  marketing: 'Marketing',
  od: 'OD',
  hr: 'HR',
};

export function Sidebar({ onNavigate }) {
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

  const getRoleBadgeClass = (role) => {
    switch (role) {
      case 'super_admin':
      case 'ceo':
        return 'badgeExecutive';
      case 'marketing':
        return 'badgeMarketing';
      case 'rm':
      case 'od':
      case 'hr':
        return 'badgeSales';
      default:
        return 'badgeExecutive';
    }
  };

  const getRoleLabel = (role) => ROLE_LABELS[role] || role;

  const linkClass = ({ isActive }) => (isActive ? 'navLink navLinkActive' : 'navLink');

  // Navigation items - Leads Centre is visible to all users
  const navItems = [
    { to: '/', label: 'Dashboard Home', icon: '🏠', dashboard: null },
    { to: '/leads-centre', label: 'Leads Centre', icon: '📋', dashboard: null },
  ];

  // Super admin has access to user management
  const adminNavItems = [
    { to: '/users', label: 'User Management', icon: '👥', dashboard: null },
  ];

  // Super admin has access to everything
  const isSuperAdmin = user?.role === 'super_admin';

  // Filter nav items based on permissions - super admin sees all
  const visibleNavItems = isSuperAdmin 
    ? [...navItems, ...adminNavItems]
    : navItems.filter(item => !item.dashboard || canAccess(item.dashboard, permissions));

  return (
    <aside className="sidebar">
      <div className="sidebarHeader">
        <img src="/OD LOGO.png" alt="OD Logo" style={{ width: 48, height: 48, objectFit: 'contain' }} />
        <div>
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
          >
            <span className="navIcon">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="sidebarFooter">
        <div className="sidebarUser">
          <div className="sidebarUserAvatar">{getInitials(user?.fullName)}</div>
          <div className="sidebarUserInfo">
            <div className="sidebarUserName">{user?.fullName || 'User'}</div>
            <span className={`badge ${getRoleBadgeClass(user?.role)}`}>{getRoleLabel(user?.role)}</span>
          </div>
          <button className="sidebarLogout" onClick={handleLogout} title="Logout">
            🚪
          </button>
        </div>
      </div>
    </aside>
  );
}

