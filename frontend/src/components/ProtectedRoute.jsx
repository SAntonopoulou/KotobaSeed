import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Auth gate. Sources auth state from AuthContext rather than localStorage
// so the shared .kotobaseed.net cookie can carry a session from one
// subdomain to another — localStorage is per-origin and would defeat SSO.
const ProtectedRoute = () => {
  const { currentUser, loading } = useAuth();

  if (loading) {
    return <div className="p-10 text-center text-kotoba-text/60 text-sm">Loading…</div>;
  }
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
};

export default ProtectedRoute;
