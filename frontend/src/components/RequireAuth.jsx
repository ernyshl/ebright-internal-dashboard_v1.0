import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { getUser } from '../lib/auth';

export function RequireAuth() {
  const user = getUser();
  const location = useLocation();

  if (!user) {
    // Send root visitors to the landing page; deep-linked visitors to login
    const dest = location.pathname === '/' ? '/landing' : '/login';
    return <Navigate to={dest} replace state={{ from: location.pathname }} />;
  }

  return <Outlet context={{ user }} />;
}

