import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { getUser } from '../lib/auth';

export function usePermissions() {
  const user = getUser();
  
  const { data, isLoading, error } = useQuery({
    queryKey: ['permissions'],
    queryFn: () => apiFetch('/api/permissions'),
    retry: 1,
    staleTime: 300000, // 5 minutes - permissions don't change often
  });

  return {
    permissions: data?.permissions || {},
    dashboards: data?.dashboards || [],
    isLoading,
    error,
    isSuperAdmin: user?.role === 'super_admin',
  };
}

export function useAllPermissions() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['all-permissions'],
    queryFn: () => apiFetch('/api/permissions/all'),
    retry: 1,
    staleTime: 60000,
  });

  return {
    users: data?.users || [],
    dashboards: data?.dashboards || [],
    isLoading,
    error,
    refetch,
  };
}

export function canAccess(dashboard, permissions) {
  if (!permissions || !dashboard) return false;
  const perm = permissions[dashboard];
  return perm?.allowed === true;
}

export function getAccessibleDashboards(permissions, dashboards) {
  if (!permissions || !dashboards) return [];
  return dashboards.filter(d => canAccess(d.id, permissions));
}
