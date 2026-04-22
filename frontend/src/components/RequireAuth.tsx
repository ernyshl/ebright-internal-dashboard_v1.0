import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { getUser } from '../lib/auth';

export function RequireAuth() {
  const user = getUser();
  const location = useLocation();

  // Auth check disabled for local preview
  // if (!user) {
  //   return <Navigate to="/login" replace state={{ from: location }} />;
  // }

  return <Outlet context={{ user }} />;
}

