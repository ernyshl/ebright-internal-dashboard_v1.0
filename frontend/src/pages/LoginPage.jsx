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

  const login = useMutation({
    mutationFn: (body) => apiFetch('/api/auth/login', { method: 'POST', body }),
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
            <input
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="Enter your password"
              autoComplete="current-password"
              required
            />
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

