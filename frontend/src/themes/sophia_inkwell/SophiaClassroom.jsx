import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import client from '../../api/client';
import { useTenant } from '../../hooks/useTenant';
import { useAuth } from '../../context/AuthContext';
import SophiaLayout from './SophiaLayout';
import './sophia_inkwell.css';

// SophiaClassroom — themed wrapper for the Daily.co classroom iframe.
// Backend behaviour mirrors DafniClassroom 1:1 (same endpoint fallback
// order, same role-based access policy). Only the connecting + error
// chrome is themed — once the Daily iframe loads it fills the
// viewport, framed by a bone/navy stage.

const SophiaClassroom = ({ tutor }) => {
  const { bookingId } = useParams();
  const tenant = useTenant();
  const { currentUser, logout } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setError('');

    const tryEndpoints = tenant.kind === 'tutor'
      ? [
          `/tutor/bookings/${bookingId}/classroom-token`,
          `/users/me/bookings/${bookingId}/classroom-token`,
        ]
      : [
          `/users/me/bookings/${bookingId}/classroom-token`,
          `/tutor/bookings/${bookingId}/classroom-token`,
        ];

    (async () => {
      let lastErr = null;
      for (const url of tryEndpoints) {
        try {
          const res = await client.post(url);
          if (!cancelled) setData(res.data);
          return;
        } catch (err) {
          lastErr = err;
          const code = err?.response?.status;
          if (code && [400, 409, 503].includes(code)) {
            if (!cancelled) {
              setError(
                err?.response?.data?.detail ||
                  'Cannot join the classroom right now.',
              );
            }
            return;
          }
        }
      }
      if (!cancelled) {
        setError(
          lastErr?.response?.data?.detail ||
            'Could not join — make sure you are logged in.',
        );
      }
    })();

    return () => { cancelled = true; };
  }, [bookingId, tenant.kind]);

  const firstName =
    (tutor?.display_name || '').trim().split(/\s+/)[0] || 'Sophia';

  if (error) {
    return (
      <SophiaLayout
        tutor={tutor}
        currentUser={currentUser}
        onLogout={logout}
        variant="simple"
        setTitle={`Classroom unavailable — English with ${firstName}`}
      >
        <main className="s-content" style={{ textAlign: 'center' }}>
          <h1 className="s-pt">Classroom unavailable</h1>
          <p className="s-pt-sub" style={{ margin: '0 auto 28px', maxWidth: 460 }}>
            {error}
          </p>
          <Link to="/" className="s-btn s-btn-primary s-btn-lg">
            Back to the site
          </Link>
        </main>
      </SophiaLayout>
    );
  }

  if (!data) {
    return (
      <SophiaLayout
        tutor={tutor}
        currentUser={currentUser}
        onLogout={logout}
        variant="simple"
        setTitle={`Connecting — English with ${firstName}`}
      >
        <main className="s-content" style={{ textAlign: 'center' }}>
          <div className="s-classroom-connecting">
            <span className="s-classroom-dot" aria-hidden="true" />
            <p className="s-classroom-connecting-label">Connecting to the classroom</p>
            <p className="s-classroom-connecting-sub">
              Settling in — your session opens in a moment.
            </p>
          </div>
        </main>
      </SophiaLayout>
    );
  }

  // Daily's prebuilt UI accepts ?t=<token> on the room URL. Once the
  // iframe loads it fills the viewport — same as DafniClassroom, but
  // staged against a bone backdrop with a navy rounded border.
  const src = `${data.room_url}?t=${encodeURIComponent(data.token)}`;

  return (
    <div className="theme-sophia-inkwell-site s-classroom-stage">
      <div className="s-classroom-frame">
        <iframe
          title="Classroom"
          src={src}
          allow="camera; microphone; fullscreen; speaker; display-capture; autoplay"
          className="s-classroom-iframe"
        />
      </div>
    </div>
  );
};

export default SophiaClassroom;
