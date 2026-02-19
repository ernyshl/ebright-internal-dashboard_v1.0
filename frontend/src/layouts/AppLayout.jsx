import { Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Sidebar } from '../components/Sidebar';
import { apiFetch } from '../lib/api';
import { clearToken } from '../lib/auth';

export function AppLayout() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => apiFetch('/api/auth/me'),
    staleTime: 60_000,
    retry: false,
  });

  const user = me.data?.user;
  const initials = user?.fullName
    ? user.fullName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  function onLogout() {
    clearToken();
    navigate('/login', { replace: true });
  }

  function toggleSidebar() {
    setSidebarOpen(!sidebarOpen);
  }

  function closeSidebar() {
    setSidebarOpen(false);
  }

  return (
    <div className="appShell">
      {/* Mobile Overlay */}
      <div 
        className={`mobileOverlay ${sidebarOpen ? 'active' : ''}`} 
        onClick={closeSidebar}
      />
      
      {/* Sidebar Trigger (hover to show sidebar on desktop) */}
      <div className="sidebarTrigger" onMouseEnter={() => setSidebarOpen(true)} />
      
      {/* Sidebar */}
      <div 
        className={`sidebar ${sidebarOpen ? 'sidebarVisible' : ''}`}
        onMouseLeave={() => setSidebarOpen(false)}
      >
        <Sidebar onNavigate={closeSidebar} />
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
                  <div className="muted small" style={{ textTransform: 'capitalize' }}>{user.role}</div>
                </div>
              </div>
            )}
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
      </div>
    </div>
  );
}

