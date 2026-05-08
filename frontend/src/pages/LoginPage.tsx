import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { setToken } from '../lib/auth';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const login = useMutation({
    mutationFn: (body: any) => apiFetch('/api/auth/login', { method: 'POST', body }),
    onSuccess: (data) => {
      setToken(data.token);
      const to = location.state?.from || '/';
      navigate(to, { replace: true });
    },
  });

  return (
    <div className="authShell">
      <div className="authCard">
        <div className="authHeader">
          <img src="/OD LOGO.png" alt="OD Logo" style={{ width: 56, height: 56, objectFit: 'contain' }} />
          <div className="authHeaderText">
            <div className="authTitle">Ebright Dashboard</div>
            <div className="authSubtitle">Sign in to access the portal</div>
          </div>
        </div>

        {login.isError && (
          <div className="errorText" style={{ marginBottom: 20 }}>
            {login.error?.data?.error || 'Login failed. Check your credentials and try again.'}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            login.mutate({ email, password });
          }}
          className="form"
        >
          <label className="field">
            <div className="label">Email Address</div>
            <input
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="username"
              required
            />
          </label>

          <label className="field">
            <div className="label">Password</div>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
              <input
                className="input"
                style={{ paddingRight: 40 }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: 12,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 4,
                  color: 'var(--muted)',
                }}
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                )}
              </button>
            </div>
          </label>

          <button
            className="btn btnPrimary btnLarge"
            style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
            disabled={login.isPending}
          >
            {login.isPending ? (
              <span className="loadingDots"><span></span><span></span><span></span></span>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 28, color: 'var(--muted)', fontSize: 12 }}>
          Ebright Sdn. Bhd. No: 202101030304 (1430604-A)<br />
          All Rights Reserved. Terms and Conditions
        </div>
      </div>
    </div>
  );
}

