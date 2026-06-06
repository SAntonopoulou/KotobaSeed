import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { apexUrl } from '../hooks/useTenant';
import BookingDialog from '../components/BookingDialog';
import { SECTION_COMPONENTS } from '../components/tutor_sections';

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
  const [packs, setPacks] = useState([]);
  const [trial, setTrial] = useState(null);
  const [testimonials, setTestimonials] = useState([]);
  const [sections, setSections] = useState([]);
  const [bookingPack, setBookingPack] = useState(null);
  const [bookingTrial, setBookingTrial] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [tutorRes, packsRes, trialRes, testimonialsRes, sectionsRes] = await Promise.all([
          client.get('/tutor/me'),
          client.get('/tutor/lesson-packs').catch(() => ({ data: [] })),
          client.get('/tutor/trial').catch(() => ({ data: null })),
          client.get('/testimonials').catch(() => ({ data: [] })),
          client.get('/tutor/page-sections').catch(() => ({ data: [] })),
        ]);
        if (!cancelled) {
          setTutor(tutorRes.data);
          setPacks(packsRes.data || []);
          setTrial(trialRes.data || null);
          setTestimonials(testimonialsRes.data || []);
          setSections(sectionsRes.data || []);
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

  const isPaused = tutor.account_status !== 'active';
  const isOwner = currentUser && currentUser.id === tutor.user_id;

  // Section components share a single tutor object that includes parsed
  // languages — saves them each re-parsing.
  const tutorWithLanguages = { ...tutor, _languages: parseLanguages(tutor.languages_taught) };

  const visibleSections = (sections || []).filter((s) => s.is_visible !== false);
  const themeClass = `theme-${tutor.theme || 'sage'}`;
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className={`${themeClass} bg-kotoba-background min-h-screen`}>
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
            <Link
              to="/articles"
              className="hidden sm:inline-block text-sm text-kotoba-text/70 hover:text-kotoba-primary px-2"
            >
              Articles
            </Link>
            <Link
              to="/placement-test"
              className="hidden sm:inline-block text-sm text-kotoba-text/70 hover:text-kotoba-primary px-2"
            >
              Placement test
            </Link>
            <Link
              to="/modules"
              className="hidden sm:inline-block text-sm text-kotoba-text/70 hover:text-kotoba-primary px-2"
            >
              Modules
            </Link>
            {isOwner && (
              <>
                <a
                  href={apexUrl('/messages')}
                  className="hidden sm:inline-block text-sm text-kotoba-text/70 hover:text-kotoba-primary px-2"
                >
                  Messages
                </a>
                <Link
                  to="/dashboard"
                  className="px-4 py-2 rounded-md border-2 border-kotoba-primary text-kotoba-primary font-medium hover:bg-kotoba-primary hover:text-white transition-colors text-sm"
                >
                  Manage
                </Link>
              </>
            )}
            <a
              href="#book"
              className="hidden sm:inline-block px-4 py-2 rounded-md bg-kotoba-secondary text-kotoba-text font-medium hover:bg-kotoba-secondary-dark"
            >
              Book a lesson
            </a>
            {/* Mobile menu trigger — replaces the hidden links */}
            <button
              type="button"
              onClick={() => setMobileNavOpen(v => !v)}
              aria-label={mobileNavOpen ? 'Close menu' : 'Open menu'}
              className="sm:hidden p-2 text-kotoba-text/70 hover:text-kotoba-primary"
            >
              {mobileNavOpen ? '✕' : '☰'}
            </button>
          </div>
        </div>
        {mobileNavOpen && (
          <nav className="sm:hidden border-t border-kotoba-text/10 px-4 py-3 space-y-1">
            <Link onClick={() => setMobileNavOpen(false)} to="/articles" className="block px-2 py-2 rounded text-base text-kotoba-text hover:bg-kotoba-primary/5">Articles</Link>
            <Link onClick={() => setMobileNavOpen(false)} to="/placement-test" className="block px-2 py-2 rounded text-base text-kotoba-text hover:bg-kotoba-primary/5">Placement test</Link>
            <Link onClick={() => setMobileNavOpen(false)} to="/modules" className="block px-2 py-2 rounded text-base text-kotoba-text hover:bg-kotoba-primary/5">Modules</Link>
            {isOwner && (
              <a onClick={() => setMobileNavOpen(false)} href={apexUrl('/messages')} className="block px-2 py-2 rounded text-base text-kotoba-text hover:bg-kotoba-primary/5">Messages</a>
            )}
            <a
              onClick={() => setMobileNavOpen(false)}
              href="#book"
              className="block px-2 py-2 rounded text-base font-semibold text-kotoba-text bg-kotoba-secondary/30 hover:bg-kotoba-secondary/50"
            >
              Book a lesson
            </a>
          </nav>
        )}
      </header>

      {isPaused && (
        <div className="bg-kotoba-secondary/20 text-kotoba-text text-sm py-2 px-4 text-center">
          This site is still being set up — bookings open as soon as Stripe verification is finished.
        </div>
      )}

      {visibleSections.map((section, idx) => {
        const Component = SECTION_COMPONENTS[section.section_type];
        if (!Component) return null;
        return (
          <Component
            key={section.id ?? `${section.section_type}-${idx}`}
            tutor={tutorWithLanguages}
            packs={packs}
            trial={trial}
            testimonials={testimonials}
            isOwner={isOwner}
            content={section.content || {}}
            onBookPack={setBookingPack}
            onBookTrial={() => setBookingTrial(true)}
          />
        );
      })}

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

      {bookingTrial && trial && (
        <BookingDialog
          pack={{
            id: null,
            name: `Free ${trial.free_trial_minutes}-minute trial`,
            description: 'A short intro lesson on us — no card needed.',
            num_lessons: 1,
            duration_minutes: trial.free_trial_minutes,
            price_cents: 0,
            currency: 'eur',
            isTrial: true,
          }}
          tutorDisplayName={tutor.display_name}
          onClose={() => setBookingTrial(false)}
        />
      )}
    </div>
  );
};

export default TutorHome;
