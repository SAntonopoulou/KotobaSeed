import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import VassoLayout from './VassoLayout';
import './vasso_greek.css';

const VassoBookingCancelled = ({ tutor }) => {
  const { currentUser, logout } = useAuth();

  return (
    <VassoLayout
      tutor={tutor}
      currentUser={currentUser}
      onLogout={logout}
      variant="simple"
      setTitle="No charge made — Learn Greek with Vasso"
    >
      <main className="content" style={{ paddingTop: 60, textAlign: 'center' }}>
        <h1 className="pt" style={{ marginBottom: 14 }}>No charge made.</h1>
        <p className="pt-sub" style={{ margin: '0 auto 28px', maxWidth: 480 }}>
          You backed out before the payment went through. Nothing was taken from your card — you're welcome to try again any time.
        </p>
        <Link to="/" className="v-btn v-btn-primary v-btn-lg">
          Back to the site
        </Link>
      </main>
    </VassoLayout>
  );
};

export default VassoBookingCancelled;
