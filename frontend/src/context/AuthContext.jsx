import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import client from '../api/client'; // Import the configured axios client

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    // Try /users/me unconditionally — the shared .kotobaseed.net cookie
    // may carry auth even when this subdomain's localStorage is empty
    // (first visit after logging in on the apex, or vice-versa).
    try {
      const response = await client.get('/users/me');
      setCurrentUser(response.data);
      return response.data;
    } catch (_) {
      // Genuinely not signed in OR token rejected. Either way, wipe any
      // stale localStorage token so the UI shows the logged-out state.
      localStorage.removeItem('token');
      setToken((t) => (t === null ? t : null));
      setCurrentUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refreshUser();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [token, refreshUser]);

  // Re-verify the session every time the user comes back to a tab.
  // Without this, logging out on the apex would leave a stale "logged in"
  // UI on the tutor subdomain tab until the user manually refreshed.
  useEffect(() => {
    const onFocus = () => {
      refreshUser();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') onFocus();
    });
    return () => {
      window.removeEventListener('focus', onFocus);
    };
  }, [refreshUser]);

  const login = (newToken) => {
    if (newToken) {
      localStorage.setItem('token', newToken);
      setToken(newToken);
    } else {
      // Cookie-only login path — re-trigger the bootstrap effect.
      setToken((t) => (t === null ? '' : null));
    }
  };

  const logout = async () => {
    // Drop the shared cookie server-side, then wipe local state.
    try {
      await client.post('/auth/logout');
    } catch (_) {
      // Non-fatal — even if the server call fails (e.g. offline), wipe
      // local state so the UI flips to logged-out immediately.
    }
    localStorage.removeItem('token');
    setToken(null);
    setCurrentUser(null);
  };

  const value = {
    currentUser,
    token,
    login,
    logout,
    loading,
    setCurrentUser
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
};
