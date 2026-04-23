import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { useAllPermissions } from '../lib/permissions';
import { BackButton } from '../components/BackButton';
import { getRoleLabel, getRoleBadgeClass } from '../lib/roles';

export function PermissionsPage() {
  const queryClient = useQueryClient();
  const { users, dashboards, isLoading } = useAllPermissions();
  const [selectedUser, setSelectedUser] = useState(null);

  const updatePermission = useMutation({
    mutationFn: ({ userId, dashboard, allowed }: { userId: any; dashboard: any; allowed: boolean }) =>
      apiFetch(`/api/permissions/${userId}`, {
        method: 'PUT',
        body: { dashboard, allowed }
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-permissions'] });
    },
  });

  const resetPermission = useMutation({
    mutationFn: ({ userId, dashboard }: { userId: any; dashboard: any }) =>
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

  // Get dashboard icon
  const getDashboardIcon = (id) => {
    const icons = {
      dashboard: '📊',
      marketing: '📈',
      leads: '🎯',
      finance: '💰',
      users: '👥',
      permissions: '🔐',
      profile: '👤',
      department: '🏢',
      looker: '📉',
    };
    return icons[id] || '📋';
  };

  if (isLoading) {
    return (
      <div className="dashboardPage">
        <div className="dashboardHeader">
          <BackButton to="/" label="Back to Home" />
          <h1 className="pageHeaderTitle" style={{ marginTop: 16 }}>🔐 Permissions Management</h1>
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
        <h1 className="pageHeaderTitle" style={{ marginTop: 16 }}>🔐 Permissions Management</h1>
        <p className="headerSubtitle">Control which dashboards each user can access</p>
      </div>

      <div className="dashboardContent">
        {/* Profile Header Card */}
        {selectedUser && (
          <div className="permissionsHeaderCard">
            <div className="permissionsHeaderLeft">
              <div className="permissionsAvatarLarge">
                {getInitials(selectedUser.fullName)}
              </div>
              <div className="permissionsHeaderInfo">
                <h2 className="permissionsName">{selectedUser.fullName}</h2>
                <p className="permissionsEmail">{selectedUser.email}</p>
                <span className={`badge ${getRoleBadgeClass(selectedUser.role)}`}>
                  {getRoleLabel(selectedUser.role)}
                </span>
              </div>
            </div>
            <div className="permissionsHeaderStats">
              <div className="permissionsStat">
                <span className="permissionsStatValue">
                  {Object.values(selectedUser.permissions || {}).filter(p => p?.allowed).length}
                </span>
                <span className="permissionsStatLabel">Allowed</span>
              </div>
              <div className="permissionsStat">
                <span className="permissionsStatValue denied">
                  {Object.values(selectedUser.permissions || {}).filter(p => !p?.allowed).length}
                </span>
                <span className="permissionsStatLabel">Denied</span>
              </div>
              <div className="permissionsStat">
                <span className="permissionsStatValue custom">
                  {Object.values(selectedUser.permissions || {}).filter(p => p?.custom).length}
                </span>
                <span className="permissionsStatLabel">Custom</span>
              </div>
            </div>
          </div>
        )}

        <div className="permissionsGrid">
          {/* User Selection Card */}
          <div className="permissionsUserCard">
            <div className="cardHeader" style={{ border: 'none', marginBottom: 0, paddingBottom: 0 }}>
              <h3 className="cardTitle">👥 Select User</h3>
            </div>
            <p className="cardDescription">
              Click on a user to manage their dashboard permissions
            </p>
            <div className="permissionsUserList">
              {users.map((user) => (
                <button
                  key={user.id}
                  className={`permissionsUserItem ${selectedUser?.id === user.id ? 'selected' : ''}`}
                  onClick={() => setSelectedUser(user)}
                >
                  <div className="permissionsUserAvatar">
                    {getInitials(user.fullName)}
                  </div>
                  <div className="permissionsUserDetails">
                    <div className="permissionsUserName">{user.fullName || 'Unknown'}</div>
                    <div className="permissionsUserEmail">{user.email}</div>
                  </div>
                  <span className={`badge badgeSmall ${getRoleBadgeClass(user.role)}`}>
                    {getRoleLabel(user.role)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Permissions Card */}
          {selectedUser && (
            <div className="permissionsDetailCard">
              <div className="cardHeader" style={{ border: 'none', marginBottom: 0, paddingBottom: 0 }}>
                <h3 className="cardTitle">📋 Dashboard Access</h3>
              </div>
              <p className="cardDescription">
                Manage dashboard permissions for <strong>{selectedUser.fullName}</strong>
              </p>
              
              {/* Note about permissions */}
              <div className="permissionsNote">
                💡 Setting to <strong>"Allow"</strong> or <strong>"Deny"</strong> creates a custom permission override. 
                <strong>"Reset"</strong> removes the override and reverts to role default.
              </div>

              <div className="permissionsList">
                {dashboards.map((dashboard) => {
                  const perm = selectedUser.permissions[dashboard.id];
                  const isCustom = perm?.custom;
                  const isAllowed = perm?.allowed;

                  return (
                    <div key={dashboard.id} className="permissionsListItem">
                      <div className="permissionsListLeft">
                        <div className="permissionsListIcon">
                          {getDashboardIcon(dashboard.id)}
                        </div>
                        <div className="permissionsListInfo">
                          <div className="permissionsListName">{dashboard.name}</div>
                          <div className="permissionsListDesc">{dashboard.description}</div>
                        </div>
                      </div>
                      <div className="permissionsListRight">
                        <span className={`permissionsBadge ${isAllowed ? 'allowed' : 'denied'}`}>
                          {isAllowed ? '✓ Allowed' : '✗ Denied'}
                        </span>
                        <span className={`permissionsSource ${isCustom ? 'custom' : 'role'}`}>
                          {isCustom ? '🎨 Custom' : '👤 Role'}
                        </span>
                        <div className="permissionsActions">
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
                              Deny
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
                              Allow
                            </button>
                          )}
                          {isCustom && (
                            <button
                              className="btn btnSmall"
                              style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                              onClick={() => resetPermission.mutate({
                                userId: selectedUser.id,
                                dashboard: dashboard.id
                              })}
                              disabled={resetPermission.isPending}
                            >
                              Reset
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Security Tips */}
        <div className="permissionsSecurityTips">
          <h4>🛡️ Admin Security Tips</h4>
          <ul>
            <li>Only grant permissions that users need for their job responsibilities</li>
            <li>Regularly review and clean up unnecessary custom permissions</li>
            <li>Use role defaults whenever possible for easier management</li>
            <li>Reset custom permissions when they no longer apply</li>
          </ul>
        </div>
      </div>
    </div>
  );
}