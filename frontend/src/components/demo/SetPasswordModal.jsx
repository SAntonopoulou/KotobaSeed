import React, { useEffect, useState } from 'react';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { getErrorMessage } from '../../utils/errors';
import Soba from './Soba';

// Conversion in place: demo → real account. Sets full name + password
// + GDPR consent, then the server wipes the showcase content and the
// user keeps everything they themselves edited (bio, photo, theme,
// page sections, display name, languages — all on User/Tutor rows
// that wipe_workspace leaves alone).
//
// For tutor conversions we chain straight into Stripe Connect
// onboarding so they can start accepting payments without a second
// click — the typical "I want to teach for real" path. Students close
// back to /discover via the standard onConverted callback.
//
// Closeable via the X, the Escape key, or click on the backdrop.

const SetPasswordModal = ({ onClose, onConverted }) => {
  const { currentUser } = useAuth();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('idle'); // 'idle' | 'converting' | 'connecting'
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const isTutor = currentUser?.role === 'tutor';

  const submit = async (e) => {
    e?.preventDefault();
    if (!name.trim() || password.length < 8 || !consent) {
      setError('Fill every field — name, password (8+ chars), and consent.');
      return;
    }
    setBusy(true);
    setStage('converting');
    setError('');
    try {
      await client.post('/demo/convert', {
        full_name: name.trim(),
        password,
        gdpr_consent: true,
      });
      // Tutor conversions chain into Stripe Connect so payouts work
      // before the dashboard ever shows. We do this client-side rather
      // than on the backend because the AccountLink return_url has to
      // point at the actual host they're on (apex vs tenant), and the
      // backend doesn't know which without an extra round trip.
      if (isTutor) {
        setStage('connecting');
        try {
          const linkRes = await client.post('/users/stripe-onboarding-link');
          const url = linkRes.data?.onboarding_url;
          if (url) {
            window.location.assign(url);
            return;
          }
        } catch {
          // Connect creation failed — let them into the dashboard
          // anyway; they can launch onboarding from settings later.
        }
      }
      onConverted?.();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not convert account.'));
      setBusy(false);
      setStage('idle');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-kotoba-text/40 backdrop-blur-sm"
        onClick={() => !busy && onClose()}
      />
      <form
        onSubmit={submit}
        className="relative w-full max-w-md bg-white rounded-3xl shadow-soft-lg p-7 sm:p-8 font-sans"
      >
        <button
          type="button"
          onClick={() => !busy && onClose()}
          className="absolute top-4 right-4 text-kotoba-text/55 hover:text-kotoba-text text-lg w-7 h-7 rounded-full hover:bg-kotoba-text/5 flex items-center justify-center"
          aria-label="Close"
        >
          ✕
        </button>
        <div className="flex items-center gap-3 mb-5">
          <Soba size={48} variant="bob" />
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark">
              Keep your work
            </p>
            <h2 className="font-display text-2xl font-bold text-kotoba-primary leading-tight tracking-[-0.015em]">
              Set a password
            </h2>
          </div>
        </div>
        <p className="text-sm text-kotoba-text/75 leading-relaxed mb-5">
          You're a demo account right now. Set a password to convert it into a real
          Kotobaseed account — anything you edited during the demo stays; the seeded
          examples get cleaned up.
        </p>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-2xl text-sm">
            {error}
          </div>
        )}

        <label className="block text-sm mb-3">
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-kotoba-text/55">
            Your name
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            required
            placeholder="What students should call you"
            className="mt-1 w-full px-3 py-2 border border-kotoba-text/15 rounded-2xl text-sm focus:outline-none focus:border-kotoba-primary focus:ring-4 focus:ring-kotoba-primary/10 transition-all"
          />
        </label>

        <label className="block text-sm mb-4">
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-kotoba-text/55">
            Password
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
            autoComplete="new-password"
            placeholder="8 characters minimum"
            className="mt-1 w-full px-3 py-2 border border-kotoba-text/15 rounded-2xl text-sm focus:outline-none focus:border-kotoba-primary focus:ring-4 focus:ring-kotoba-primary/10 transition-all"
          />
        </label>

        <label className="flex items-start gap-2 text-xs text-kotoba-text/75 mb-5">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 w-4 h-4 text-kotoba-primary border-kotoba-text/30 rounded focus:ring-kotoba-primary"
          />
          <span>
            I agree to Kotobaseed processing my data to provide the platform, per the
            Privacy Policy. I can delete my account any time.
          </span>
        </label>

        <button
          type="submit"
          disabled={busy}
          className="group w-full inline-flex items-center justify-center px-5 py-3 rounded-2xl bg-kotoba-primary text-white font-semibold shadow-soft hover:shadow-soft-lg hover:-translate-y-0.5 transition-all duration-300 ease-soft disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {stage === 'connecting'
            ? 'Setting up payouts…'
            : busy
            ? 'Converting…'
            : isTutor
            ? 'Convert + set up payouts'
            : 'Convert + keep my work'}
          {!busy && (
            <span
              className="ml-2 transition-transform duration-300 group-hover:translate-x-1"
              aria-hidden="true"
            >
              →
            </span>
          )}
        </button>
        {isTutor && (
          <p className="mt-3 text-[11px] text-kotoba-text/55 leading-relaxed">
            We'll hand you straight to Stripe to verify your details — that's the
            last step before students can pay you. You can finish it later from
            Settings if you prefer.
          </p>
        )}
      </form>
    </div>
  );
};

export default SetPasswordModal;
