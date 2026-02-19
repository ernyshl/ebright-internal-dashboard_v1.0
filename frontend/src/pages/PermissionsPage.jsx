import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { useAllPermissions } from '../lib/permissions';
import { BackButton } from '../components/BackButton';

export function PermissionsPage() {
  const queryClient = useQueryClient();
  const { users, dashboards, isLoading } = useAllPermissions();
  const [selectedUser, setSelectedUser] = useState(null);

  const updatePermission = useMutation({
    mutationFn: ({ userId, dashboard, allowed }) => 
      apiFetch(`/api/permissions/${userId}`, { 
        method: 'PUT', 
        body: { dashboard, allowed } 
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-permissions'] });
    },
  });

  const resetPermission = useMutation({
    mutationFn: ({ userId, dashboard }) => 
      apiFetch(`/api/permissions/${userId}/${dashboard}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-permissions'] });
    },
  });

  // Get initials for avatar
  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  // Get role badge color
  const getRoleBadgeClass = (role) => {
    switch (role) {
      case 'super_admin':
      case 'ceo':
        return 'badgeExecutive';
      case 'marketing':
        return 'badgeMarketing';
      case 'academy':
        return 'badgeAcademy';
      case 'finance':
        return 'badgeFinance';
      case 'rm':
      case 'od':
      case 'hr':
        return 'badgeSales';
      default:
        return 'badgeExecutive';
    }
  };

  const getRoleLabel = (role) => {
    const labels = {
      super_admin: 'Super Admin',
      ceo: 'CEO',
      rm: 'Regional Manager',
      marketing: 'Marketing',
      od: 'Operations Director',
      hr: 'Human Resources',
      academy: 'Academy',
      finance: 'Finance',
    };
    return labels[role] || role;
  };

  if (isLoading) {
    return (
      <div className="dashboardPage">
        <div className="dashboardHeader">
          <BackButton to="/" label="Back to Home" />
          <h1 style={{ marginTop: 16 }}>🔐 Permissions Management</h1>
          <p className="headerSubtitle">Control dashboard access for all users</p>
        </div>
        <div className="dashboardContent">
          <div className="loadingState">
            <div className="spinner"></div>
            <p>Loading permissions...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboardPage">
      <div className="dashboardHeader">
        <BackButton to="/" label="Back to Home" />
        <h1 style={{ marginTop: 16 }}>🔐 Permissions Management</h1>
        <p className="headerSubtitle">Control which dashboards each user can access</p>
      </div>

      <div className="dashboardContent">
        {/* User Selection */}
        <div className="permissionsSection">
          <div className="permissionsSectionHeader">
            <h2>👥 Select User</h2>
            <p>Click on a user to manage their dashboard permissions</p>
          </div>
          
          <div className="permissionsUsersGrid">
            {users.map((user) => (
              <button
                key={user.id}
                className={`permissionUserCard ${selectedUser?.id === user.id ? 'selected' : ''}`}
                onClick={() => setSelectedUser(user)}
              >
                <div className="permissionUserAvatar">
                  {getInitials(user.fullName)}
                </div>
                <div className="permissionUserInfo">
                  <div className="permissionUserName">{user.fullName || 'Unknown'}</div>
                  <div className="permissionUserEmail">{user.email}</div>
                  <span className={`badge ${getRoleBadgeClass(user.role)}`}>
                    {getRoleLabel(user.role)}
                  </span>
                </div>
                {selectedUser?.id === user.id && (
                  <div className="selectedIndicator">✓</div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Permissions for Selected User */}
        {selectedUser && (
          <div className="permissionsSection">
            <div className="permissionsSectionHeader">
              <h2>📋 Dashboard Access</h2>
              <p>Managing permissions for <strong>{selectedUser.fullName}</strong></p>
            </div>
            
            <div className="permissionsCard">
              <div className="permissionsCardHeader">
                <div className="permissionsUserSummary">
                  <div className="permissionUserAvatarLarge">
                    {getInitials(selectedUser.fullName)}
                  </div>
                  <div>
                    <div className="permissionsUserName">{selectedUser.fullName}</div>
                    <div className="permissionsUserEmail">{selectedUser.email}</div>
                    <span className={`badge ${getRoleBadgeClass(selectedUser.role)}`}>
                      {getRoleLabel(selectedUser.role)}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="permissionsTableWrapper">
                <table className="permissionsTable">
                  <thead>
                    <tr>
                      <th>Dashboard</th>
                      <th>Access Status</th>
                      <th>Source</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboards.map((dashboard) => {
                      const perm = selectedUser.permissions[dashboard.id];
                      const isCustom = perm?.custom;
                      const isAllowed = perm?.allowed;

                      return (
                        <tr key={dashboard.id}>
                          <td>
                            <div className="permissionDashboard">
                              <span className="permissionDashboardIcon">{dashboard.icon}</span>
                              <div>
                                <div className="permissionDashboardName">{dashboard.name}</div>
                                <div className="permissionDashboardDesc">{dashboard.description}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className={`permissionStatus ${isAllowed ? 'allowed' : 'denied'}`}>
                              {isAllowed ? '✓ Allowed' : '✗ Denied'}
                            </span>
                          </td>
                          <td>
                            <span className={`permissionSource ${isCustom ? 'custom' : 'role'}`}>
                              {isCustom ? '🎨 Custom' : '👤 Role Default'}
                            </span>
                          </td>
                          <td>
                            <div className="permissionActions">
                              {isAllowed ? (
                                <button
                                  className="btn btnSmall btnDanger"
                                  onClick={() => updatePermission.mutate({ 
                                    userId: selectedUser.id, 
                                    dashboard: dashboard.id, 
                                    allowed: false 
                                  })}
                                  disabled={updatePermission.isPending}
                                >
                                  🚫 Deny
                                </button>
                              ) : (
                                <button
                                  className="btn btnSmall btnSuccess"
                                  onClick={() => updatePermission.mutate({ 
                                    userId: selectedUser.id, 
                                    dashboard: dashboard.id, 
                                    allowed: true 
                                  })}
                                  disabled={updatePermission.isPending}
                                >
                                  ✅ Allow
                                </button>
                              )}
                              {isCustom && (
                                <button
                                  className="btn btnSmall btnSecondary"
                                  onClick={() => resetPermission.mutate({ 
                                    userId: selectedUser.id, 
                                    dashboard: dashboard.id 
                                  })}
                                  disabled={resetPermission.isPending}
                                >
                                  🔄 Reset
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              
              <div className="permissionLegend">
                <h4>📖 Legend</h4>
                <div className="legendGrid">
                  <div className="legendItem">
                    <span className="badge badgeActive">✓ Allowed</span>
                    <span>User can access this dashboard</span>
                  </div>
                  <div className="legendItem">
                    <span className="badge badgeInactive">✗ Denied</span>
                    <span>User cannot access this dashboard</span>
                  </div>
                  <div className="legendItem">
                    <span className="permissionSource custom">🎨 Custom</span>
                    <span>Permission manually set by admin</span>
                  </div>
                  <div className="legendItem">
                    <span className="permissionSource role">👤 Role Default</span>
                    <span>Permission inherited from role</span>
                  </div>
                </div>
                <div className="legendNote">
                  <strong>💡 Tip:</strong> Click "Reset" to remove custom permissions and revert to role defaults.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}