import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { apexUrl } from '../hooks/useTenant';
import BookingDialog from '../components/BookingDialog';

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

const formatPrice = (cents, currency = 'eur') => {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  } catch {
    return `€${(cents / 100).toFixed(2)}`;
  }
};

const TutorHome = () => {
  const { currentUser } = useAuth();
  const [tutor, setTutor] = useState(null);
  const [packs, setPacks] = useState([]);
  const [bookingPack, setBookingPack] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [tutorRes, packsRes] = await Promise.all([
          client.get('/tutor/me'),
          client.get('/tutor/lesson-packs').catch(() => ({ data: [] })),
        ]);
        if (!cancelled) {
          setTutor(tutorRes.data);
          setPacks(packsRes.data || []);
        }
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
      {/* Header — tutor name, with a small but visible link back to Kotobaseed */}
      <header className="bg-white shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <a
              href={apexUrl('/')}
              className="text-xs uppercase tracking-wider text-kotoba-text/50 hover:text-kotoba-primary"
              title="Browse Kotobaseed"
            >
              Kotobaseed
            </a>
            <span className="text-kotoba-text/30">·</span>
            <span className="text-xl font-semibold text-kotoba-primary">{tutor.display_name}</span>
          </div>
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
        {packs.length === 0 ? (
          <p className="text-kotoba-text">
            {isOwner
              ? 'No lesson packs yet — add one from your dashboard.'
              : 'This tutor hasn\'t listed lesson packs yet. Check back soon.'}
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-2">
            {packs.map((pack) => (
              <div
                key={pack.id}
                className="border border-kotoba-text/10 rounded-xl p-5 flex flex-col bg-kotoba-background/40"
              >
                <h3 className="text-lg font-semibold text-kotoba-primary">{pack.name}</h3>
                <p className="mt-1 text-sm text-kotoba-text/70">
                  {pack.num_lessons} × {pack.duration_minutes} min
                </p>
                {pack.description && (
                  <p className="mt-3 text-sm text-kotoba-text whitespace-pre-line">
                    {pack.description}
                  </p>
                )}
                <div className="flex-grow" />
                <p className="mt-4 text-2xl font-extrabold text-kotoba-primary">
                  {formatPrice(pack.price_cents, pack.currency)}
                </p>
                <button
                  type="button"
                  onClick={() => setBookingPack(pack)}
                  className="mt-4 w-full px-4 py-2 rounded-md bg-kotoba-secondary text-kotoba-text font-semibold hover:bg-kotoba-secondary-dark"
                >
                  Book this pack
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <footer className="bg-kotoba-primary text-white/80 py-6 text-center text-sm">
        <p>
          Powered by{' '}
          <a href="https://kotobaseed.net" className="underline hover:text-white">
            Kotobaseed
          </a>
        </p>
      </footer>

      {bookingPack && (
        <BookingDialog
          pack={bookingPack}
          tutorDisplayName={tutor.display_name}
          onClose={() => setBookingPack(null)}
        />
      )}
    </div>
  );
};

export default TutorHome;
