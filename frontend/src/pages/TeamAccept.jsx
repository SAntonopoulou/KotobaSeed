import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { SkeletonCard } from '../components/Skeleton';
import { getErrorMessage } from '../utils/errors';
import { formatDateShort } from '../utils/dates';

// /onboarding/team-accept?token=…
//
// Public landing for an invite. If the visitor is logged in with the
// matching email, we show "Accept" → POST to the API. If they're not
// logged in, we explain the invite + offer Login / Register links that
// preserve the token for after-auth pickup.

const TeamAccept = () => {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { currentUser } = useAuth();

  const [invite, setInvite] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('No invite token in the link.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await client.get(`/tutor/team/invites/by-token/${token}`);
        if (!cancelled) setInvite(res.data);
      } catch (err) {
        if (!cancelled) {
          setError(
            getErrorMessage(err, 'This invite is invalid, revoked, or expired.'),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const accept = async () => {
    setSubmitting(true);
    try {
      await client.post('/tutor/team/invites/accept', { token });
      addToast('Welcome to the team.', 'success');
      navigate('/dashboard#site');
    } catch (err) {
      addToast(
        getErrorMessage(err, 'Could not accept the invite.'),
        'error',
      );
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="bg-kotoba-background/30 min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <SkeletonCard />
        </div>
      </main>
    );
  }

  if (error || !invite) {
    return (
      <main className="bg-kotoba-background/30 min-h-screen flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm p-8 max-w-md text-center">
          <h1 className="text-xl font-bold text-kotoba-primary">Invite not available</h1>
          <p className="mt-2 text-sm text-kotoba-text">
            {error || 'This invite is no longer valid.'}
          </p>
          <Link
            to="/"
            className="mt-6 inline-block px-5 py-2 rounded-md bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90"
          >
            Back to Kotobaseed
          </Link>
        </div>
      </main>
    );
  }

  const matches =
    currentUser && (currentUser.email || '').toLowerCase() === invite.email;

  return (
    <main className="bg-kotoba-background/30 min-h-screen flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm p-8 max-w-md w-full text-center">
        <p className="text-xs uppercase tracking-wider font-semibold text-kotoba-text/60">
          Team invite
        </p>
        <h1 className="mt-1 text-2xl font-bold text-kotoba-primary">
          {invite.team_name}
        </h1>
        <p className="mt-3 text-sm text-kotoba-text">
          <strong>{invite.inviter_name}</strong> has invited you to join their team on Kotobaseed.
          Accepting unlocks all Business-plan tutor features for your account, including 0%
          lesson fees, custom domain, verified badges, and the team's shared site design.
        </p>
        <p className="mt-3 text-xs text-kotoba-text/60">
          Invite is for <strong>{invite.email}</strong>.
        </p>

        {!currentUser && (
          <div className="mt-6 space-y-2 text-left">
            <p className="text-sm text-kotoba-text/80">
              Log in or create an account with <strong>{invite.email}</strong> to accept.
            </p>
            <div className="flex flex-col gap-2">
              <Link
                to={`/register?email=${encodeURIComponent(invite.email)}&next=${encodeURIComponent(`/onboarding/team-accept?token=${token}`)}`}
                className="block text-center px-5 py-2 rounded-md bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90"
              >
                Create my account
              </Link>
              <Link
                to={`/login?next=${encodeURIComponent(`/onboarding/team-accept?token=${token}`)}`}
                className="block text-center px-5 py-2 rounded-md border-2 border-kotoba-primary text-kotoba-primary font-semibold hover:bg-kotoba-primary hover:text-white"
              >
                Log in
              </Link>
            </div>
          </div>
        )}

        {currentUser && !matches && (
          <div className="mt-6 space-y-2 text-left">
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-md">
              You're logged in as <strong>{currentUser.email}</strong>, but this invite is
              for <strong>{invite.email}</strong>. Log out and sign in with the invited
              email to accept.
            </p>
          </div>
        )}

        {currentUser && matches && (
          <button
            type="button"
            onClick={accept}
            disabled={submitting}
            className="mt-6 w-full px-5 py-3 rounded-md bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90 disabled:opacity-50"
          >
            {submitting ? 'Joining…' : `Join ${invite.team_name}`}
          </button>
        )}

        <p className="mt-4 text-xs text-kotoba-text/50">
          Expires {formatDateShort(invite.expires_at)}.
        </p>
      </div>
    </main>
  );
};

export default TeamAccept;
