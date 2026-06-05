import React, { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import client from '../api/client';

const TeacherRoute = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const token = localStorage.getItem('token');

  useEffect(() => {
    const fetchUser = async () => {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const response = await client.get('/users/me');
        setUser(response.data);
      } catch (error) {
        console.error("Failed to fetch user", error);
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, [token]);

  if (!token) {
    return <Navigate to="/" replace />;
  }

  if (loading) return <div className="p-10 text-center">Loading...</div>;

  if (!user || user.role !== 'creator') {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};

export default TeacherRoute;
