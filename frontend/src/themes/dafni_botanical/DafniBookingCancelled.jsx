import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import DafniLayout from './DafniLayout';
import './dafni_botanical.css';

const DafniBookingCancelled = ({ tutor }) => {
  const { currentUser, logout } = useAuth();

  return (
    <DafniLayout
      tutor={tutor}
      currentUser={currentUser}
      onLogout={logout}
      variant="simple"
      setTitle="Booking cancelled — Learn Greek with Dafni"
    >
      <main className="d-content d-bc-wrap">
        <h1 className="d-bc-title">Booking cancelled.</h1>
        <p className="d-bc-sub">
          You backed out before the payment went through. Nothing was charged — you can pick another time whenever you're ready.
        </p>
        <div className="d-bc-actions">
          <Link to="/#pricing" className="d-btn d-btn-primary d-btn-lg">
            Try again
          </Link>
          <Link to="/" className="d-btn d-btn-ghost d-btn-lg">
            Return home
          </Link>
        </div>
      </main>
    </DafniLayout>
  );
};

export default DafniBookingCancelled;
