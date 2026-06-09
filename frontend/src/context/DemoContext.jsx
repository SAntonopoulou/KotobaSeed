import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import client from '../api/client';
import { useAuth } from './AuthContext';

// DemoContext — single source of truth for "is this session a demo?"
// across the app. Mounted in App.jsx above the Routes so the demo bar
// + tour engine can react instantly to entry / conversion / exit.
//
// We re-fetch whenever `currentUser` changes — that's the signal that
// the auth bootstrap finished (cookie + /users/me round-trip). Gating
// on `token` instead would miss the cookie-only login flow used by
// /demo/enter, where the AuthContext token toggles to '' rather than
// receiving a bearer string.

const DemoContext = createContext({
  isDemo: false,
  demoRole: null,
  hasPassword: false,
  loading: true,
  refresh: () => {},
});

export const DemoProvider = ({ children }) => {
  const { currentUser, loading: authLoading } = useAuth();
  const [state, setState] = useState({
    isDemo: false,
    demoRole: null,
    hasPassword: false,
    loading: true,
  });

  const refresh = useCallback(async () => {
    if (!currentUser) {
      setState({ isDemo: false, demoRole: null, hasPassword: false, loading: false });
      return;
    }
    try {
      const res = await client.get('/demo/me');
      setState({
        isDemo: Boolean(res.data?.is_demo),
        demoRole: res.data?.demo_role || null,
        hasPassword: Boolean(res.data?.has_password),
        loading: false,
      });
    } catch {
      // 401 or anything else — treat as not-demo.
      setState({ isDemo: false, demoRole: null, hasPassword: false, loading: false });
    }
  }, [currentUser]);

  useEffect(() => {
    // Don't fetch until the auth bootstrap has settled — otherwise the
    // initial render fires /demo/me before the cookie is even read.
    if (authLoading) return;
    refresh();
  }, [authLoading, refresh]);

  return (
    <DemoContext.Provider value={{ ...state, refresh }}>
      {children}
    </DemoContext.Provider>
  );
};

export const useDemo = () => useContext(DemoContext);
