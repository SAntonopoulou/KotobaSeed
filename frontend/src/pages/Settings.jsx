import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import client from '../api/client';
import ConfirmationModal from '../components/ConfirmationModal';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext'; // useAuth is already imported
import { formatDateShort } from '../utils/dates';

// IANA timezone names — primary fallback list. We try the runtime API
// `Intl.supportedValuesOf('timeZone')` first (every modern browser
// + Node 22+ supports it). The static list keeps the picker usable on
// older runtimes that don't yet implement the spec.
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
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

const Settings = () => {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { currentUser, token, logout, setCurrentUser } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [verifications, setVerifications] = useState([]);
  const [newVerification, setNewVerification] = useState({ language: '', document_url: '' });
  const [myGroups, setMyGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tzValue, setTzValue] = useState('');
  const [tzSaving, setTzSaving] = useState(false);
  const allTimezones = useMemo(() => listTimezones(), []);
  const detectedTz = useMemo(() => browserTimezone(), []);

  useEffect(() => {
    if (currentUser?.timezone) setTzValue(currentUser.timezone);
    else if (detectedTz) setTzValue(detectedTz);
  }, [currentUser?.timezone, detectedTz]);

  const fetchPageData = useCallback(async () => {
    if (!currentUser) return;
    try {
      if (currentUser.role === 'tutor') {
        const verificationsRes = await client.get('/verifications/');
        setVerifications(verificationsRes.data);
      }
      const myGroupsRes = await client.get('/language-groups/me');
      setMyGroups(myGroupsRes.data);
    } catch (error) {
      console.error("Failed to fetch page data", error);
      addToast("Could not load page data.", "error");
    } finally {
      setLoading(false);
    }
  }, [addToast, currentUser]);

  useEffect(() => {
    fetchPageData();
  }, [fetchPageData]);

  const handleDeleteAccount = async () => {
    setModalOpen(false);
    try {
      await client.delete('/users/me');
      // Route the sign-out through AuthContext so the WS connections
      // and the rest of the context-aware surface release cleanly
      // instead of waiting for the reload to tear them down.
      logout();
      navigate('/');
    } catch (error) {
      addToast("Could not delete your account. Try again or contact support.", 'error');
    }
  };

  const handleSaveTimezone = async () => {
    if (!tzValue || tzValue === currentUser?.timezone) return;
    setTzSaving(true);
    try {
      const res = await client.patch('/users/me', { timezone: tzValue });
      if (typeof setCurrentUser === 'function') setCurrentUser(res.data);
      addToast('Timezone updated. Lesson times will use this from now on.', 'success');
    } catch (error) {
      addToast(
        error.response?.data?.detail || 'Could not update timezone.',
        'error',
      );
    } finally {
      setTzSaving(false);
    }
  };

  const handleStripeOnboarding = async () => {
    try {
      const response = await client.post('/users/stripe-onboarding-link');
      window.location.href = response.data.onboarding_url;
    } catch (error) {
      console.error("Stripe onboarding failed", error);
      addToast("Could not start Stripe onboarding. Please try again.", "error");
    }
  };

  const handleManageSubscription = async () => {
    try {
      const response = await client.get('/subscriptions/customer-portal'); // Use client.get and correct path
      if (response.data.url) {
        window.location.href = response.data.url;
      }
    } catch (error) {
      console.error('Error fetching customer portal:', error);
      addToast('Could not open subscription management.', 'error');
    }
  };

  const handleVerificationSubmit = async (e) => {
    e.preventDefault();
    if (!newVerification.language.trim() || !newVerification.document_url.trim()) {
      addToast("Please fill out both fields.", "error");
      return;
    }
    try {
      await client.post('/verifications/', newVerification);
      addToast("Verification request submitted!", "success");
      setNewVerification({ language: '', document_url: '' });
      fetchPageData(); // Refresh verifications list
    } catch (error) {
      addToast(error.response?.data?.detail || "Failed to submit request.", "error");
    }
  };

  const handleLeaveGroup = async (groupId) => {
    try {
      await client.delete(`/language-groups/${groupId}/join`);
      addToast("Successfully left group.", "success");
      fetchPageData();
    } catch (error) {
      addToast("Failed to leave group.", "error");
    }
  };

  const getStatusClasses = (status) => {
    switch (status) {
      case 'approved': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-kotoba-background/60 text-kotoba-text/90';
    }
  };

  if (loading) return <div>Loading...</div>;
  if (!currentUser) return <div>Please log in to view your settings.</div>;

  const isProTeacher =
    currentUser.role === 'tutor' &&
    (currentUser.subscription_tier === 'pro' || currentUser.subscription_tier === 'business');
  const tier = currentUser.subscription_tier || 'free';
  const tierLabel = tier === 'free' || tier === 'none' ? 'Free' : tier.charAt(0).toUpperCase() + tier.slice(1);
  const onPaidTier = tier !== 'free' && tier !== 'none';

  return (
    <div className="font-sans max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <header className="mb-10">
        <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark">
          Account
        </p>
        <h1 className="mt-2 font-display text-4xl font-bold text-kotoba-primary leading-tight tracking-[-0.02em]">
          Settings
        </h1>
      </header>

      <div className="bg-white shadow-soft rounded-3xl overflow-hidden mb-6">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-kotoba-text">Subscription</h3>
          <div className="mt-2 max-w-xl text-sm text-kotoba-text/60">
            <p>
              You're on the <span className="font-semibold">{tierLabel}</span> plan.
              {onPaidTier && currentUser.subscription_expires_at && (
                <>
                  {' '}Renews on{' '}
                  <span className="font-medium">
                    {formatDateShort(currentUser.subscription_expires_at)}
                  </span>.
                </>
              )}
            </p>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {onPaidTier ? (
              <button
                type="button"
                onClick={handleManageSubscription}
                className="inline-flex items-center justify-center px-4 py-2 border border-transparent font-medium rounded-md text-white bg-kotoba-primary hover:bg-kotoba-primary/90 sm:text-sm"
              >
                Manage subscription
              </button>
            ) : (
              <Link
                to="/pricing"
                className="inline-flex items-center justify-center px-4 py-2 border border-transparent font-medium rounded-md text-white bg-kotoba-primary hover:bg-kotoba-primary/90 sm:text-sm"
              >
                See upgrade options
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white shadow-soft rounded-3xl overflow-hidden mb-6">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-kotoba-text">Timezone</h3>
          <p className="mt-2 max-w-xl text-sm text-kotoba-text/60">
            {currentUser?.role === 'tutor' ? (
              <>Your availability windows are stored in this timezone. Students see lesson times converted to <em>their</em> browser-local zone — so you don't have to translate.</>
            ) : (
              <>Set this so we display lesson times in the zone you actually live in.</>
            )}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <select
              value={tzValue}
              onChange={(e) => setTzValue(e.target.value)}
              disabled={tzSaving}
              className="block w-full sm:w-auto rounded-md border border-kotoba-text/20 px-3 py-2 sm:text-sm focus:ring-kotoba-primary focus:border-kotoba-primary"
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
              className="inline-flex items-center justify-center px-4 py-2 border border-transparent font-medium rounded-md text-white bg-kotoba-primary hover:bg-kotoba-primary/90 disabled:opacity-50 disabled:cursor-not-allowed sm:text-sm"
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
        </div>
      </div>

      <div className="bg-white shadow-soft rounded-3xl overflow-hidden mb-6">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-kotoba-text">My Language Groups</h3>
          {myGroups.length > 0 ? (
            <ul className="mt-2 border border-kotoba-text/10 rounded-md divide-y divide-kotoba-text/10">
              {myGroups.map(group => (
                <li key={group.id} className="pl-3 pr-4 py-3 flex items-center justify-between text-sm">
                  <span className="font-medium">{group.language_name}</span>
                  <button onClick={() => handleLeaveGroup(group.id)} className="ml-4 text-red-600 hover:text-red-800 font-semibold">Leave</button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-kotoba-text/60">You are not a member of any language groups yet.</p>
          )}
        </div>
      </div>

      {currentUser.role === 'tutor' && (
        <>
          <div className="bg-white shadow-soft rounded-3xl overflow-hidden mb-6">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-kotoba-text">Language Verifications</h3>
              {isProTeacher ? (
                <>
                  <p className="mt-2 max-w-xl text-sm text-kotoba-text/60">As a Pro member, you can submit documents to get a "Verified" badge.</p>
                  <form onSubmit={handleVerificationSubmit} className="mt-5 space-y-4">
                    <div>
                      <label htmlFor="language" className="block text-sm font-medium text-kotoba-text/80">Language</label>
                      <input type="text" id="language" value={newVerification.language} onChange={(e) => setNewVerification({...newVerification, language: e.target.value})} placeholder="e.g., Japanese" className="mt-1 shadow-sm focus:ring-kotoba-primary focus:border-kotoba-primary block w-full sm:text-sm border-kotoba-text/20 rounded-md"/>
                    </div>
                    <div>
                      <label htmlFor="document_url" className="block text-sm font-medium text-kotoba-text/80">Link to Certificate</label>
                      <input type="url" id="document_url" value={newVerification.document_url} onChange={(e) => setNewVerification({...newVerification, document_url: e.target.value})} placeholder="e.g., https://drive.google.com/..." className="mt-1 shadow-sm focus:ring-kotoba-primary focus:border-kotoba-primary block w-full sm:text-sm border-kotoba-text/20 rounded-md"/>
                    </div>
                    <button type="submit" className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2 border border-transparent font-medium rounded-md text-white bg-kotoba-primary hover:bg-kotoba-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-kotoba-primary sm:text-sm">Submit Verification</button>
                  </form>
                </>
              ) : (
                <p className="mt-2 text-sm text-kotoba-text/60">
                  You must be a <span className="font-semibold">Pro</span> subscriber to submit verification requests.
                </p>
              )}

              <div className="mt-8">
                <h4 className="text-md font-medium text-kotoba-text/90">Your Submissions</h4>
                {verifications.length === 0 ? <p className="text-sm text-kotoba-text/60 mt-2">No submissions yet.</p> : (
                  <ul className="mt-2 border border-kotoba-text/10 rounded-md divide-y divide-kotoba-text/10">
                    {verifications.map(v => (
                      <li key={v.id} className="pl-3 pr-4 py-3 flex items-center justify-between text-sm">
                        <div className="w-0 flex-1 flex items-center">
                          <span className="ml-2 flex-1 w-0 truncate font-medium">{v.language}</span>
                          <a href={v.document_url} target="_blank" rel="noopener noreferrer" className="ml-2 text-kotoba-primary hover:text-kotoba-primary truncate">View Document</a>
                        </div>
                        <div className="ml-4 flex-shrink-0">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusClasses(v.status)}`}>
                            {v.status}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white shadow-soft rounded-3xl overflow-hidden mb-6">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-kotoba-text">Payouts</h3>
              <div className="mt-2 max-w-xl text-sm text-kotoba-text/60">
                {currentUser.charges_enabled ? <p>Your payout account is active. You can manage your account details on Stripe.</p> : <p>Connect with Stripe to receive payments for your funded projects.</p>}
              </div>
              <div className="mt-5">
                <button type="button" onClick={handleStripeOnboarding} className="inline-flex items-center justify-center px-4 py-2 border border-transparent font-medium rounded-md text-white bg-kotoba-primary hover:bg-kotoba-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-kotoba-primary sm:text-sm">
                  {currentUser.charges_enabled ? 'Edit Your Payouts' : 'Set up Payouts'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
      
      {currentUser.role === 'student' && (
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-kotoba-text">Privacy</h3>
            <p className="mt-2 max-w-xl text-sm text-kotoba-text/60">
              Hide your profile page from other users. Your messaging, pledges, and reviews are unaffected — only the public profile at <code>/profile/{currentUser.id}</code> becomes invisible.
            </p>
            <div className="mt-4">
              <label className="inline-flex items-center gap-3 text-sm text-kotoba-text/80 cursor-pointer">
                <input
                  type="checkbox"
                  checked={currentUser.profile_public !== false}
                  onChange={async (e) => {
                    try {
                      await client.patch('/users/me', { profile_public: e.target.checked });
                      window.location.reload();
                    } catch (err) {
                      addToast('Could not update privacy setting.', 'error');
                    }
                  }}
                  className="h-4 w-4 text-kotoba-primary border-kotoba-text/20 rounded focus:ring-kotoba-primary"
                />
                Show my profile to other users
              </label>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-kotoba-text">Email preferences</h3>
          <p className="mt-2 max-w-xl text-sm text-kotoba-text/60">
            Newsletters and product updates. Lesson confirmations, bookings, and account-security emails are always sent — they're not optional because they're part of the service you booked.
          </p>
          <div className="mt-4">
            <label className="inline-flex items-center gap-3 text-sm text-kotoba-text/80 cursor-pointer">
              <input
                type="checkbox"
                checked={currentUser.newsletter_opt_in === true}
                onChange={async (e) => {
                  try {
                    await client.patch('/users/me', { newsletter_opt_in: e.target.checked });
                    window.location.reload();
                  } catch (err) {
                    addToast('Could not update email preference.', 'error');
                  }
                }}
                className="h-4 w-4 text-kotoba-primary border-kotoba-text/20 rounded focus:ring-kotoba-primary"
              />
              Send me occasional product updates and newsletters from tutors I've booked with
            </label>
          </div>
        </div>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-kotoba-primary">Your data (GDPR)</h3>
          <p className="mt-2 max-w-xl text-sm text-kotoba-text/60">
            Download everything we hold about you. Includes your profile, bookings, content, messages, and pledges — as one JSON file.
          </p>
          <div className="mt-5">
            <button
              type="button"
              onClick={async () => {
                try {
                  const res = await client.get('/users/me/export');
                  const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `kotobaseed-export-${new Date().toISOString().split('T')[0]}.json`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                  addToast('Data export downloaded.', 'success');
                } catch {
                  addToast('Could not download data export.', 'error');
                }
              }}
              className="inline-flex items-center justify-center px-4 py-2 border-2 border-kotoba-primary font-medium rounded-md text-kotoba-primary bg-white hover:bg-kotoba-primary hover:text-white transition-colors sm:text-sm"
            >
              Download my data
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-kotoba-text">Danger Zone</h3>
          <div className="mt-2 max-w-xl text-sm text-kotoba-text/60">
            <p>
              Once you delete your account, there is no going back. Your personal data is anonymised immediately; financial records of completed transactions are kept for tax purposes (in anonymised form). See our <a href="/privacy" className="text-kotoba-primary underline">privacy policy</a> for details.
            </p>
          </div>
          <div className="mt-5">
            <button type="button" onClick={() => setModalOpen(true)} className="inline-flex items-center justify-center px-4 py-2 border border-transparent font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:text-sm">
              Delete account
            </button>
          </div>
        </div>
      </div>

      <ConfirmationModal 
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onConfirm={handleDeleteAccount}
        title="Delete account"
        message="Delete your account? This can't be undone — your projects and pledges are anonymised immediately."
        confirmText="Delete account"
        isDanger={true}
      />
    </div>
  );
};

export default Settings;
