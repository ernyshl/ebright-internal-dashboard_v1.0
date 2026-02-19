const TOKEN_KEY = 'dashboard_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

// Decode JWT token to get user info (without verification - just for display)
export function getUser() {
  const token = getToken();
  if (!token) return null;
  
  try {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(atob(payload));
    
    // Check token expiration
    if (decoded.exp && Date.now() >= decoded.exp * 1000) {
      clearToken();
      return null;
    }
    
    return {
      id: decoded.sub,
      email: decoded.email,
      fullName: decoded.fullName,
      role: decoded.role,
      expiresAt: decoded.exp ? new Date(decoded.exp * 1000) : null,
    };
  } catch {
    return null;
  }
}

