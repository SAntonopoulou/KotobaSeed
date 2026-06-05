import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import client from '../api/client';
import ConfirmationModal from '../components/ConfirmationModal';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext'; // useAuth is already imported

const Settings = () => {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { currentUser, token } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [verifications, setVerifications] = useState([]);
  const [newVerification, setNewVerification] = useState({ language: '', document_url: '' });
  const [myGroups, setMyGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchPageData = useCallback(async () => {
    if (!currentUser) return;
    try {
      if (currentUser.role === 'creator') {
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
      localStorage.removeItem('token');
      navigate('/');
      window.location.reload();
    } catch (error) {
      console.error("Failed to delete account", error);
      addToast("Failed to delete account. Please try again.", 'error');
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
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) return <div>Loading...</div>;
  if (!currentUser) return <div>Please log in to view your settings.</div>;

  const isProTeacher =
    currentUser.role === 'creator' &&
    (currentUser.subscription_tier === 'pro' || currentUser.subscription_tier === 'business');
  const tier = currentUser.subscription_tier || 'free';
  const tierLabel = tier === 'free' || tier === 'none' ? 'Free' : tier.charAt(0).toUpperCase() + tier.slice(1);
  const onPaidTier = tier !== 'free' && tier !== 'none';

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Settings</h1>

      <div className="bg-white shadow overflow-hidden sm:rounded-lg mb-8">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">Subscription</h3>
          <div className="mt-2 max-w-xl text-sm text-gray-500">
            <p>
              You're on the <span className="font-semibold">{tierLabel}</span> plan.
              {onPaidTier && currentUser.subscription_expires_at && (
                <>
                  {' '}Renews on{' '}
                  <span className="font-medium">
                    {new Date(currentUser.subscription_expires_at).toLocaleDateString()}
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
                className="inline-flex items-center justify-center px-4 py-2 border border-transparent font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 sm:text-sm"
              >
                Manage subscription
              </button>
            ) : (
              <Link
                to="/pricing"
                className="inline-flex items-center justify-center px-4 py-2 border border-transparent font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 sm:text-sm"
              >
                See upgrade options
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-lg mb-8">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">My Language Groups</h3>
          {myGroups.length > 0 ? (
            <ul className="mt-2 border border-gray-200 rounded-md divide-y divide-gray-200">
              {myGroups.map(group => (
                <li key={group.id} className="pl-3 pr-4 py-3 flex items-center justify-between text-sm">
                  <span className="font-medium">{group.language_name}</span>
                  <button onClick={() => handleLeaveGroup(group.id)} className="ml-4 text-red-600 hover:text-red-800 font-semibold">Leave</button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-gray-500">You are not a member of any language groups yet.</p>
          )}
        </div>
      </div>

      {currentUser.role === 'creator' && (
        <>
          <div className="bg-white shadow overflow-hidden sm:rounded-lg mb-8">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900">Language Verifications</h3>
              {isProTeacher ? (
                <>
                  <p className="mt-2 max-w-xl text-sm text-gray-500">As a Pro member, you can submit documents to get a "Verified" badge.</p>
                  <form onSubmit={handleVerificationSubmit} className="mt-5 space-y-4">
                    <div>
                      <label htmlFor="language" className="block text-sm font-medium text-gray-700">Language</label>
                      <input type="text" id="language" value={newVerification.language} onChange={(e) => setNewVerification({...newVerification, language: e.target.value})} placeholder="e.g., Japanese" className="mt-1 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"/>
                    </div>
                    <div>
                      <label htmlFor="document_url" className="block text-sm font-medium text-gray-700">Link to Certificate</label>
                      <input type="url" id="document_url" value={newVerification.document_url} onChange={(e) => setNewVerification({...newVerification, document_url: e.target.value})} placeholder="e.g., https://drive.google.com/..." className="mt-1 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"/>
                    </div>
                    <button type="submit" className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2 border border-transparent font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:text-sm">Submit Verification</button>
                  </form>
                </>
              ) : (
                <p className="mt-2 text-sm text-gray-500">
                  You must be a <span className="font-semibold">Pro</span> subscriber to submit verification requests.
                </p>
              )}

              <div className="mt-8">
                <h4 className="text-md font-medium text-gray-800">Your Submissions</h4>
                {verifications.length === 0 ? <p className="text-sm text-gray-500 mt-2">No submissions yet.</p> : (
                  <ul className="mt-2 border border-gray-200 rounded-md divide-y divide-gray-200">
                    {verifications.map(v => (
                      <li key={v.id} className="pl-3 pr-4 py-3 flex items-center justify-between text-sm">
                        <div className="w-0 flex-1 flex items-center">
                          <span className="ml-2 flex-1 w-0 truncate font-medium">{v.language}</span>
                          <a href={v.document_url} target="_blank" rel="noopener noreferrer" className="ml-2 text-indigo-600 hover:text-indigo-900 truncate">View Document</a>
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

          <div className="bg-white shadow overflow-hidden sm:rounded-lg mb-8">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900">Payouts</h3>
              <div className="mt-2 max-w-xl text-sm text-gray-500">
                {currentUser.charges_enabled ? <p>Your payout account is active. You can manage your account details on Stripe.</p> : <p>Connect with Stripe to receive payments for your funded projects.</p>}
              </div>
              <div className="mt-5">
                <button type="button" onClick={handleStripeOnboarding} className="inline-flex items-center justify-center px-4 py-2 border border-transparent font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:text-sm">
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
            <h3 className="text-lg leading-6 font-medium text-gray-900">Privacy</h3>
            <p className="mt-2 max-w-xl text-sm text-gray-500">
              Hide your profile page from other users. Your messaging, pledges, and reviews are unaffected — only the public profile at <code>/profile/{currentUser.id}</code> becomes invisible.
            </p>
            <div className="mt-4">
              <label className="inline-flex items-center gap-3 text-sm text-gray-700 cursor-pointer">
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
                  className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                />
                Show my profile to other users
              </label>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">Danger Zone</h3>
          <div className="mt-2 max-w-xl text-sm text-gray-500"><p>Once you delete your account, there is no going back. Please be certain.</p></div>
          <div className="mt-5">
            <button type="button" onClick={() => setModalOpen(true)} className="inline-flex items-center justify-center px-4 py-2 border border-transparent font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:text-sm">
              Delete Account
            </button>
          </div>
        </div>
      </div>

      <ConfirmationModal 
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onConfirm={handleDeleteAccount}
        title="Delete Account"
        message="Are you sure? This cannot be undone. Your projects and pledges will be anonymized."
        confirmText="Delete Account"
        isDanger={true}
      />
    </div>
  );
};

export default Settings;
