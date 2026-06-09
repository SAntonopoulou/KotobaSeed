import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaBars, FaXmark } from 'react-icons/fa6';
import { apexUrl } from '../../hooks/useTenant';
import NewsletterSignupBar from '../../components/NewsletterSignupBar';
import './sophia_inkwell.css';

// SophiaLayout — bespoke chrome for Sophia's tenant only. Mirrors the
// shape of VassoLayout / DafniLayout so every themed sub-page behaves
// consistently. Inkwell direction: deep navy + bone cream + coral
// accent, Playfair Display headings + Inter body.

function BrandMark({ initial = 'S' }) {
  return (
    <span className="s-logo-mark" aria-hidden="true">
      {initial}
    </span>
  );
}

function BrandLogo({ firstName = 'Sophia', wordmark }) {
  const initial = (firstName || 'S').charAt(0).toUpperCase();
  const l1 = wordmark?.l1 || firstName;
  const l2 = wordmark?.l2 || 'English, made human.';
  return (
    <Link to="/" className="s-logo" aria-label="Home">
      <BrandMark initial={initial} />
      <span className="s-logo-text">
        <span className="s-logo-l1">{l1}</span>
        <span className="s-logo-l2">{l2}</span>
      </span>
    </Link>
  );
}

// Dashboard URL — picks the right destination for the logged-in user.
//   - admin             → apex /admin/dashboard
//   - support/manager   → apex /staff/support
//   - creator (tutor)   → same-origin /dashboard (tenant's tutor dashboard)
//   - student / other   → apex /student/dashboard (cross-subdomain)
// Same rule the apex Navbar uses; just made tenant-aware so creators
// stay on this tenant subdomain.
function dashboardHrefFor(currentUser) {
  if (!currentUser) return null;
  if (currentUser.role === 'admin') return apexUrl('/admin/dashboard');
  if (['support', 'manager', 'moderator'].includes(currentUser.role)) {
    return apexUrl('/staff/support');
  }
  if (currentUser.role === 'tutor') return '/dashboard';
  return apexUrl('/student/dashboard');
}

function SiteHeader({ variant = 'landing', firstName, currentUser, isOwner, onLogout, wordmark, nav }) {
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
      ? themedNav.map((n) => [n.label, n.href === undefined ? '#' : n.href.startsWith('#') ? anchor(n.href.slice(1)) : n.href])
      : variant === 'simple'
      ? [['Journal', '/articles'], ['Modules', '/modules']]
      : [['Pricing', anchor('pricing')], ['Journal', '/articles'], ['Reviews', '/reviews']];

  return (
    <>
      <header className="s-hd">
        <div className="s-wrap">
          <div className="s-hd-row">
            <BrandLogo firstName={firstName} wordmark={wordmark} />
            <nav className="s-nav">
              {navLinks.map(([label, href]) =>
                href.startsWith('/') && !href.includes('#') ? (
                  <Link key={label} to={href}>{label}</Link>
                ) : (
                  <a key={label} href={href}>{label}</a>
                ),
              )}
            </nav>
            <div className="s-hd-right">
              {currentUser ? (
                <>
                  {isOwner && (
                    <Link to="/dashboard" className="s-btn s-btn-ghost">Dashboard</Link>
                  )}
                  <button onClick={onLogout} className="s-btn s-btn-primary">Sign out</button>
                </>
              ) : (
                <>
                  <Link to="/login" className="s-btn s-btn-ghost">Sign in</Link>
                  <a href={anchor('pricing')} className="s-btn s-btn-primary">Book a lesson</a>
                </>
              )}
              <button className="s-burger" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}>
                <FaBars size={20} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {open && (
        <>
          <div className="s-mob-ov" onClick={close} role="presentation" />
          <aside className="s-mob-drawer" role="dialog" aria-modal="true" aria-label="Site navigation">
            <div className="s-mob-head">
              <BrandLogo firstName={firstName} wordmark={wordmark} />
              <button className="s-burger" style={{ display: 'grid' }} aria-label="Close menu" onClick={close}>
                <FaXmark size={20} />
              </button>
            </div>
            <nav className="s-mob-nav">
              {navLinks.map(([label, href]) =>
                href.startsWith('/') && !href.includes('#') ? (
                  <Link key={label} onClick={close} to={href}>{label}</Link>
                ) : (
                  <a key={label} onClick={close} href={href}>{label}</a>
                ),
              )}
            </nav>
            <div className="s-mob-foot">
              {currentUser ? (
                <>
                  {isOwner && (
                    <Link onClick={close} to="/dashboard" className="s-btn s-btn-outline">Dashboard</Link>
                  )}
                  <button onClick={() => { close(); onLogout?.(); }} className="s-btn s-btn-primary">Sign out</button>
                </>
              ) : (
                <>
                  <Link onClick={close} to="/login" className="s-btn s-btn-outline">Sign in</Link>
                  <a onClick={close} href={anchor('pricing')} className="s-btn s-btn-primary">Book a lesson</a>
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
    ['Learn', [['Journal', '/articles'], ['Modules', '/modules'], ['Reviews', '/reviews']]],
    ['Teacher', [[`About ${firstName}`, '/#about'], ['Pricing', '/#pricing']]],
    ['Support', [['Sign in', '/login'], ['Book a lesson', '/#pricing']]],
  ];
  const cols = footer?.columns || defaultCols;
  const tagline = footer?.tagline || 'English lessons that respect your time, your ear, and your work.';
  return (
    <footer className="s-ft">
      <NewsletterSignupBar tutorSlug={tutor?.tutor_slug} />
      <div className="s-wrap">
        <div className="s-ft-top">
          <div>
            <BrandLogo firstName={firstName} wordmark={wordmark} />
            <p className="s-ft-tagline">{tagline}</p>
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
        <div className="s-ft-bottom">
          <span>© {new Date().getFullYear()} Kotobaseed · Made with care for language learners</span>
          <span style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
            {showKotobaseedLink && (
              <a href={apexUrl('/discover')} className="s-ft-cross">Browse Kotobaseed</a>
            )}
            <a href={apexUrl('/legal/privacy')}>Privacy</a>
            <a href={apexUrl('/legal/terms')}>Terms</a>
          </span>
        </div>
      </div>
    </footer>
  );
}

const SophiaLayout = ({
  tutor,
  currentUser,
  onLogout,
  variant = 'landing',
  setTitle = null,
  chrome,
  children,
}) => {
  const firstName =
    (tutor?.display_name || '').trim().split(/\s+/)[0] || 'Sophia';
  const showKotobaseedLink = tutor?.show_kotobaseed_link !== false;
  // Only the tutor who OWNS this tenant sees the Dashboard link in their
  // own site's header. Students + other visiting tutors don't see it —
  // they navigate to their own dashboard via the apex Navbar.
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
    <div className="theme-sophia-inkwell-site">
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

export default SophiaLayout;
