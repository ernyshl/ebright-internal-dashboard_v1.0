// DEV-ONLY: shows a persistent banner when the current session was
// obtained via the /api/auth/dev-bypass endpoint. REMOVE BEFORE PRODUCTION.
import { getToken } from '../lib/auth';

function decodeTokenPayload(): any | null {
  const token = getToken();
  if (!token) return null;
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
}

export function DevBypassBanner() {
  const payload = decodeTokenPayload();
  if (!payload?.devBypass) return null;

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 9999,
        background: 'repeating-linear-gradient(45deg, #dc2626 0 16px, #7f1d1d 16px 32px)',
        color: '#fff',
        textAlign: 'center',
        fontWeight: 800,
        fontSize: 14,
        letterSpacing: 1,
        padding: '10px 16px',
        textShadow: '0 1px 2px rgba(0,0,0,0.5)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
      }}
    >
      ⚠️ DEV MODE — LOGIN BYPASSED (dev@local / super_admin) — REMOVE BYPASS BEFORE PRODUCTION ⚠️
    </div>
  );
}
