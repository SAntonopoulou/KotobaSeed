import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FaArrowRight,
  FaBars,
  FaXmark,
} from 'react-icons/fa6';
import { apexUrl } from '../../hooks/useTenant';
import client from '../../api/client';
import './vasso_greek.css';

// VassoLayout — shared chrome (header, mobile drawer, footer) used by
// every themed page on Vasso's tenant. Lives in the same scope
// `.theme-vasso-greek-site` so the design tokens cascade.
//
// Two header variants mirror the source `greekvasso` codebase:
//
//   variant="landing"  → full sticky header with anchor nav
//                        (How it works / Levels / Pricing / Journal /
//                         Reviews). Used by VassoGreekSite.
//   variant="simple"   → trimmed header: logo + "Self-paced / Journal"
//                        + auth CTAs. Used by sub-pages like the
//                        Articles list, the Article reader, etc.
//
// The landing's anchor links rewrite to `/#how` when used on a
// sub-page so the link still works (route to landing + scroll).

const ArrowRight = FaArrowRight;
const Menu = FaBars;
const X = FaXmark;

function Mark({ size = 36, rev = false }) {
  return (
    <span
      className={'amark' + (rev ? ' rev' : '')}
      aria-hidden="true"
      style={{ width: size, height: size, borderRadius: size * 0.32 }}
    >
      <span
        className="a"
        style={{ fontSize: size * 0.7, marginTop: size * 0.05 }}
      >
        α
      </span>
    </span>
  );
}

function BrandLogo({ rev = false, firstName = 'Vasso', size = 36, wordmark }) {
  const l1 = wordmark?.l1 || 'Learn';
  const l2 = wordmark?.l2 || `with ${firstName}`;
  return (
    <Link to="/" className={'v-logo' + (rev ? ' rev' : '')}>
      <Mark rev={rev} size={size} />
      <span className="wm">
        <span className="l1">{l1}</span>
        <span className="l2">{l2}</span>
      </span>
    </Link>
  );
}

// Dashboard URL — creators stay on this tenant subdomain
// (/dashboard renders TutorDashboard); students + admins cross-link
// back to the apex.
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
  homeHref = '/',
  wordmark,
  nav,
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Anchor links go to /#<frag> when we're on a sub-page so clicking
  // "Pricing" from /login or /articles routes back to the landing and
  // then scrolls into the section. On the landing itself, plain `#frag`
  // stays in-page. The variant prop carries this distinction:
  // 'landing' is the home page; 'simple' is every sub-page.
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
      <header className="hd">
        <div className="wrap">
          <div className="row">
            <BrandLogo firstName={firstName} wordmark={wordmark} />
            <nav>
              {navLinks.map(([label, href]) =>
                href.startsWith('/') && !href.includes('#') ? (
                  <Link key={label} to={href}>{label}</Link>
                ) : (
                  <a key={label} href={href}>{label}</a>
                ),
              )}
            </nav>
            <div className="right">
              {currentUser ? (
                <>
                  {isOwner && (
                    <Link to="/dashboard" className="v-btn v-btn-ghost">Dashboard</Link>
                  )}
                  <button onClick={onLogout} className="v-btn v-btn-primary">
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <Link to="/login" className="v-btn v-btn-ghost">
                    Sign in
                  </Link>
                  <a href={anchor('pricing')} className="v-btn v-btn-primary">
                    Start free trial
                  </a>
                </>
              )}
              <button
                className="burger"
                aria-label="Open menu"
                aria-expanded={open}
                onClick={() => setOpen(true)}
              >
                <Menu size={22} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {open && (
        <>
          <div className="mob-ov" onClick={close} role="presentation" />
          <aside
            className="mob-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Site navigation"
          >
            <div className="mob-head">
              <BrandLogo firstName={firstName} wordmark={wordmark} />
              <button className="burger" aria-label="Close menu" onClick={close}>
                <X size={22} />
              </button>
            </div>
            <nav className="mob-nav">
              {navLinks.map(([label, href]) =>
                href.startsWith('/') && !href.includes('#') ? (
                  <Link key={label} onClick={close} to={href}>{label}</Link>
                ) : (
                  <a key={label} onClick={close} href={href}>{label}</a>
                ),
              )}
            </nav>
            <div className="mob-foot">
              {currentUser ? (
                <>
                  {isOwner && (
                    <Link onClick={close} to="/dashboard" className="v-btn v-btn-secondary">Dashboard</Link>
                  )}
                  <button
                    onClick={() => { close(); onLogout?.(); }}
                    className="v-btn v-btn-primary"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <Link
                    onClick={close}
                    to="/login"
                    className="v-btn v-btn-secondary"
                  >
                    Sign in
                  </Link>
                  <a
                    onClick={close}
                    href={anchor('pricing')}
                    className="v-btn v-btn-primary"
                  >
                    Start free trial
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

function VassoFooterNewsletter({ tutorSlug }) {
  const [prefs, setPrefs] = React.useState(null);
  const [email, setEmail] = React.useState('');
  const [consent, setConsent] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState('');
  React.useEffect(() => {
    let cancelled = false;
    if (!tutorSlug) return undefined;
    (async () => {
      try {
        const res = await client.get(
          `/public/tutors/${tutorSlug}/newsletter-prefs`,
        );
        if (!cancelled) setPrefs(res.data);
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [tutorSlug]);
  if (!prefs || !prefs.enabled || !prefs.show_in_footer) return null;
  const submit = async (e) => {
    e.preventDefault();
    if (!consent) {
      setMsg('Tick the consent box first.');
      return;
    }
    setBusy(true);
    setMsg('');
    try {
      const res = await client.post(
        `/public/tutors/${tutorSlug}/newsletter-subscribe`,
        { email: email.trim().toLowerCase(), gdpr_consent: consent },
      );
      setMsg(res.data?.message || 'Check your inbox to confirm.');
      setEmail('');
      setConsent(false);
    } catch (err) {
      setMsg(err?.response?.data?.detail || 'Could not sign up.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="news" onSubmit={submit}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={prefs.cta_description || 'Your email for occasional notes'}
        aria-label="Email"
        required
        disabled={busy}
      />
      <button type="submit" aria-label="Subscribe" disabled={busy}>
        <ArrowRight size={18} />
      </button>
      <label style={{
        flexBasis: '100%',
        marginTop: 6,
        fontSize: 11,
        color: 'var(--fg-muted)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 6,
      }}>
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          disabled={busy}
          style={{ marginTop: 2 }}
        />
        <span>I'm OK with {prefs.tutor_display_name} emailing me. Confirmation link first; unsubscribe any time.</span>
      </label>
      {msg && (
        <p style={{
          flexBasis: '100%',
          margin: '6px 0 0',
          fontSize: 12,
          color: msg.toLowerCase().includes('inbox') || msg.toLowerCase().includes('confirm')
            ? '#166534' : '#b91c1c',
        }}>{msg}</p>
      )}
    </form>
  );
}

function SiteFooter({ tutor, firstName, showKotobaseedLink, wordmark, footer }) {
  // Footer chrome: theme can declare its own copy/columns; sensible
  // defaults derive from tutor.display_name so a brand-new custom
  // theme without footer overrides still produces a coherent footer.
  const defaultTagline = (
    <>One-to-one lessons with a teacher who is cheering you on.</>
  );
  const cols = footer?.columns || [
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
  const l1 = wordmark?.l1 || 'Learn';
  const l2 = wordmark?.l2 || `with ${firstName}`;
  return (
    <footer className="ft">
      <div className="wrap">
        <div className="top">
          <div>
            <div className="v-logo rev">
              <Mark size={36} rev />
              <span className="wm">
                <span className="l1">{l1}</span>
                <span className="l2">{l2}</span>
              </span>
            </div>
            <p>
              {footer?.tagline ? footer.tagline : defaultTagline}
            </p>
            <VassoFooterNewsletter tutorSlug={tutor?.tutor_slug} />
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
        <div className="bottom">
          <span>
            © {new Date().getFullYear()} Kotobaseed · Made with care for language lovers
          </span>
          <span style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            {showKotobaseedLink && (
              <a
                href={apexUrl('/discover')}
                className="kotobaseed-cross-link"
              >
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

const VassoLayout = ({
  tutor,
  currentUser,
  onLogout,
  variant = 'landing',
  setTitle = null,
  chrome,
  children,
}) => {
  const firstName =
    (tutor?.display_name || '').trim().split(/\s+/)[0] || 'Vasso';
  // Per-tutor opt-out. Default is true server-side so existing rows that
  // pre-date the column still surface the link until the tutor turns it off.
  const showKotobaseedLink = tutor?.show_kotobaseed_link !== false;
  const isOwner = Boolean(
    currentUser && tutor && currentUser.id === tutor.user_id,
  );

  // Set tab title for sub-pages. The landing sets its own via VassoGreekSite.
  useEffect(() => {
    if (!setTitle) return;
    const prev = document.title;
    document.title = setTitle;
    return () => { document.title = prev; };
  }, [setTitle]);

  // chrome is an optional theme-driven configuration: wordmark, nav,
  // footer. When the active theme provides one, every layout component
  // (header logo, header nav, footer logo, footer columns, footer
  // tagline) pulls from it. When absent, sensible per-tutor defaults
  // kick in — so a brand-new custom theme still lands with a coherent
  // chrome before the designer fills out every slot.
  const wordmark = chrome?.wordmark;
  const nav = chrome?.nav;
  const footer = chrome?.footer;

  return (
    <div className="theme-vasso-greek-site">
      <SiteHeader
        variant={variant}
        firstName={firstName}
        isOwner={isOwner}
        currentUser={currentUser}
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

export default VassoLayout;
export { BrandLogo, Mark };
