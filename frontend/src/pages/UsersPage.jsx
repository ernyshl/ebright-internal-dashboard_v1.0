import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { getUser } from '../lib/auth';
import { useAllPermissions } from '../lib/permissions';

// Available roles for the company
const ROLES = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'ceo', label: 'CEO' },
  { value: 'rm', label: 'RM' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'od', label: 'OD' },
  { value: 'hr', label: 'HR' },
];

const ROLE_BADGE = {
  super_admin: 'badgeExecutive',
  ceo: 'badgeExecutive',
  marketing: 'badgeMarketing',
  od: 'badgeSales',
  rm: 'badgeSales',
  hr: 'badgeSales',
};

const AVATAR_COLORS = ['avatarBrand', 'avatarBlue', 'avatarGreen', 'avatarPurple'];

function getRoleLabel(value) {
  const role = ROLES.find(r => r.value === value);
  return role ? role.label : value;
}

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-MY', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

export function UsersPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState({ email: '', password: '', fullName: '', role: 'marketing' });
  const [showPermissions, setShowPermissions] = useState(false);
  const [selectedUserForPerms, setSelectedUserForPerms] = useState(null);
  const [permMessage, setPermMessage] = useState(null);

  const currentUser = getUser();
  const isSuperAdmin = currentUser?.role === 'super_admin';

  const users = useQuery({
    queryKey: ['users'],
    queryFn: () => apiFetch('/api/users'),
  });

  // Permissions data for super admin
  const { users: allUsers, dashboards: apiDashboards } = useAllPermissions();
  
  // Fallback dashboards in case API fails
  const dashboards = apiDashboards && apiDashboards.length > 0 ? apiDashboards : [
    { id: 'marketing', name: 'Marketing', icon: '📈' },
    { id: 'finance', name: 'Finance', icon: '💰' },
    { id: 'operations', name: 'Operations', icon: '⚙️' },
    { id: 'department', name: 'Department', icon: '✅' },
    { id: 'hr', name: 'HR', icon: '👥' },
  ];

  const createUser = useMutation({
    mutationFn: (body) => apiFetch('/api/users', { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setShowForm(false);
      setForm({ email: '', password: '', fullName: '', role: 'marketing' });
    },
  });

  const updateUser = useMutation({
    mutationFn: ({ id, data }) => apiFetch(`/api/users/${id}`, { method: 'PUT', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setEditingUser(null);
      setForm({ email: '', password: '', fullName: '', role: 'marketing' });
    },
  });

  const toggleUser = useMutation({
    mutationFn: (id) => apiFetch(`/api/users/${id}/toggle`, { method: 'PATCH' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  // Permission mutations
  const updatePermission = useMutation({
    mutationFn: ({ userId, dashboard, allowed }) => 
      apiFetch(`/api/permissions/${userId}`, { 
        method: 'PUT', 
        body: { dashboard, allowed } 
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-permissions'] });
      setPermMessage({ type: 'success', text: 'Permission updated successfully!' });
      setTimeout(() => setPermMessage(null), 3000);
    },
    onError: (error) => {
      setPermMessage({ type: 'error', text: 'Failed: ' + (error?.data?.error || 'Unknown error') });
      setTimeout(() => setPermMessage(null), 5000);
    },
  });

  const resetPermission = useMutation({
    mutationFn: ({ userId, dashboard }) => 
      apiFetch(`/api/permissions/${userId}/${dashboard}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-permissions'] });
      setPermMessage({ type: 'success', text: 'Permission reset to role default!' });
      setTimeout(() => setPermMessage(null), 3000);
    },
    onError: (error) => {
      setPermMessage({ type: 'error', text: 'Failed: ' + (error?.data?.error || 'Unknown error') });
      setTimeout(() => setPermMessage(null), 5000);
    },
  });

  const userList = users.data?.users || [];
  const activeCount = userList.filter(u => u.is_active).length;

  // Get permissions for selected user - handle case when API hasn't loaded
  const getUserPermissions = (userId) => {
    // First check if we have data from API
    if (allUsers && allUsers.length > 0 && dashboards.length > 0) {
      const userPerms = allUsers.find(u => u.id === userId);
      if (userPerms && userPerms.permissions) {
        return userPerms.permissions;
      }
    }
    
    // Fallback: return role-based defaults
    const selectedUser = userList.find(u => u.id === userId);
    const role = selectedUser?.role || 'marketing';
    const roleDefaults = {
      super_admin: ['marketing', 'finance', 'operations', 'department'],
      ceo: ['marketing', 'finance', 'operations', 'department'],
      rm: ['operations'],
      marketing: ['marketing'],
      od: ['operations'],
      hr: ['department'],
    };
    const defaults = roleDefaults[role] || [];
    const perms = {};
    dashboards.forEach(d => {
      perms[d.id] = { allowed: defaults.includes(d.id), custom: false, fromRole: true };
    });
    return perms;
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    setForm({
      email: user.email,
      password: '',
      fullName: user.full_name || '',
      role: user.role,
    });
    setShowForm(true);
  };

  const handleManagePermissions = (user) => {
    setSelectedUserForPerms(user);
    setShowPermissions(true);
  };

  const handleCreateNew = () => {
    setEditingUser(null);
    setForm({ email: '', password: '', fullName: '', role: 'marketing' });
    setShowForm(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingUser) {
      // Only send fields that are filled
      const data = {};
      if (form.fullName) data.fullName = form.fullName;
      if (form.email) data.email = form.email;
      if (form.role) data.role = form.role;
      if (form.password) data.password = form.password;
      updateUser.mutate({ id: editingUser.id, data });
    } else {
      createUser.mutate(form);
    }
  };

  return (
    <div className="stack">
      <div className="pageHeader">
        <div>
          <div className="pageHeaderTitle">User Management</div>
          <div className="pageHeaderSub">{userList.length} total users · {activeCount} active</div>
        </div>
        {isSuperAdmin && (
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btnPrimary" onClick={handleCreateNew}>
              {showForm ? '✕ Cancel' : '+ Add User'}
            </button>
          </div>
        )}
      </div>

      {/* Create/Edit user form */}
      {showForm && isSuperAdmin && (
        <div className="card">
          <div className="cardTitle">{editingUser ? 'Edit User' : 'Create New User'}</div>
          <div className="cardDescription">{editingUser ? 'Update user details' : 'Add a new staff member to the dashboard'}</div>
          <form
            onSubmit={handleSubmit}
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}
          >
            <label className="field">
              <div className="label">Full Name</div>
              <input
                className="input"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                placeholder="John Doe"
                required={!editingUser}
              />
            </label>
            <label className="field">
              <div className="label">Email</div>
              <input
                className="input"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="john@ebright.com"
                required={!editingUser}
              />
            </label>
            <label className="field">
              <div className="label">Password {editingUser && '(leave blank to keep current)'}</div>
              <input
                className="input"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder={editingUser ? 'New password (optional)' : 'Min 6 characters'}
                required={!editingUser}
                minLength={6}
              />
            </label>
            <label className="field">
              <div className="label">Role</div>
              <select
                className="input"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                {ROLES.map(role => (
                  <option key={role.value} value={role.value}>{role.label}</option>
                ))}
              </select>
            </label>
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, alignItems: 'center' }}>
              <button className="btn btnPrimary" type="submit" disabled={createUser.isPending || updateUser.isPending}>
                {editingUser
                  ? (updateUser.isPending ? 'Saving…' : 'Save Changes')
                  : (createUser.isPending ? 'Creating…' : 'Create User')}
              </button>
              {createUser.isError && (
                <span className="errorText" style={{ padding: '6px 12px', fontSize: 12 }}>
                  {createUser.error?.data?.error || 'Failed to create user'}
                </span>
              )}
              {updateUser.isError && (
                <span className="errorText" style={{ padding: '6px 12px', fontSize: 12 }}>
                  {updateUser.error?.data?.error || 'Failed to update user'}
                </span>
              )}
              {createUser.isSuccess && (
                <span className="successText" style={{ padding: '6px 12px', fontSize: 12 }}>
                  User created successfully!
                </span>
              )}
              {updateUser.isSuccess && (
                <span className="successText" style={{ padding: '6px 12px', fontSize: 12 }}>
                  User updated successfully!
                </span>
              )}
            </div>
          </form>
        </div>
      )}

      {/* Users table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {users.isLoading ? (
          <div className="loadingCard"><div className="loadingDots"><span /><span /><span /></div> Loading users…</div>
        ) : users.isError ? (
          <div style={{ padding: 20 }}>
            <div className="errorText">{users.error?.data?.error || 'Failed to load users. You may not have permission.'}</div>
          </div>
        ) : (
          <div className="tableWrap" style={{ border: 'none', borderRadius: 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Joined</th>
                  {isSuperAdmin && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {userList.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: 30 }} className="muted">No users found</td></tr>
                ) : userList.map((u, i) => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className={`avatar ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}>
                          {getInitials(u.full_name)}
                        </div>
                        <span style={{ fontWeight: 600 }}>{u.full_name || '—'}</span>
                      </div>
                    </td>
                    <td>{u.email}</td>
                    <td><span className={`badge ${ROLE_BADGE[u.role] || ''}`}>{getRoleLabel(u.role)}</span></td>
                    <td>
                      <span className={`badge ${u.is_active ? 'badgeActive' : 'badgeInactive'}`}>
                        {u.is_active ? '● Active' : '○ Inactive'}
                      </span>
                    </td>
                    <td className="muted">{formatDate(u.created_at)}</td>
                    {isSuperAdmin && (
                      <td>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            className="btn btnSmall btnSecondary"
                            onClick={() => handleManagePermissions(u)}
                          >
                            Permissions
                          </button>
                          <button
                            className="btn btnSmall btnSecondary"
                            onClick={() => handleEdit(u)}
                          >
                            Edit
                          </button>
                          <button
                            className={`btn btnSmall ${u.is_active ? 'btnDanger' : 'btnSuccess'}`}
                            onClick={() => toggleUser.mutate(u.id)}
                            disabled={toggleUser.isPending}
                          >
                            {u.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Permissions Modal */}
      {showPermissions && selectedUserForPerms && (
        <div className="modalOverlay" onClick={() => setShowPermissions(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 700 }}>
            <div className="modalHeader">
              <div className="modalTitle">Manage Permissions</div>
              <button className="modalClose" onClick={() => setShowPermissions(false)}>✕</button>
            </div>
            <div className="modalBody">
              <div style={{ marginBottom: 20, padding: 15, background: '#f8fafc', borderRadius: 8 }}>
                <strong>User:</strong> {selectedUserForPerms.full_name}<br />
                <strong>Email:</strong> {selectedUserForPerms.email}<br />
                <strong>Role:</strong> {getRoleLabel(selectedUserForPerms.role)}
              </div>
              
              {/* Show table with fallback dashboards */}
              {dashboards.length === 0 ? (
                <div className="loadingCard"><div className="loadingDots"><span /><span /><span /></div> Loading dashboards...</div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Dashboard</th>
                      <th>Access</th>
                      <th>Type</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboards.map(dashboard => {
                      const userPerms = getUserPermissions(selectedUserForPerms.id);
                      const perm = userPerms[dashboard.id] || {};
                      const isAllowed = perm.allowed !== undefined ? perm.allowed : false;
                      const isCustom = perm.custom || false;
                      const effectiveFrom = perm.fromRole ? 'Role Default' : (isCustom ? 'Custom' : 'Default');

                      return (
                        <tr key={dashboard.id}>
                          <td>
                            <span style={{ fontWeight: 600 }}>{dashboard.icon} {dashboard.name}</span>
                          </td>
                          <td>
                            <span className={`badge ${isAllowed ? 'badgeActive' : 'badgeInactive'}`}>
                              {isAllowed ? '✓ Allowed' : '✗ Denied'}
                            </span>
                          </td>
                          <td className="muted" style={{ fontSize: 12 }}>{effectiveFrom}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button 
                                className="btn btnSmall btnSuccess"
                                onClick={() => updatePermission.mutate({ 
                                  userId: selectedUserForPerms.id, 
                                  dashboard: dashboard.id, 
                                  allowed: true 
                                })}
                                disabled={isAllowed}
                              >
                                Allow
                              </button>
                              <button 
                                className="btn btnSmall btnDanger"
                                onClick={() => updatePermission.mutate({ 
                                  userId: selectedUserForPerms.id, 
                                  dashboard: dashboard.id, 
                                  allowed: false 
                                })}
                                disabled={!isAllowed}
                              >
                                Deny
                              </button>
                              {isCustom && (
                                <button 
                                  className="btn btnSmall btnSecondary"
                                  onClick={() => resetPermission.mutate({ 
                                    userId: selectedUserForPerms.id, 
                                    dashboard: dashboard.id 
                                  })}
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
              )}
              
              <div style={{ marginTop: 20, padding: 15, background: '#fef3c7', borderRadius: 8, fontSize: 13 }}>
                <strong>Note:</strong> Setting to "Allow" or "Deny" creates a custom permission override. 
                "Reset" removes the override and reverts to role default.
              </div>
              
              {/* Permission message */}
              {permMessage && (
                <div style={{ 
                  marginTop: 16, 
                  padding: 12, 
                  borderRadius: 8,
                  background: permMessage.type === 'success' ? 'var(--successLight)' : 'var(--brandLight)',
                  color: permMessage.type === 'success' ? 'var(--success)' : 'var(--brand)',
                  fontWeight: 600,
                  fontSize: 14
                }}>
                  {permMessage.text}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
