import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import DafniLayout from './DafniLayout';
import './dafni_botanical.css';

// Hand-drawn sage check — a calm botanical mark instead of a stock icon.
function DafniCheckMark() {
  return (
    <svg
      viewBox="0 0 96 96"
      width="96"
      height="96"
      role="img"
      aria-label="Booking confirmed"
      className="d-bs-check"
    >
      <circle
        cx="48"
        cy="48"
        r="42"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray="4 3"
        opacity="0.45"
      />
      <path
        d="M28 50 L43 65 L70 32"
        fill="none"
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const DafniBookingSuccess = ({ tutor }) => {
  const { currentUser, logout } = useAuth();
  const [params] = useSearchParams();
  const bookingId = params.get('booking');

  return (
    <DafniLayout
      tutor={tutor}
      currentUser={currentUser}
      onLogout={logout}
      variant="simple"
      setTitle="You're booked — Learn Greek with Dafni"
    >
      <main className="d-content d-bs-wrap">
        <div className="d-bs-mark">
          <DafniCheckMark />
        </div>
        <h1 className="d-bs-title">You're booked.</h1>
        <p className="d-bs-sub">
          {bookingId
            ? `Your booking #${bookingId} is confirmed. We've emailed the details — check your inbox.`
            : "Your booking is confirmed. We've emailed the details — check your inbox."}
        </p>
        <div className="d-bs-actions">
          <Link to="/student/dashboard" className="d-btn d-btn-primary d-btn-lg">
            Back to lessons
          </Link>
          <Link to="/" className="d-btn d-btn-ghost d-btn-lg">
            Return home
          </Link>
        </div>
      </main>
    </DafniLayout>
  );
};

export default DafniBookingSuccess;
