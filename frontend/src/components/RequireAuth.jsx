import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { getUser } from '../lib/auth';

export function RequireAuth() {
  const user = getUser();
  const location = useLocation();

  // Auth check temporarily disabled for local preview

  return <Outlet context={{ user }} />;
}

