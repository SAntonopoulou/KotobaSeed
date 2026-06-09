import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { apexUrl } from '../hooks/useTenant';
import BookingDialog from '../components/BookingDialog';
import NewsletterSignupCard from '../components/NewsletterSignupCard';
import { SECTION_COMPONENTS } from '../components/tutor_sections';
import { getErrorMessage } from '../utils/errors';
import CustomThemeSite from '../themes/CustomThemeSite';

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
  const { currentUser, logout } = useAuth();
  const [tutor, setTutor] = useState(null);
  const [packs, setPacks] = useState([]);
  const [trial, setTrial] = useState(null);
  const [testimonials, setTestimonials] = useState([]);
  const [sections, setSections] = useState([]);
  // Extras needed by the vasso-greek tenant renderer. Both endpoints
  // exist on the tenant API and are no-ops for tutors who don't sell
  // either — they just return 404 / null and we render around it.
  const [singleLesson, setSingleLesson] = useState(null);
  const [subscriptionPlan, setSubscriptionPlan] = useState(null);
  // v2 custom theme — fetched lazily when Tutor.theme starts with
  // `custom-`. null means "not a custom theme" or "still loading".
  const [v2Theme, setV2Theme] = useState(null);
  const [v2ThemeLoaded, setV2ThemeLoaded] = useState(false);
  const [bookingPack, setBookingPack] = useState(null);
  const [bookingTrial, setBookingTrial] = useState(false);
  const [error, setError] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [
          tutorRes,
          packsRes,
          trialRes,
          testimonialsRes,
          sectionsRes,
          singleRes,
          planRes,
        ] = await Promise.all([
          client.get('/tutor/me'),
          client.get('/tutor/lesson-packs').catch(() => ({ data: [] })),
          client.get('/tutor/trial').catch(() => ({ data: null })),
          client.get('/testimonials').catch(() => ({ data: [] })),
          client.get('/tutor/page-sections').catch(() => ({ data: [] })),
          client.get('/tutor/single-lesson').catch(() => ({ data: null })),
          client.get('/tutor/subscription-plan/public').catch(() => ({ data: null })),
        ]);
        if (!cancelled) {
          setTutor(tutorRes.data);
          setPacks(packsRes.data || []);
          setTrial(trialRes.data || null);
          setTestimonials(testimonialsRes.data || []);
          setSections(sectionsRes.data || []);
          setSingleLesson(singleRes.data || null);
          setSubscriptionPlan(planRes.data || null);
        }
      } catch (err) {
        if (!cancelled) {
          if (err?.response?.status === 404) {
            setError("This site isn't set up yet.");
          } else {
            setError(getErrorMessage(err, 'Could not load this site.'));
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
      <div className="font-sans bg-kotoba-background min-h-screen flex items-center justify-center p-8">
        <div className="bg-white rounded-3xl shadow-soft p-8 max-w-md text-center">
          <h1 className="font-display text-2xl font-bold text-kotoba-primary mb-2">Not here</h1>
          <p className="text-kotoba-text/70">{error}</p>
        </div>
      </div>
    );
  }

  if (!tutor) {
    return (
      <div className="font-sans bg-kotoba-background min-h-screen flex items-center justify-center">
        <p className="text-kotoba-text/60">Loading…</p>
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

  // v2 upload-driven custom theme — fetch the theme row by key + mount
  // the generic CustomThemeSite renderer. The fetch is lazy + cached
  // on the `v2Theme` state so it doesn't run for tutors on a stock
  // theme. While loading, render nothing rather than the default
  // layout briefly — otherwise the visitor sees a flash of sage.
  if (typeof tutor.theme === 'string' && tutor.theme.startsWith('custom-')) {
    if (!v2ThemeLoaded) {
      client
        .get(`/custom-themes/v2/by-key/${tutor.theme}`)
        .then((res) => { setV2Theme(res.data); setV2ThemeLoaded(true); })
        .catch(() => { setV2Theme(null); setV2ThemeLoaded(true); });
      return (
        <div className="font-sans bg-kotoba-background min-h-screen flex items-center justify-center">
          <p className="text-kotoba-text/60">Loading theme…</p>
        </div>
      );
    }
    if (v2Theme) {
      return (
        <CustomThemeSite
          theme={v2Theme}
          tutor={tutor}
          packs={packs}
          trial={trial}
          testimonials={testimonials}
          singleLesson={singleLesson}
          subscriptionPlan={subscriptionPlan}
          pageSections={sections}
          currentUser={currentUser}
          onLogout={logout}
        />
      );
    }
    // Theme key set but row missing — fall through to the default
    // layout rather than show a hard 404. The tutor's settings will
    // tell them the theme they picked is missing on the next dashboard
    // visit.
  }

  return (
    <div className={`${themeClass} font-sans bg-kotoba-background min-h-screen text-kotoba-text`}>
      <header className="sticky top-0 z-30 backdrop-blur-md bg-white/80 border-b border-kotoba-text/[0.06]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <a
              href={apexUrl('/')}
              className="text-[10px] font-bold uppercase tracking-[0.18em] text-kotoba-text/50 hover:text-kotoba-primary transition-colors"
              title="Browse Kotobaseed"
            >
              Kotobaseed
            </a>
            <span className="text-kotoba-text/20">/</span>
            <span className="font-display text-lg sm:text-xl font-bold text-kotoba-primary truncate">
              {tutor.display_name}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Link
              to="/articles"
              className="hidden sm:inline-flex items-center px-3 py-1.5 text-sm text-kotoba-text/70 hover:text-kotoba-primary rounded-lg hover:bg-kotoba-primary/5 transition-colors"
            >
              Articles
            </Link>
            <Link
              to="/placement-test"
              className="hidden sm:inline-flex items-center px-3 py-1.5 text-sm text-kotoba-text/70 hover:text-kotoba-primary rounded-lg hover:bg-kotoba-primary/5 transition-colors"
            >
              Placement test
            </Link>
            <Link
              to="/modules"
              className="hidden sm:inline-flex items-center px-3 py-1.5 text-sm text-kotoba-text/70 hover:text-kotoba-primary rounded-lg hover:bg-kotoba-primary/5 transition-colors"
            >
              Modules
            </Link>
            {isOwner && (
              <>
                <a
                  href={apexUrl('/messages')}
                  className="hidden sm:inline-flex items-center px-3 py-1.5 text-sm text-kotoba-text/70 hover:text-kotoba-primary rounded-lg hover:bg-kotoba-primary/5 transition-colors"
                >
                  Messages
                </a>
                <Link
                  to="/dashboard"
                  className="ml-1 hidden sm:inline-flex items-center px-3.5 py-1.5 rounded-xl border border-kotoba-primary/30 text-kotoba-primary text-sm font-semibold hover:border-kotoba-primary hover:bg-kotoba-primary/5 transition-colors"
                >
                  Manage
                </Link>
              </>
            )}
            <a
              href="#book"
              className="hidden sm:inline-flex items-center ml-1 px-4 py-2 rounded-xl bg-kotoba-secondary text-kotoba-text text-sm font-semibold shadow-soft hover:shadow-soft-glow hover:-translate-y-0.5 transition-all duration-300 ease-soft"
            >
              Book a lesson
            </a>
            <button
              type="button"
              onClick={() => setMobileNavOpen(v => !v)}
              aria-label={mobileNavOpen ? 'Close menu' : 'Open menu'}
              className="sm:hidden p-2 text-kotoba-text/70 hover:text-kotoba-primary rounded-lg hover:bg-kotoba-primary/5 transition-colors"
            >
              {mobileNavOpen ? '✕' : '☰'}
            </button>
          </div>
        </div>
        {mobileNavOpen && (
          <nav className="sm:hidden border-t border-kotoba-text/[0.06] bg-white/95 backdrop-blur-md px-4 py-3 space-y-1">
            <Link onClick={() => setMobileNavOpen(false)} to="/articles" className="block px-3 py-2 rounded-xl text-base text-kotoba-text hover:bg-kotoba-primary/5">Articles</Link>
            <Link onClick={() => setMobileNavOpen(false)} to="/placement-test" className="block px-3 py-2 rounded-xl text-base text-kotoba-text hover:bg-kotoba-primary/5">Placement test</Link>
            <Link onClick={() => setMobileNavOpen(false)} to="/modules" className="block px-3 py-2 rounded-xl text-base text-kotoba-text hover:bg-kotoba-primary/5">Modules</Link>
            {isOwner && (
              <a onClick={() => setMobileNavOpen(false)} href={apexUrl('/messages')} className="block px-3 py-2 rounded-xl text-base text-kotoba-text hover:bg-kotoba-primary/5">Messages</a>
            )}
            <a
              onClick={() => setMobileNavOpen(false)}
              href="#book"
              className="block px-3 py-2 rounded-xl text-base font-semibold text-kotoba-text bg-kotoba-secondary/30 hover:bg-kotoba-secondary/50"
            >
              Book a lesson
            </a>
          </nav>
        )}
      </header>

      {isPaused && (
        <div className="bg-kotoba-secondary/25 border-b border-kotoba-secondary/40 text-kotoba-text text-sm py-2.5 px-4 text-center">
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

      {!visibleSections.some((s) => s.section_type === 'newsletter_signup') && (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
          <NewsletterSignupCard tutorSlug={tutor.tutor_slug} />
        </div>
      )}

      {tutor.plan !== 'business' && (
        <footer className="relative bg-kotoba-primary text-white/80 py-10 text-center text-sm overflow-hidden isolate">
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10"
            style={{
              background:
                'radial-gradient(ellipse 60% 70% at 100% 0%, rgba(214,164,47,0.15), transparent 60%)',
            }}
          />
          <div className="v2-noise" />
          <p className="relative">
            Powered by{' '}
            <a
              href={apexUrl('/')}
              target="_blank"
              rel="noopener noreferrer"
              className="font-display font-bold text-kotoba-secondary hover:text-white transition-colors"
            >
              Kotobaseed
            </a>
          </p>
        </footer>
      )}

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
