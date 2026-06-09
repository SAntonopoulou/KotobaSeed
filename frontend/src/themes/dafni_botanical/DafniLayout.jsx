import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaBars, FaXmark } from 'react-icons/fa6';
import { apexUrl } from '../../hooks/useTenant';
import NewsletterSignupBar from '../../components/NewsletterSignupBar';
import './dafni_botanical.css';

// DafniLayout — bespoke chrome for Dafni's tenant only. Mirrors the
// shape of VassoLayout (sticky header, mobile drawer, footer with
// brand mark + columns + cross-promo) so every themed sub-page
// behaves consistently. Visual treatment is entirely Dafni's —
// warm botanical, no shared CSS with Vasso's pack.
//
// Two header variants:
//   'landing' — full nav (How it works / Levels / Pricing / Journal /
//               Reviews)
//   'simple'  — trimmed (Journal / Modules) for sub-pages
//
// Theme can override the wordmark + nav + footer copy through the
// `chrome` prop (same shape VassoLayout accepts); Dafni's seed
// populates this so the layout fully reflects her brand without
// shipping hardcoded strings.

function BrandMark({ initial = 'D' }) {
  return (
    <span className="d-logo-mark" aria-hidden="true">
      {initial}
    </span>
  );
}

function BrandLogo({ firstName = 'Dafni', wordmark }) {
  const initial = (firstName || 'D').charAt(0).toUpperCase();
  const l1 = wordmark?.l1 || firstName;
  const l2 = wordmark?.l2 || 'a teacher who listens';
  return (
    <Link to="/" className="d-logo" aria-label="Home">
      <BrandMark initial={initial} />
      <span className="d-logo-text">
        <span className="d-logo-l1">{l1}</span>
        <span className="d-logo-l2">{l2}</span>
      </span>
    </Link>
  );
}

// Dashboard URL — picks the right destination for the logged-in user.
// Creators stay on this tenant subdomain (/dashboard renders TutorDashboard);
// students + admins cross-link back to the apex.
function dashboardHrefFor(currentUser) {
  if (!currentUser) return null;
  if (currentUser.role === 'admin') return apexUrl('/admin/dashboard');
  if (['support', 'manager', 'moderator'].includes(currentUser.role)) {
    return apexUrl('/staff/support');
  }
  if (currentUser.role === 'creator') return '/dashboard';
  return apexUrl('/student/dashboard');
}

function SiteHeader({
  variant = 'landing',
  firstName,
  isOwner,
  currentUser,
  onLogout,
  wordmark,
  nav,
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Anchor links go to /#frag from sub-pages so they land on the home
  // page first and then scroll to the section.
  const anchor = (frag) => (variant === 'simple' ? `/#${frag}` : `#${frag}`);

  const themedNav = nav?.[variant];
  const navLinks =
    themedNav && themedNav.length > 0
      ? themedNav.map((n) => [n.label, n.href === undefined ? '#' : n.href.startsWith('#') ? anchor(n.href.slice(1)) : n.href])
      : variant === 'simple'
      ? [
          ['Journal', '/articles'],
          ['Modules', '/modules'],
        ]
      : [
          ['Pricing', anchor('pricing')],
          ['Journal', '/articles'],
          ['Reviews', '/reviews'],
        ];

  return (
    <>
      <header className="d-hd">
        <div className="d-wrap">
          <div className="d-hd-row">
            <BrandLogo firstName={firstName} wordmark={wordmark} />
            <nav className="d-nav">
              {navLinks.map(([label, href]) =>
                href.startsWith('/') && !href.includes('#') ? (
                  <Link key={label} to={href}>{label}</Link>
                ) : (
                  <a key={label} href={href}>{label}</a>
                ),
              )}
            </nav>
            <div className="d-hd-right">
              {currentUser ? (
                <>
                  {isOwner && (
                    <Link to="/dashboard" className="d-btn d-btn-ghost">Dashboard</Link>
                  )}
                  <button onClick={onLogout} className="d-btn d-btn-primary">
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <Link to="/login" className="d-btn d-btn-ghost">
                    Sign in
                  </Link>
                  <a href={anchor('pricing')} className="d-btn d-btn-primary">
                    Book a lesson
                  </a>
                </>
              )}
              <button
                className="d-burger"
                aria-label="Open menu"
                aria-expanded={open}
                onClick={() => setOpen(true)}
              >
                <FaBars size={20} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {open && (
        <>
          <div className="d-mob-ov" onClick={close} role="presentation" />
          <aside
            className="d-mob-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Site navigation"
          >
            <div className="d-mob-head">
              <BrandLogo firstName={firstName} wordmark={wordmark} />
              <button
                className="d-burger"
                style={{ display: 'grid' }}
                aria-label="Close menu"
                onClick={close}
              >
                <FaXmark size={20} />
              </button>
            </div>
            <nav className="d-mob-nav">
              {navLinks.map(([label, href]) =>
                href.startsWith('/') && !href.includes('#') ? (
                  <Link key={label} onClick={close} to={href}>{label}</Link>
                ) : (
                  <a key={label} onClick={close} href={href}>{label}</a>
                ),
              )}
            </nav>
            <div className="d-mob-foot">
              {currentUser ? (
                <>
                  {isOwner && (
                    <Link onClick={close} to="/dashboard" className="d-btn d-btn-outline">Dashboard</Link>
                  )}
                  <button
                    onClick={() => { close(); onLogout?.(); }}
                    className="d-btn d-btn-primary"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <Link
                    onClick={close}
                    to="/login"
                    className="d-btn d-btn-outline"
                  >
                    Sign in
                  </Link>
                  <a
                    onClick={close}
                    href={anchor('pricing')}
                    className="d-btn d-btn-primary"
                  >
                    Book a lesson
                  </a>
                </>
              )}
            </div>
          </aside>
        </>
      )}
    </>
  );
}

function SiteFooter({ tutor, firstName, showKotobaseedLink, wordmark, footer }) {
  const defaultCols = [
    [
      'Learn',
      [
        ['Journal', '/articles'],
        ['Modules', '/modules'],
        ['Reviews', '/reviews'],
      ],
    ],
    [
      'Teacher',
      [
        [`About ${firstName}`, '/#about'],
        ['Pricing', '/#pricing'],
      ],
    ],
    [
      'Support',
      [
        ['Sign in', '/login'],
        ['Book a lesson', '/#pricing'],
      ],
    ],
  ];
  const cols = footer?.columns || defaultCols;
  const tagline = footer?.tagline || 'Lessons that feel like a warm conversation with a friend who happens to know the language.';
  return (
    <footer className="d-ft">
      <NewsletterSignupBar tutorSlug={tutor?.tutor_slug} />
      <div className="d-wrap">
        <div className="d-ft-top">
          <div>
            <BrandLogo firstName={firstName} wordmark={wordmark} />
            <p className="d-ft-tagline">{tagline}</p>
          </div>
          {cols.map(([heading, links]) => (
            <div key={heading}>
              <h4>{heading}</h4>
              {links.map(([label, href]) =>
                href.startsWith('/') && !href.includes('#') ? (
                  <Link key={label} to={href}>{label}</Link>
                ) : (
                  <a key={label} href={href}>{label}</a>
                ),
              )}
            </div>
          ))}
        </div>
        <div className="d-ft-bottom">
          <span>
            © {new Date().getFullYear()} Kotobaseed · Made with care for language lovers
          </span>
          <span style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
            {showKotobaseedLink && (
              <a href={apexUrl('/discover')} className="d-ft-cross">
                Browse Kotobaseed
              </a>
            )}
            <a href={apexUrl('/legal/privacy')}>Privacy</a>
            <a href={apexUrl('/legal/terms')}>Terms</a>
          </span>
        </div>
      </div>
    </footer>
  );
}

const DafniLayout = ({
  tutor,
  currentUser,
  onLogout,
  variant = 'landing',
  setTitle = null,
  chrome,
  children,
}) => {
  const firstName =
    (tutor?.display_name || '').trim().split(/\s+/)[0] || 'Dafni';
  const showKotobaseedLink = tutor?.show_kotobaseed_link !== false;
  const isOwner = Boolean(
    currentUser && tutor && currentUser.id === tutor.user_id,
  );

  useEffect(() => {
    if (!setTitle) return undefined;
    const prev = document.title;
    document.title = setTitle;
    return () => { document.title = prev; };
  }, [setTitle]);

  const wordmark = chrome?.wordmark;
  const nav = chrome?.nav;
  const footer = chrome?.footer;

  return (
    <div className="theme-dafni-botanical-site">
      <SiteHeader
        variant={variant}
        firstName={firstName}
        currentUser={currentUser}
        isOwner={isOwner}
        onLogout={onLogout}
        wordmark={wordmark}
        nav={nav}
      />
      {children}
      <SiteFooter
        tutor={tutor}
        firstName={firstName}
        showKotobaseedLink={showKotobaseedLink}
        wordmark={wordmark}
        footer={footer}
      />
    </div>
  );
};

export default DafniLayout;
