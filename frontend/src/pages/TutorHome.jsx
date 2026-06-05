import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

const parseLanguages = (raw) => {
  if (!raw) return [];
  // Accept either a JSON array string or plain comma-separated values.
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    /* not JSON — fall through */
  }
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
};

const TutorHome = () => {
  const { currentUser } = useAuth();
  const [tutor, setTutor] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await client.get('/tutor/me');
        if (!cancelled) setTutor(res.data);
      } catch (err) {
        if (!cancelled) {
          if (err?.response?.status === 404) {
            setError("This site isn't set up yet.");
          } else {
            setError(err?.response?.data?.detail || 'Could not load this site.');
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="bg-kotoba-background min-h-screen flex items-center justify-center p-8">
        <div className="bg-white rounded-2xl shadow-md p-8 max-w-md text-center">
          <h1 className="text-2xl font-bold text-kotoba-primary mb-2">Not here</h1>
          <p className="text-kotoba-text">{error}</p>
        </div>
      </div>
    );
  }

  if (!tutor) {
    return (
      <div className="bg-kotoba-background min-h-screen flex items-center justify-center">
        <p className="text-kotoba-text">Loading…</p>
      </div>
    );
  }

  const languages = parseLanguages(tutor.languages_taught);
  const isPaused = tutor.account_status !== 'active';
  const isOwner = currentUser && currentUser.id === tutor.user_id;

  return (
    <div className="bg-kotoba-background min-h-screen">
      {/* Minimal nav with just the tutor's name */}
      <header className="bg-white shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-3">
          <span className="text-xl font-semibold text-kotoba-primary">{tutor.display_name}</span>
          <div className="flex items-center gap-2">
            {isOwner && (
              <Link
                to="/dashboard"
                className="px-4 py-2 rounded-md border-2 border-kotoba-primary text-kotoba-primary font-medium hover:bg-kotoba-primary hover:text-white transition-colors text-sm"
              >
                Manage
              </Link>
            )}
            <a
              href="#book"
              className="hidden sm:inline-block px-4 py-2 rounded-md bg-kotoba-secondary text-kotoba-text font-medium hover:bg-kotoba-secondary-dark"
            >
              Book a lesson
            </a>
          </div>
        </div>
      </header>

      {isPaused && (
        <div className="bg-kotoba-secondary/20 text-kotoba-text text-sm py-2 px-4 text-center">
          This site is still being set up — bookings open as soon as Stripe verification is finished.
        </div>
      )}

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <h1 className="text-4xl sm:text-5xl font-extrabold text-kotoba-primary leading-tight">
              {tutor.display_name}
            </h1>
            {languages.length > 0 && (
              <p className="mt-3 text-lg text-kotoba-text/80">
                Teaches{' '}
                <span className="text-kotoba-primary font-medium">
                  {languages.join(' · ')}
                </span>
              </p>
            )}
            {tutor.bio && (
              <p className="mt-6 text-lg text-kotoba-text leading-relaxed whitespace-pre-line">
                {tutor.bio}
              </p>
            )}
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#book"
                className="inline-flex items-center px-6 py-3 rounded-lg bg-kotoba-secondary text-kotoba-text font-semibold hover:bg-kotoba-secondary-dark"
              >
                Book a lesson
              </a>
              <a
                href="#about"
                className="inline-flex items-center px-6 py-3 rounded-lg border-2 border-kotoba-primary text-kotoba-primary font-semibold hover:bg-kotoba-primary hover:text-white transition-colors"
              >
                More about me
              </a>
            </div>
          </div>

          <div className="lg:order-2">
            {tutor.photo_url ? (
              <img
                src={tutor.photo_url}
                alt={tutor.display_name}
                className="w-full max-w-md mx-auto rounded-2xl shadow-lg object-cover aspect-square"
              />
            ) : (
              <div className="w-full max-w-md mx-auto rounded-2xl bg-kotoba-primary/10 aspect-square flex items-center justify-center">
                <span className="text-6xl font-extrabold text-kotoba-primary/40">
                  {tutor.display_name.charAt(0)}
                </span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Placeholder sections */}
      <section id="about" className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 bg-white rounded-2xl shadow-sm mx-4 sm:mx-auto mt-8 mb-8">
        <h2 className="text-2xl font-bold text-kotoba-primary mb-3">About</h2>
        <p className="text-kotoba-text">
          {tutor.bio || 'Bio coming soon.'}
        </p>
      </section>

      <section id="book" className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 bg-white rounded-2xl shadow-sm mx-4 sm:mx-auto mb-16">
        <h2 className="text-2xl font-bold text-kotoba-primary mb-3">Book a lesson</h2>
        <p className="text-kotoba-text">
          Lesson booking is coming soon — once it's live, this is where students will pick a time.
        </p>
      </section>

      <footer className="bg-kotoba-primary text-white/80 py-6 text-center text-sm">
        <p>
          Powered by{' '}
          <a href="https://kotobaseed.net" className="underline hover:text-white">
            Kotobaseed
          </a>
        </p>
      </footer>
    </div>
  );
};

export default TutorHome;
