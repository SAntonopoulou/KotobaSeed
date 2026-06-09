import axios from 'axios';
import { getTenant } from '../hooks/useTenant';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  // Send/receive the shared auth cookie on cross-origin XHR. Required for
  // the apex ↔ tutor subdomain SSO: without this, the .kotobaseed.net
  // cookie isn't attached when the SPA on vasso.kotobaseed.net calls
  // api.kotobaseed.net, and the user looks logged-out on every subdomain.
  withCredentials: true,
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
    // 401 just means "not authenticated for this endpoint" — it's the
    // normal answer when AuthContext probes /users/me to detect a
    // cookie-based session, or any time an anonymous visitor hits a
    // protected route. We wipe any stale localStorage token but never
    // navigate from here: that used to bounce to '/', which becomes a
    // reload loop now that /users/me runs unconditionally on mount.
    // Page-level components handle 401 by routing the user to /login
    // when *they* know auth is required (e.g. TutorDashboard).
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token');
    }
    return Promise.reject(error);
  }
);

export default client;