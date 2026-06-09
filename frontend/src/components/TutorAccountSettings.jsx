import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import ConfirmationModal from './ConfirmationModal';

// IANA timezone list — try runtime API first, fall back to a curated set
// so the picker works on every browser.
const FALLBACK_TIMEZONES = [
  'UTC', 'Europe/London', 'Europe/Athens', 'Europe/Paris', 'Europe/Berlin',
  'Europe/Madrid', 'Europe/Rome', 'Europe/Lisbon', 'Europe/Amsterdam',
  'Europe/Brussels', 'Europe/Stockholm', 'Europe/Helsinki', 'Europe/Warsaw',
  'Europe/Istanbul', 'Europe/Bucharest', 'Europe/Dublin', 'Europe/Zurich',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Phoenix', 'America/Anchorage', 'America/Toronto', 'America/Vancouver',
  'America/Mexico_City', 'America/Sao_Paulo', 'America/Buenos_Aires', 'America/Bogota',
  'Asia/Tokyo', 'Asia/Seoul', 'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Singapore',
  'Asia/Bangkok', 'Asia/Jakarta', 'Asia/Manila', 'Asia/Dubai', 'Asia/Tehran',
  'Asia/Jerusalem', 'Asia/Kolkata', 'Asia/Karachi', 'Asia/Riyadh',
  'Australia/Sydney', 'Australia/Melbourne', 'Australia/Perth', 'Australia/Brisbane',
  'Pacific/Auckland', 'Pacific/Honolulu',
  'Africa/Cairo', 'Africa/Lagos', 'Africa/Johannesburg', 'Africa/Nairobi',
];

function listTimezones() {
  if (typeof Intl !== 'undefined' && typeof Intl.supportedValuesOf === 'function') {
    try {
      const all = Intl.supportedValuesOf('timeZone');
      if (Array.isArray(all) && all.length > 0) return all;
    } catch { /* fall through */ }
  }
  return FALLBACK_TIMEZONES;
}

function browserTimezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return null; }
}

// Section card chrome matches the dashboard look.
const Card = ({ title, children }) => (
  <section className="bg-white rounded-3xl shadow-soft p-6">
    {title && <h2 className="text-lg font-bold text-kotoba-primary mb-3">{title}</h2>}
    {children}
  </section>
);

const TutorAccountSettings = () => {
  const navigate = useNavigate();
  const { currentUser, setCurrentUser, logout } = useAuth();
  const { addToast } = useToast();
  const allTimezones = useMemo(() => listTimezones(), []);
  const detectedTz = useMemo(() => browserTimezone(), []);
  const [tzValue, setTzValue] = useState('');
  const [tzSaving, setTzSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (currentUser?.timezone) setTzValue(currentUser.timezone);
    else if (detectedTz) setTzValue(detectedTz);
  }, [currentUser?.timezone, detectedTz]);

  const handleSaveTimezone = async () => {
    if (!tzValue || tzValue === currentUser?.timezone) return;
    setTzSaving(true);
    try {
      const res = await client.patch('/users/me', { timezone: tzValue });
      if (typeof setCurrentUser === 'function') setCurrentUser(res.data);
      addToast('Timezone updated. Lesson times use this from now on.', 'success');
    } catch (error) {
      addToast(error.response?.data?.detail || 'Could not update timezone.', 'error');
    } finally {
      setTzSaving(false);
    }
  };

  const handleExportData = async () => {
    setExporting(true);
    try {
      const res = await client.get('/users/me/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `kotobaseed-data-export-${Date.now()}.json`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      addToast('Data export downloaded.', 'success');
    } catch (error) {
      if (error?.response?.status === 404) {
        addToast(
          "Data export endpoint isn't available yet. Email support@kotobaseed.net for a manual export.",
          'info',
        );
      } else {
        addToast(error.response?.data?.detail || 'Could not export your data.', 'error');
      }
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteOpen(false);
    try {
      await client.delete('/users/me');
      logout();
      navigate('/');
    } catch (error) {
      addToast("Could not delete your account. Try again or contact support.", 'error');
    }
  };

  return (
    <div className="space-y-6">
      <Card title="Timezone">
        <p className="text-sm text-kotoba-text/70 mb-4">
          Your availability windows are stored in this timezone. Students see lesson times converted
          to <em>their</em> browser-local zone automatically — so you don't translate.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={tzValue}
            onChange={(e) => setTzValue(e.target.value)}
            disabled={tzSaving}
            className="block w-full sm:w-auto rounded-md border border-kotoba-text/20 px-3 py-2 text-sm focus:ring-kotoba-primary focus:border-kotoba-primary"
          >
            {!allTimezones.includes(tzValue) && tzValue && (
              <option value={tzValue}>{tzValue} (current)</option>
            )}
            {allTimezones.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleSaveTimezone}
            disabled={tzSaving || !tzValue || tzValue === currentUser?.timezone}
            className="inline-flex items-center px-4 py-2 rounded-md bg-kotoba-primary text-white font-medium hover:bg-kotoba-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {tzSaving ? 'Saving…' : 'Save timezone'}
          </button>
          {detectedTz && detectedTz !== tzValue && (
            <button
              type="button"
              onClick={() => setTzValue(detectedTz)}
              className="text-sm text-kotoba-primary hover:underline"
            >
              Use my browser timezone ({detectedTz})
            </button>
          )}
        </div>
        {currentUser?.timezone && (
          <p className="mt-3 text-xs text-kotoba-text/60">
            Current saved: <span className="font-medium">{currentUser.timezone}</span>
          </p>
        )}
      </Card>

      <Card title="Account">
        <dl className="text-sm">
          <div className="flex flex-wrap gap-x-4 gap-y-2 mb-2">
            <dt className="text-kotoba-text/60 w-24 font-medium">Email</dt>
            <dd className="text-kotoba-text font-medium">{currentUser?.email}</dd>
          </div>
          {currentUser?.email_verified_at && (
            <div className="flex flex-wrap gap-x-4 gap-y-2 mb-2">
              <dt className="text-kotoba-text/60 w-24 font-medium">Verified</dt>
              <dd className="text-kotoba-text">Yes</dd>
            </div>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-2 mb-4">
            <dt className="text-kotoba-text/60 w-24 font-medium">Role</dt>
            <dd className="text-kotoba-text">{
              currentUser?.role === 'creator' ? 'Tutor'
                : currentUser?.role === 'admin' ? 'Administrator'
                : currentUser?.role === 'student' ? 'Student'
                : currentUser?.role || '—'
            }</dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigate('/forgot-password')}
            className="inline-flex items-center px-3 py-2 rounded-md border border-kotoba-text/20 text-sm text-kotoba-text hover:bg-kotoba-background"
          >
            Change password
          </button>
        </div>
      </Card>

      <Card title="Your data & privacy">
        <p className="text-sm text-kotoba-text/70 mb-4">
          Under GDPR you can request a copy of your data at any time, and you can permanently delete
          your account. Deleting your account removes your tutor profile, content, and student
          relationships. It cannot be undone.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleExportData}
            disabled={exporting}
            className="inline-flex items-center px-3 py-2 rounded-md border border-kotoba-text/20 text-sm text-kotoba-text hover:bg-kotoba-background disabled:opacity-50"
          >
            {exporting ? 'Preparing…' : 'Download my data'}
          </button>
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="inline-flex items-center px-3 py-2 rounded-md border border-red-300 text-sm text-red-700 hover:bg-red-50"
          >
            Delete my account
          </button>
        </div>
      </Card>

      <ConfirmationModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDeleteAccount}
        title="Delete your account?"
        message="This permanently removes your tutor profile, your modules, articles, bookings history, and your relationship with all current and past students. It can't be undone."
        confirmLabel="Yes, delete my account"
      />
    </div>
  );
};

export default TutorAccountSettings;
