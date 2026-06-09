import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaBars, FaXmark } from 'react-icons/fa6';
import { apexUrl } from '../../hooks/useTenant';
import NewsletterSignupBar from '../../components/NewsletterSignupBar';
import './mary_meadow.css';

// MaryLayout — bespoke chrome for Mary's tenant only. Mirrors the shape
// of VassoLayout / DafniLayout (sticky header, mobile drawer, footer
// with brand mark + columns + cross-promo) so every themed sub-page
// behaves consistently across the platform. Visual treatment is
// entirely Mary's — cottagecore + folklore letter, soft blush + sage +
// cream, handwritten Caveat wordmark, gentle rounded geometry.
//
// Two header variants:
//   'landing' — full nav (How it works / Levels / Lessons / Journal /
//               Reviews)
//   'simple'  — trimmed (Journal / Modules) for sub-pages
//
// Theme can override the wordmark + nav + footer copy via the chrome
// prop (same shape Vasso + Dafni accept). Mary's seed populates this
// so the layout fully reflects her brand without hardcoded strings.

function BrandLogo({ firstName = 'Mary', wordmark }) {
  const initial = (firstName || 'M').charAt(0).toUpperCase();
  const l1 = wordmark?.l1 || 'Learn with';
  const l2 = wordmark?.l2 || firstName;
  return (
    <Link to="/" className="m-logo" aria-label="Home">
      <span className="m-logo-mark" aria-hidden="true">{initial}</span>
      <span className="m-logo-text">
        <span className="m-logo-l1">{l1}</span>
        <span className="m-logo-l2">{l2}</span>
      </span>
    </Link>
  );
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

  const anchor = (frag) => (variant === 'simple' ? `/#${frag}` : `#${frag}`);

  const themedNav = nav?.[variant];
  const navLinks =
    themedNav && themedNav.length > 0
      ? themedNav.map((n) => [
          n.label,
          n.href === undefined ? '#' : n.href.startsWith('#') ? anchor(n.href.slice(1)) : n.href,
        ])
      : variant === 'simple'
      ? [
          ['Journal', '/articles'],
          ['Modules', '/modules'],
        ]
      : [
          ['How it works', anchor('how')],
          ['Levels', anchor('levels')],
          ['Lessons', anchor('pricing')],
          ['Journal', '/articles'],
          ['Reviews', '/reviews'],
        ];

  return (
    <>
      <header className="m-hd">
        <div className="m-wrap">
          <div className="m-hd-row">
            <BrandLogo firstName={firstName} wordmark={wordmark} />
            <nav className="m-nav">
              {navLinks.map(([label, href]) =>
                href.startsWith('/') && !href.includes('#') ? (
                  <Link key={label} to={href}>{label}</Link>
                ) : (
                  <a key={label} href={href}>{label}</a>
                ),
              )}
            </nav>
            <div className="m-hd-right">
              {currentUser ? (
                <>
                  {isOwner && (
                    <Link to="/dashboard" className="m-btn m-btn-ghost">Dashboard</Link>
                  )}
                  <button onClick={onLogout} className="m-btn m-btn-primary">
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <Link to="/login" className="m-btn m-btn-ghost">Sign in</Link>
                  <a href={anchor('pricing')} className="m-btn m-btn-primary">
                    Book a lesson
                  </a>
                </>
              )}
              <button
                className="m-burger"
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
          <div className="m-mob-ov" onClick={close} role="presentation" />
          <aside
            className="m-mob-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Site navigation"
          >
            <div className="m-mob-head">
              <BrandLogo firstName={firstName} wordmark={wordmark} />
              <button
                className="m-burger"
                style={{ display: 'grid' }}
                aria-label="Close menu"
                onClick={close}
              >
                <FaXmark size={20} />
              </button>
            </div>
            <nav className="m-mob-nav">
              {navLinks.map(([label, href]) =>
                href.startsWith('/') && !href.includes('#') ? (
                  <Link key={label} onClick={close} to={href}>{label}</Link>
                ) : (
                  <a key={label} onClick={close} href={href}>{label}</a>
                ),
              )}
            </nav>
            <div className="m-mob-foot">
              {currentUser ? (
                <>
                  {isOwner && (
                    <Link onClick={close} to="/dashboard" className="m-btn m-btn-outline">
                      Dashboard
                    </Link>
                  )}
                  <button
                    onClick={() => { close(); onLogout?.(); }}
                    className="m-btn m-btn-primary"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <Link onClick={close} to="/login" className="m-btn m-btn-outline">
                    Sign in
                  </Link>
                  <a onClick={close} href={anchor('pricing')} className="m-btn m-btn-primary">
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
        ['Lessons', '/#pricing'],
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
  const tagline =
    footer?.tagline ||
    'Slow, warm, one-to-one lessons in English and Greek — for grown-ups who want to learn at a kind pace.';
  return (
    <footer className="m-ft">
      <NewsletterSignupBar tutorSlug={tutor?.tutor_slug} />
      <div className="m-wrap">
        <div className="m-ft-top">
          <div>
            <BrandLogo firstName={firstName} wordmark={wordmark} />
            <p className="m-ft-tagline">{tagline}</p>
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
        <div className="m-ft-bottom">
          <span>
            © {new Date().getFullYear()} Kotobaseed · Made with care for language lovers
          </span>
          <span style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            {showKotobaseedLink && (
              <a href={apexUrl('/discover')} className="m-ft-cross">
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

const MaryLayout = ({
  tutor,
  currentUser,
  onLogout,
  variant = 'landing',
  setTitle = null,
  chrome,
  children,
}) => {
  const firstName =
    (tutor?.display_name || '').trim().split(/\s+/)[0] || 'Mary';
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
    <div className="theme-mary-meadow-site">
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

export default MaryLayout;
