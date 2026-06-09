import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import SophiaLayout from './SophiaLayout';
import './sophia_inkwell.css';

// Hand-drawn navy check — a calm editorial mark instead of a stock icon.
function SophiaCheckMark() {
  return (
    <svg
      viewBox="0 0 96 96"
      width="96"
      height="96"
      role="img"
      aria-label="Booking confirmed"
      className="s-bs-check"
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

const SophiaBookingSuccess = ({ tutor }) => {
  const { currentUser, logout } = useAuth();
  const [params] = useSearchParams();
  const bookingId = params.get('booking');
  const firstName =
    (tutor?.display_name || '').trim().split(/\s+/)[0] || 'Sophia';

  return (
    <SophiaLayout
      tutor={tutor}
      currentUser={currentUser}
      onLogout={logout}
      variant="simple"
      setTitle={`You're booked — English with ${firstName}`}
    >
      <main className="s-content s-bs-wrap">
        <div className="s-bs-mark">
          <SophiaCheckMark />
        </div>
        <h1 className="s-bs-title">You're booked.</h1>
        <p className="s-bs-sub">
          {bookingId
            ? `Your booking #${bookingId} is confirmed. We've emailed the details — check your inbox.`
            : "Your booking is confirmed. We've emailed the details — check your inbox."}
        </p>
        <div className="s-bs-actions">
          <Link to="/student/dashboard" className="s-btn s-btn-primary s-btn-lg">
            Back to lessons
          </Link>
          <Link to="/" className="s-btn s-btn-ghost s-btn-lg">
            Return home
          </Link>
        </div>
      </main>
    </SophiaLayout>
  );
};

export default SophiaBookingSuccess;
