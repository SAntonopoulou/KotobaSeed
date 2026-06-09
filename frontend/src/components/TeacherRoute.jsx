import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Creator/teacher route gate. Authoritative source is AuthContext so the
// shared .kotobaseed.net auth cookie carries SSO across subdomains.
const TeacherRoute = () => {
  const { currentUser, loading } = useAuth();

  if (loading) {
    return <div className="p-10 text-center text-kotoba-text/60 text-sm">Loading…</div>;
  }
  if (!currentUser || currentUser.role !== 'creator') {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
};

export default TeacherRoute;
