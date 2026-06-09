import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

// ContactTutor — thin redirector that turns a hero "Send first message"
// CTA into either a sign-up funnel (anonymous visitor) or a real
// conversation thread with the tenant's tutor (signed-in student).
//
// Tenant-scoped: reads /tutor/me to discover the tutor on this
// subdomain, then opens a conversation with their owning user.

const ContactTutor = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [error, setError] = useState('');
  const [firstName, setFirstName] = useState('your tutor');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const meRes = await client.get('/tutor/me');
        if (cancelled) return;
        const tutor = meRes.data;
        const fn = (tutor?.display_name || '').trim().split(/\s+/)[0];
        if (fn) setFirstName(fn);

        if (!currentUser) {
          navigate('/register?next=/contact', { replace: true });
          return;
        }
        if (!tutor?.user_id) {
          setError("We couldn't find your tutor's profile right now.");
          return;
        }

        const convRes = await client.post(
          `/conversations/with/${tutor.user_id}`,
        );
        const cid = convRes?.data?.conversation_id;
        if (cid) {
          window.location.href = `/messages/${cid}`;
        } else {
          setError("Couldn't open the conversation. Try again in a moment.");
        }
      } catch (err) {
        if (cancelled) return;
        setError(
          err?.response?.data?.detail ||
            "Couldn't open the conversation. Try again in a moment.",
        );
      }
    })();
    return () => { cancelled = true; };
  }, [currentUser, navigate]);

  if (error) {
    return (
      <main style={{
        minHeight: '60vh',
        display: 'grid',
        placeItems: 'center',
        padding: '64px 24px',
        textAlign: 'center',
      }}>
        <div>
          <p style={{ marginBottom: 14, fontSize: 16 }}>{error}</p>
          <a href="/" style={{ textDecoration: 'underline' }}>Back to home</a>
        </div>
      </main>
    );
  }

  return (
    <main style={{
      minHeight: '60vh',
      display: 'grid',
      placeItems: 'center',
      padding: '64px 24px',
    }}>
      <p style={{ fontSize: 16, opacity: 0.7 }}>
        Opening your conversation with {firstName}…
      </p>
    </main>
  );
};

export default ContactTutor;
