import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import client from '../../api/client';
import { useTenant } from '../../hooks/useTenant';
import { useAuth } from '../../context/AuthContext';
import VassoLayout from './VassoLayout';
import './vasso_greek.css';

// VassoClassroom — themed wrapper for the Daily.co classroom iframe.
// Once the room loads, the iframe takes over the full viewport — same
// as the default Classroom. The themed chrome only surrounds the
// connecting + error states; mirror the default's endpoint-fallback
// logic 1:1 so the access policy stays identical.

const VassoClassroom = ({ tutor }) => {
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

  if (error) {
    return (
      <VassoLayout
        tutor={tutor}
        currentUser={currentUser}
        onLogout={logout}
        variant="simple"
        setTitle="Classroom unavailable — Learn Greek with Vasso"
      >
        <main className="content" style={{ paddingTop: 60, textAlign: 'center' }}>
          <h1 className="pt" style={{ marginBottom: 14 }}>Classroom unavailable</h1>
          <p className="pt-sub" style={{ margin: '0 auto 28px', maxWidth: 460 }}>
            {error}
          </p>
          <Link to="/" className="v-btn v-btn-primary v-btn-lg">
            Back to the site
          </Link>
        </main>
      </VassoLayout>
    );
  }

  if (!data) {
    return (
      <VassoLayout
        tutor={tutor}
        currentUser={currentUser}
        onLogout={logout}
        variant="simple"
        setTitle="Connecting — Learn Greek with Vasso"
      >
        <main className="content" style={{ paddingTop: 60, textAlign: 'center' }}>
          <p style={{ fontSize: 17, color: 'var(--fg-muted)' }}>Connecting…</p>
        </main>
      </VassoLayout>
    );
  }

  // Daily's prebuilt UI accepts ?t=<token> on the room URL. Once the
  // iframe loads it fills the viewport — no themed chrome here.
  const src = `${data.room_url}?t=${encodeURIComponent(data.token)}`;

  return (
    <div className="theme-vasso-greek-site" style={{
      position: 'fixed',
      inset: 0,
      background: 'var(--aegean-900)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <iframe
        title="Classroom"
        src={src}
        allow="camera; microphone; fullscreen; speaker; display-capture; autoplay"
        style={{ flex: 1, width: '100%', border: 0 }}
      />
    </div>
  );
};

export default VassoClassroom;
