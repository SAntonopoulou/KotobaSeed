import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import SophiaLayout from './SophiaLayout';
import './sophia_inkwell.css';

const SophiaBookingCancelled = ({ tutor }) => {
  const { currentUser, logout } = useAuth();
  const firstName =
    (tutor?.display_name || '').trim().split(/\s+/)[0] || 'Sophia';

  return (
    <SophiaLayout
      tutor={tutor}
      currentUser={currentUser}
      onLogout={logout}
      variant="simple"
      setTitle={`Booking cancelled — English with ${firstName}`}
    >
      <main className="s-content s-bc-wrap">
        <h1 className="s-bc-title">Booking cancelled.</h1>
        <p className="s-bc-sub">
          You backed out before the payment went through. Nothing was charged — you can pick another time whenever you're ready.
        </p>
        <div className="s-bc-actions">
          <Link to="/#pricing" className="s-btn s-btn-primary s-btn-lg">
            Try again
          </Link>
          <Link to="/" className="s-btn s-btn-ghost s-btn-lg">
            Return home
          </Link>
        </div>
      </main>
    </SophiaLayout>
  );
};

export default SophiaBookingCancelled;
