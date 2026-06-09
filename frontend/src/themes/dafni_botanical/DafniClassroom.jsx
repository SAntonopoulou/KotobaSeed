import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import client from '../../api/client';
import { useTenant } from '../../hooks/useTenant';
import { useAuth } from '../../context/AuthContext';
import DafniLayout from './DafniLayout';
import './dafni_botanical.css';

// DafniClassroom — themed wrapper for the Daily.co classroom iframe.
// Backend behaviour mirrors VassoClassroom 1:1 (same endpoint fallback
// order, same role-based access policy). Only the connecting + error
// chrome is themed — once the Daily iframe loads it fills the
// viewport, framed by a cream/sage stage.

const DafniClassroom = ({ tutor }) => {
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
    (tutor?.display_name || '').trim().split(/\s+/)[0] || 'Dafni';

  if (error) {
    return (
      <DafniLayout
        tutor={tutor}
        currentUser={currentUser}
        onLogout={logout}
        variant="simple"
        setTitle={`Classroom unavailable — Learn Greek with ${firstName}`}
      >
        <main className="d-content" style={{ textAlign: 'center' }}>
          <h1 className="d-pt">Classroom unavailable</h1>
          <p className="d-pt-sub" style={{ margin: '0 auto 28px', maxWidth: 460 }}>
            {error}
          </p>
          <Link to="/" className="d-btn d-btn-primary d-btn-lg">
            Back to the site
          </Link>
        </main>
      </DafniLayout>
    );
  }

  if (!data) {
    return (
      <DafniLayout
        tutor={tutor}
        currentUser={currentUser}
        onLogout={logout}
        variant="simple"
        setTitle={`Connecting — Learn Greek with ${firstName}`}
      >
        <main className="d-content" style={{ textAlign: 'center' }}>
          <div className="d-classroom-connecting">
            <span className="d-classroom-dot" aria-hidden="true" />
            <p className="d-classroom-connecting-label">Connecting to the classroom</p>
            <p className="d-classroom-connecting-sub">
              Settling in — your session opens in a moment.
            </p>
          </div>
        </main>
      </DafniLayout>
    );
  }

  // Daily's prebuilt UI accepts ?t=<token> on the room URL. Once the
  // iframe loads it fills the viewport — same as VassoClassroom, but
  // staged against a cream backdrop with a sage rounded border.
  const src = `${data.room_url}?t=${encodeURIComponent(data.token)}`;

  return (
    <div className="theme-dafni-botanical-site d-classroom-stage">
      <div className="d-classroom-frame">
        <iframe
          title="Classroom"
          src={src}
          allow="camera; microphone; fullscreen; speaker; display-capture; autoplay"
          className="d-classroom-iframe"
        />
      </div>
    </div>
  );
};

export default DafniClassroom;
