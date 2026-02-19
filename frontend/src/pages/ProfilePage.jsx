import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { getUser } from '../lib/auth';
import { BackButton } from '../components/BackButton';

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
    queryKey: ['profile', currentUser.sub],
    queryFn: () => apiFetch('/api/auth/profile'),
  });

  const updateProfile = useMutation({
    mutationFn: (body) => apiFetch('/api/auth/profile', { method: 'PUT', body }),
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
    onError: (err) => {
      setError(err.data?.error || err.message || 'Failed to update profile');
      setMessage('');
    },
  });

  // Initialize form with user data
  if (data && formData.fullName === '') {
    setFormData(prev => ({
      ...prev,
      fullName: data.user?.fullName || '',
    }));
  }

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

    const body = { fullName: formData.fullName };
    if (formData.newPassword) {
      body.currentPassword = formData.currentPassword;
      body.newPassword = formData.newPassword;
    }

    updateProfile.mutate(body);
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
        <h1 style={{ marginTop: 16 }}>Edit Profile</h1>
        <p className="headerSubtitle">Update your personal information</p>
      </div>

      <div className="dashboardContent">
        <div className="pageCard" style={{ maxWidth: '500px' }}>
          <form onSubmit={handleUpdateProfile}>
            {/* User Info */}
            <div className="formSection">
              <h3>Account Information</h3>
              <div className="formGroup">
                <label>Email</label>
                <input
                  type="email"
                  value={currentUser.email}
                  disabled
                  className="formInput"
                  style={{ opacity: 0.6 }}
                />
                <small style={{ color: 'var(--muted)' }}>Email cannot be changed</small>
              </div>

              <div className="formGroup">
                <label>Role</label>
                <input
                  type="text"
                  value={currentUser.role}
                  disabled
                  className="formInput"
                  style={{ opacity: 0.6, textTransform: 'capitalize' }}
                />
                <small style={{ color: 'var(--muted)' }}>Role assigned by administrator</small>
              </div>

              <div className="formGroup">
                <label>Full Name</label>
                <input
                  type="text"
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleChange}
                  className="formInput"
                  placeholder="Enter your full name"
                />
              </div>
            </div>

            {/* Change Password */}
            <div className="formSection" style={{ marginTop: '32px' }}>
              <h3>Change Password</h3>
              <p className="headerSubtitle" style={{ marginBottom: '16px' }}>
                Leave blank if you don't want to change your password
              </p>

              <div className="formGroup">
                <label>Current Password</label>
                <input
                  type="password"
                  name="currentPassword"
                  value={formData.currentPassword}
                  onChange={handleChange}
                  className="formInput"
                  placeholder="Enter your current password"
                />
              </div>

              <div className="formGroup">
                <label>New Password</label>
                <input
                  type="password"
                  name="newPassword"
                  value={formData.newPassword}
                  onChange={handleChange}
                  className="formInput"
                  placeholder="Enter new password (min 8 chars)"
                />
                {formData.newPassword && (
                  <small style={{ color: 'var(--muted)' }}>
                    Must contain: uppercase, lowercase, number, special character
                  </small>
                )}
              </div>

              <div className="formGroup">
                <label>Confirm New Password</label>
                <input
                  type="password"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  className="formInput"
                  placeholder="Confirm new password"
                />
              </div>
            </div>

            {/* Messages */}
            {error && (
              <div className="errorState" style={{ marginTop: '16px' }}>
                <p>{error}</p>
              </div>
            )}

            {message && (
              <div style={{
                marginTop: '16px',
                padding: '12px',
                background: 'var(--successLight)',
                border: '1px solid var(--success)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--success)',
                fontSize: '14px',
              }}>
                {message}
              </div>
            )}

            {/* Submit Button */}
            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button
                type="submit"
                className="btn btnPrimary"
                disabled={updateProfile.isPending}
              >
                {updateProfile.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
