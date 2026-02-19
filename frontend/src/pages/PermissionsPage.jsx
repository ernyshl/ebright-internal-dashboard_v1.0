import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { useAllPermissions } from '../lib/permissions';

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

  if (isLoading) {
    return (
      <div className="stack">
        <div className="pageHeader">
          <div className="pageHeaderTitle">Permissions Management</div>
        </div>
        <div className="card">
          <div className="loadingCard">
            <div className="loadingDots"><span /><span /><span /></div> Loading...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="pageHeader">
        <div>
          <div className="pageHeaderTitle">Permissions Management</div>
          <div className="pageHeaderSub">Control which dashboards each user can access</div>
        </div>
      </div>

      {/* User Selection */}
      <div className="card">
        <div className="cardTitle">Select User</div>
        <div className="permissionsGrid">
          {users.map((user) => (
            <button
              key={user.id}
              className={`permissionUserCard ${selectedUser?.id === user.id ? 'selected' : ''}`}
              onClick={() => setSelectedUser(user)}
            >
              <div className="permissionUserAvatar">
                {user.fullName?.charAt(0) || user.email?.charAt(0) || '?'}
              </div>
              <div className="permissionUserInfo">
                <div className="permissionUserName">{user.fullName || 'Unknown'}</div>
                <div className="permissionUserEmail">{user.email}</div>
                <div className="permissionUserRole">{user.role}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Permissions for Selected User */}
      {selectedUser && (
        <div className="card">
          <div className="cardTitle">
            Dashboard Access for {selectedUser.fullName || selectedUser.email}
          </div>
          <div className="permissionsTableWrapper">
            <table className="permissionsTable">
              <thead>
                <tr>
                  <th>Dashboard</th>
                  <th>Access</th>
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
                          <span>{dashboard.name}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`permissionStatus ${isAllowed ? 'allowed' : 'denied'}`}>
                          {isAllowed ? '✓ Allowed' : '✗ Denied'}
                        </span>
                      </td>
                      <td>
                        <span className={`permissionSource ${isCustom ? 'custom' : 'role'}`}>
                          {isCustom ? 'Custom' : 'Role Default'}
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
                              className="btn btnSmall btnSecondary"
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
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="permissionLegend">
            <p><strong>Source:</strong> "Role Default" means the access is inherited from the user's role. "Custom" means you have manually set this permission.</p>
            <p><strong>Reset:</strong> Removes custom permission and reverts to role default.</p>
          </div>
        </div>
      )}
    </div>
  );
}