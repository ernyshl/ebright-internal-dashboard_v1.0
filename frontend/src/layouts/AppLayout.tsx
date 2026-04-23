import { Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { Sidebar } from '../components/Sidebar';
import { apiFetch, ApiError } from '../lib/api';
import { clearToken } from '../lib/auth';
import { getRoleLabel } from '../lib/roles';

export function AppLayout() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [autoHide, setAutoHide] = useState(true);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => apiFetch('/api/auth/me'),
    staleTime: 60_000,
    retry: false,
  });

  useEffect(() => {
    if (me.isError && (me.error as ApiError)?.status === 401) {
      clearToken();
      navigate('/login', { replace: true });
    }
  }, [me.isError, me.error, navigate]);

  const user = me.data?.user;
  const initials = user?.fullName
    ? user.fullName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  function onLogout() {
    clearToken();
    navigate('/', { replace: true });
  }

  function toggleSidebar() {
    setSidebarOpen(!sidebarOpen);
  }

  function closeSidebar() {
    if (autoHide) {
      setSidebarOpen(false);
    }
  }

  function toggleAutoHide() {
    setAutoHide(!autoHide);
    setSidebarOpen(true); // Always open sidebar when toggling auto-hide
  }

  return (
    <div className="appShell">
      {/* Mobile Overlay */}
      <div
        className={`mobileOverlay ${sidebarOpen ? 'active' : ''}`}
        onClick={closeSidebar}
      />

      {/* Sidebar Trigger for mobile only */}
      <div
        className="sidebarTrigger"
        onClick={() => setSidebarOpen(true)}
      />

      {/* Sidebar - always visible in mini mode on desktop */}
      <div
        className={`sidebar ${sidebarOpen ? 'sidebarVisible' : ''} ${!autoHide ? 'sidebarFrozen' : ''}`}
        onMouseLeave={() => autoHide && setSidebarOpen(false)}
      >
        <Sidebar
          onNavigate={closeSidebar}
          autoHide={autoHide}
          onToggleAutoHide={toggleAutoHide}
        />
      </div>

      {/* Mobile Menu Button */}
      <button className="mobileMenuBtn" onClick={toggleSidebar} aria-label="Toggle menu">
        ☰
      </button>

      <div className="content">
        <header className="topbar">
          <div className="topbarLeft">
            <button
              className="mobileMenuBtn"
              onClick={toggleSidebar}
              style={{ display: 'none', position: 'relative', bottom: 'auto', right: 'auto' }}
              aria-label="Toggle menu"
            >
              ☰
            </button>
            <div className="pageTitle">Ebright Internal Dashboard</div>
            <div className="muted small">
              {me.isLoading
                ? 'Checking session…'
                : me.isError
                  ? 'Session not verified'
                  : `Welcome back, ${user?.fullName || user?.email || ''}`}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {user && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="avatar avatarBrand">{initials}</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{user.fullName || user.email}</div>
                  <div className="muted small">{getRoleLabel(user.role)}</div>
                </div>
              </div>
            )}
            <button
              className="btn btnSmall"
              onClick={toggleTheme}
              style={{ padding: '4px 8px', fontSize: '16px', background: 'transparent', border: 'none', cursor: 'pointer' }}
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light' ? '🌙' : '☀️'}
            </button>
            <button className="btn btnSmall btnDanger" onClick={onLogout}>
              Log out
            </button>
          </div>
        </header>

        <main className="main">
          <Outlet />
        </main>

        <footer className="appFooter">
          Ebright Sdn. Bhd. No: 202101030304 (1430604-A)<br />
          All Rights Reserved. Terms and Conditions
        </footer>
      </div >
    </div >
  );
}

