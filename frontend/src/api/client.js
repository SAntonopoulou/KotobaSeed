import axios from 'axios';
import { getTenant } from '../hooks/useTenant';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
});

// Interceptor to add the JWT token + tenant header to requests.
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // In dev/test the backend honors X-Tenant-Slug to bypass Host parsing.
  // In prod the Host header carries the tenant — this header is harmless.
  const tenant = getTenant();
  if (tenant.kind === 'tutor' && tenant.slug) {
    config.headers['X-Tenant-Slug'] = tenant.slug;
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    // 401 = token invalid/expired → drop it and bounce to the apex.
    // 403 = authenticated but not authorized for this resource. This is a
    // normal answer (e.g. visiting a tutor's owner-only endpoint when you
    // aren't the owner). Components handle 403 locally; never log out on it.
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

export default client;