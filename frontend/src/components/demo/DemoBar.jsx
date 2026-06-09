import React, { useState } from 'react';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useDemo } from '../../context/DemoContext';
import { getErrorMessage } from '../../utils/errors';
import SetPasswordModal from './SetPasswordModal';
import Soba from './Soba';

// Honest demo bar. Shown only when the user is in a demo session, sits
// above the existing nav, never blocks the page.

const DemoBar = () => {
  const { isDemo, demoRole, loading, refresh } = useDemo();
  const { logout } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [error, setError] = useState('');

  if (loading || !isDemo) return null;

  const onExit = async () => {
    if (exiting) return;
    setExiting(true);
    setError('');
    try {
      await client.post('/demo/exit');
      // The cookie is gone server-side; clear our local token + reload
      // so we land back on the marketing landing with a fresh state.
      logout();
      window.location.assign('/');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not exit demo.'));
      setExiting(false);
    }
  };

  const onRestartTour = () => {
    try {
      localStorage.removeItem('koto_demo_tour_done');
    } catch { /* localStorage blocked — fine */ }
    window.dispatchEvent(new CustomEvent('koto:demo-tour-restart'));
  };

  const roleLabel =
    demoRole === 'tutor' ? 'Tutor' :
    demoRole === 'creator' ? 'Creator' :
    demoRole === 'student' ? 'Student' :
    'Demo';

  return (
    <>
      <div className="sticky top-0 z-50 bg-gradient-to-r from-kotoba-primary to-kotoba-primary/95 text-white shadow-soft">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center gap-3 flex-wrap">
          <Soba size={28} variant="bob" className="flex-shrink-0" />
          <p className="text-sm font-medium">
            <span className="hidden sm:inline">You're exploring a live </span>
            <span className="font-display font-bold">{roleLabel}</span>
            <span> demo</span>
            <span className="hidden sm:inline"> of Kotobaseed — keep going as long as you like.</span>
          </p>
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={onRestartTour}
              className="text-xs font-semibold text-white/85 hover:text-white px-2 py-1 rounded hover:bg-white/10 transition-colors"
              title="Replay the guided tour"
            >
              Restart tour
            </button>
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="group inline-flex items-center px-4 py-1.5 rounded-2xl bg-kotoba-secondary text-kotoba-text text-sm font-semibold shadow-soft hover:shadow-soft-glow hover:-translate-y-0.5 transition-all duration-300 ease-soft"
            >
              Choose a plan
              <span
                className="ml-1.5 transition-transform duration-300 group-hover:translate-x-1"
                aria-hidden="true"
              >
                →
              </span>
            </button>
            <button
              type="button"
              onClick={onExit}
              disabled={exiting}
              className="text-xs font-semibold text-white/75 hover:text-white px-2 py-1 rounded hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              {exiting ? 'Exiting…' : 'Exit demo'}
            </button>
          </div>
        </div>
        {error && (
          <div className="bg-red-500 text-white text-xs px-4 py-1 text-center">
            {error}
          </div>
        )}
      </div>
      {showModal && (
        <SetPasswordModal
          onClose={() => setShowModal(false)}
          onConverted={async () => {
            setShowModal(false);
            await refresh();
            // Hard reload so any cached demo state in components clears.
            window.location.reload();
          }}
        />
      )}
    </>
  );
};

export default DemoBar;
