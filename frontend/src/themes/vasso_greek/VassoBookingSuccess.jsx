import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FaCircleCheck } from 'react-icons/fa6';
import { useAuth } from '../../context/AuthContext';
import VassoLayout from './VassoLayout';
import './vasso_greek.css';

const VassoBookingSuccess = ({ tutor }) => {
  const { currentUser, logout } = useAuth();
  const [params] = useSearchParams();
  const bookingId = params.get('booking');

  return (
    <VassoLayout
      tutor={tutor}
      currentUser={currentUser}
      onLogout={logout}
      variant="simple"
      setTitle="You're booked — Learn Greek with Vasso"
    >
      <main className="content" style={{ paddingTop: 60, textAlign: 'center' }}>
        <div style={{
          width: 76,
          height: 76,
          borderRadius: '50%',
          background: 'var(--success-soft)',
          color: 'var(--success)',
          display: 'grid',
          placeItems: 'center',
          margin: '0 auto 18px',
        }}>
          <FaCircleCheck size={40} />
        </div>
        <h1 className="pt" style={{ marginBottom: 14 }}>You're booked.</h1>
        <p className="pt-sub" style={{ margin: '0 auto 28px', maxWidth: 460 }}>
          {bookingId
            ? `Your booking #${bookingId} is confirmed. We've emailed the details — check your inbox.`
            : "Your booking is confirmed. We've emailed the details — check your inbox."}
        </p>
        <Link to="/" className="v-btn v-btn-primary v-btn-lg">
          Back to the site
        </Link>
      </main>
    </VassoLayout>
  );
};

export default VassoBookingSuccess;
