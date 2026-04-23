import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { getUser } from '../lib/auth';
import { BackButton } from '../components/BackButton';
import { getRoleLabel, getRoleBadgeClass } from '../lib/roles';

export function ProfilePage() {
  const queryClient = useQueryClient();
  const currentUser = getUser();
  const [formData, setFormData] = useState({
    fullName: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['profile', currentUser?.id],
    queryFn: () => apiFetch('/api/auth/profile'),
  });

  const updateProfile = useMutation({
    mutationFn: (body: any) => apiFetch('/api/auth/profile', { method: 'PUT', body }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
      setMessage(result.message || 'Profile updated successfully');
      setError('');
      setFormData({
        fullName: result.user?.fullName || '',
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
      setTimeout(() => setMessage(''), 5000);
    },
    onError: (err: any) => {
      setError(err.data?.error || err.message || 'Failed to update profile');
      setMessage('');
    },
  });

  // Initialize form with user data once loaded
  useEffect(() => {
    if (data?.user?.fullName) {
      setFormData(prev => ({ ...prev, fullName: data.user.fullName }));
    }
  }, [data]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleUpdateProfile = (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    // Validate
    if (!formData.fullName.trim()) {
      setError('Name is required');
      return;
    }

    // If changing password
    if (formData.newPassword || formData.currentPassword) {
      if (!formData.currentPassword) {
        setError('Current password is required to change password');
        return;
      }
      if (!formData.newPassword) {
        setError('New password is required');
        return;
      }
      if (formData.newPassword !== formData.confirmPassword) {
        setError('New passwords do not match');
        return;
      }
      if (formData.newPassword.length < 8) {
        setError('New password must be at least 8 characters');
        return;
      }
    }

    const body: any = { fullName: formData.fullName };
    if (formData.newPassword) {
      body.currentPassword = formData.currentPassword;
      body.newPassword = formData.newPassword;
    }

    updateProfile.mutate(body);
  };

  // Get initials for avatar
  const getInitials = (name) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  if (isLoading) {
    return (
      <div className="dashboardPage">
        <div className="loadingState">
          <div className="spinner"></div>
          <p>Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboardPage">
      <div className="dashboardHeader">
        <BackButton to="/" label="Back to Home" />
        <h1 className="pageHeaderTitle" style={{ marginTop: 16 }}>👤 My Profile</h1>
        <p className="headerSubtitle">Manage your account settings and preferences</p>
      </div>

      <div className="dashboardContent">
        {/* Profile Header Card */}
        <div className="profileHeaderCard">
          <div className="profileAvatarLarge">
            {getInitials(formData.fullName || currentUser?.fullName)}
          </div>
          <div className="profileHeaderInfo">
            <h2 className="profileName">{formData.fullName || currentUser?.fullName}</h2>
            <p className="profileEmail">{currentUser?.email}</p>
            <span className={`badge ${getRoleBadgeClass(currentUser?.role)}`}>
              {getRoleLabel(currentUser?.role)}
            </span>
          </div>
        </div>

        <div className="profileGrid">
          {/* Account Information Card */}
          <div className="profileCard">
            <div className="profileCardHeader">
              <span className="profileCardIcon">📋</span>
              <h3>Account Information</h3>
            </div>
            <form onSubmit={handleUpdateProfile}>
              <div className="profileFormGroup">
                <label>Full Name</label>
                <input
                  type="text"
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleChange}
                  className="profileInput"
                  placeholder="Enter your full name"
                />
              </div>

              <div className="profileFormGroup">
                <label>Email Address</label>
                <input
                  type="email"
                  value={currentUser?.email || ''}
                  disabled
                  className="profileInput profileInputDisabled"
                />
                <span className="profileInputHint">📧 Email cannot be changed</span>
              </div>

              <div className="profileFormGroup">
                <label>Role</label>
                <input
                  type="text"
                  value={getRoleLabel(currentUser?.role)}
                  disabled
                  className="profileInput profileInputDisabled"
                />
                <span className="profileInputHint">🔐 Role assigned by administrator</span>
              </div>

              {/* Messages */}
              {error && (
                <div className="profileAlert profileAlertError">
                  <span>⚠️</span> {error}
                </div>
              )}

              {message && (
                <div className="profileAlert profileAlertSuccess">
                  <span>✅</span> {message}
                </div>
              )}

              <button
                type="submit"
                className="btn btnPrimary profileSaveBtn"
                disabled={updateProfile.isPending}
              >
                {updateProfile.isPending ? '💾 Saving...' : '💾 Save Changes'}
              </button>
            </form>
          </div>

          {/* Change Password Card */}
          <div className="profileCard">
            <div className="profileCardHeader">
              <span className="profileCardIcon">🔒</span>
              <h3>Change Password</h3>
            </div>
            <form onSubmit={handleUpdateProfile}>
              <p className="profileCardDesc">
                Leave password fields empty if you don't want to change your password.
              </p>

              <div className="profileFormGroup">
                <label>Current Password</label>
                <input
                  type="password"
                  name="currentPassword"
                  value={formData.currentPassword}
                  onChange={handleChange}
                  className="profileInput"
                  placeholder="Enter current password"
                />
              </div>

              <div className="profileFormGroup">
                <label>New Password</label>
                <input
                  type="password"
                  name="newPassword"
                  value={formData.newPassword}
                  onChange={handleChange}
                  className="profileInput"
                  placeholder="Enter new password"
                />
                {formData.newPassword && (
                  <span className="profileInputHint passwordHint">
                    🔑 Must be 8+ chars with uppercase, lowercase, number & special char
                  </span>
                )}
              </div>

              <div className="profileFormGroup">
                <label>Confirm New Password</label>
                <input
                  type="password"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  className="profileInput"
                  placeholder="Confirm new password"
                />
              </div>

              {/* Messages */}
              {error && (
                <div className="profileAlert profileAlertError">
                  <span>⚠️</span> {error}
                </div>
              )}

              {message && (
                <div className="profileAlert profileAlertSuccess">
                  <span>✅</span> {message}
                </div>
              )}

              <button
                type="submit"
                className="btn btnSecondary profileSaveBtn"
                disabled={updateProfile.isPending}
              >
                {updateProfile.isPending ? '💾 Updating...' : '🔑 Update Password'}
              </button>
            </form>
          </div>
        </div>

        {/* Security Tips */}
        <div className="profileSecurityTips">
          <h4>🛡️ Security Tips</h4>
          <ul>
            <li>Use a strong password with at least 8 characters</li>
            <li>Include uppercase, lowercase, numbers, and special characters</li>
            <li>Don't share your password with anyone</li>
            <li>Change your password regularly for better security</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
