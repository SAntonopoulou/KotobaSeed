import React, { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import logo from '../assets/Logo - Rectangle.png';
import Notifications from './Notifications';
import InboxDropdown from './InboxDropdown';
import { useInbox } from '../context/InboxContext';
import { useAuth } from '../context/AuthContext';
import { FaEnvelope, FaBars, FaTimes, FaCaretDown } from 'react-icons/fa';
import { tutorSiteUrl } from '../hooks/useTenant';
import Avatar from './Avatar';

// Apex navbar. Identity is Kotobaseed-first — tutor SaaS is the headline,
// the legacy CompInput-era pledges / projects / requests UI hides under a
// "More" dropdown so we keep them accessible without crowding the bar.
//
// Visible items target ~5 on desktop:
//   Signed out: Find a tutor · Pricing · For tutors · [Login] [Sign up]
//   Signed in:  Find a tutor · Dashboard · More ▾ · Help     · [user menu]

const primaryLinkCls =
  'inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-kotoba-text/70 hover:text-kotoba-text hover:border-kotoba-text/20 text-sm font-medium';

const Navbar = () => {
  const navigate = useNavigate();
  // Auth state comes from AuthContext (shared cookie aware) — never read
  // localStorage directly here. localStorage is per-origin and would make
  // the navbar render "logged out" on a tutor subdomain even though the
  // .kotobaseed.net SSO cookie is valid.
  const { currentUser: user, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showInbox, setShowInbox] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const userMenuRef = useRef(null);
  const inboxMenuRef = useRef(null);
  const moreMenuRef = useRef(null);
  const { unreadCount } = useInbox();

  // ESC closes whichever menu is open.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      setShowUserMenu(false);
      setShowInbox(false);
      setShowMore(false);
      setMobileOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
      if (inboxMenuRef.current && !inboxMenuRef.current.contains(event.target)) {
        setShowInbox(false);
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target)) {
        setShowMore(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    // Use AuthContext.logout — clears the shared cookie server-side so
    // every other tab (apex + every tutor subdomain) drops the session
    // the next time its window regains focus.
    await logout();
    navigate('/');
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    // Default search is tutor discovery — falls through to the marketplace
    // /projects search if a tutor wants the legacy behaviour.
    navigate(`/library?search=${encodeURIComponent(searchQuery)}`);
  };

  const dashboardPath = (() => {
    if (!user) return null;
    if (user.role === 'admin') return '/admin/dashboard';
    if (['support', 'manager', 'moderator'].includes(user.role)) return '/staff/support';
    if (user.role === 'creator') return '/teacher/dashboard';
    return '/student/dashboard';
  })();

  // Items under "More" — every legacy or secondary surface lives here so
  // the top bar stays scannable. Ordering: browse-y first, account-y last.
  const moreItems = user
    ? [
        { to: '/projects', label: 'Projects', show: true },
        { to: '/requests', label: 'Requests', show: true },
        { to: '/archive', label: 'Archive', show: true },
        {
          to: '/student/tutors',
          label: 'My tutors',
          show: user.role === 'student',
        },
        {
          to: '/student/assignments',
          label: 'Homework',
          show: user.role === 'student',
        },
        {
          to: '/student/subscriptions',
          label: 'My subscriptions',
          show: user.role === 'student',
        },
        { to: '/referrals', label: 'Referrals', show: true },
      ].filter((i) => i.show)
    : [];

  return (
    <nav className="bg-white shadow-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center gap-4">
          {/* Left cluster: logo + primary nav */}
          <div className="flex items-center min-w-0">
            <Link to="/" className="flex-shrink-0">
              <img className="h-8 w-auto" src={logo} alt="Kotobaseed" />
            </Link>
            <div className="hidden lg:flex lg:ml-8 lg:items-center lg:space-x-7">
              <Link to="/library" className={primaryLinkCls}>
                Find a tutor
              </Link>
              <Link to="/discover" className={primaryLinkCls}>
                Discover
              </Link>
              {user && (
                <Link to="/groups" className={primaryLinkCls}>
                  Groups
                </Link>
              )}
              {user ? (
                <>
                  {dashboardPath && (
                    <Link to={dashboardPath} className={primaryLinkCls}>
                      Dashboard
                    </Link>
                  )}
                  {moreItems.length > 0 && (
                    <div className="relative" ref={moreMenuRef}>
                      <button
                        type="button"
                        onClick={() => setShowMore((v) => !v)}
                        className={`${primaryLinkCls} gap-1`}
                        aria-haspopup="menu"
                        aria-expanded={showMore}
                      >
                        More <FaCaretDown size={12} />
                      </button>
                      {showMore && (
                        <div
                          role="menu"
                          className="origin-top-right absolute left-0 mt-2 w-56 rounded-md shadow-lg py-1 bg-white ring-1 ring-black ring-opacity-5"
                        >
                          {moreItems.map((item) => (
                            <Link
                              key={item.to}
                              to={item.to}
                              onClick={() => setShowMore(false)}
                              className="block px-4 py-2 text-sm text-kotoba-text/80 hover:bg-kotoba-background/60"
                            >
                              {item.label}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <Link to="/help" className={primaryLinkCls}>
                    Help
                  </Link>
                </>
              ) : (
                <>
                  <Link to="/pricing" className={primaryLinkCls}>
                    Pricing
                  </Link>
                  <Link to="/help/tutor-getting-started" className={primaryLinkCls}>
                    For tutors
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* Center: search — only visible on lg+ to keep the bar uncluttered */}
          <form
            onSubmit={handleSearch}
            className="hidden lg:block flex-1 max-w-sm"
          >
            <label htmlFor="navbar-search" className="sr-only">
              Search
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg
                  className="h-4 w-4 text-kotoba-text/40"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <input
                id="navbar-search"
                name="search"
                className="block w-full pl-9 pr-3 py-1.5 border border-kotoba-text/20 rounded-md text-sm bg-white placeholder-kotoba-text/50 focus:outline-none focus:ring-1 focus:ring-kotoba-primary focus:border-kotoba-primary"
                placeholder="Find a tutor or topic"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </form>

          {/* Right cluster: messages + notifications + user menu */}
          <div className="hidden lg:flex lg:items-center lg:gap-4">
            {user ? (
              <>
                <div className="relative" ref={inboxMenuRef}>
                  <button
                    onClick={() => setShowInbox(!showInbox)}
                    className="text-kotoba-text/60 hover:text-kotoba-text/80 relative"
                    aria-label="Messages"
                  >
                    <FaEnvelope size={18} />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
                        {unreadCount}
                      </span>
                    )}
                  </button>
                  {showInbox && <InboxDropdown closeDropdown={() => setShowInbox(false)} />}
                </div>
                <Notifications />

                <div className="relative" ref={userMenuRef}>
                  <button
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="flex items-center text-sm font-medium text-kotoba-text/80 hover:text-kotoba-text focus:outline-none"
                    aria-label="Account menu"
                  >
                    <Avatar src={user.avatar_url} name={user.full_name} size={32} />
                  </button>

                  {showUserMenu && (
                    <div className="origin-top-right absolute right-0 mt-2 w-60 rounded-md shadow-lg py-1 bg-white ring-1 ring-black ring-opacity-5 focus:outline-none">
                      <div className="px-4 pt-2 pb-1 text-xs uppercase tracking-wide text-kotoba-text/40">
                        Account
                      </div>
                      <Link
                        to={`/profile/${user.id}`}
                        onClick={() => setShowUserMenu(false)}
                        className="block px-4 py-2 text-sm text-kotoba-text/80 hover:bg-kotoba-background/60"
                      >
                        Your profile
                      </Link>
                      <Link
                        to="/settings"
                        onClick={() => setShowUserMenu(false)}
                        className="block px-4 py-2 text-sm text-kotoba-text/80 hover:bg-kotoba-background/60"
                      >
                        Settings
                      </Link>
                      <Link
                        to="/support"
                        onClick={() => setShowUserMenu(false)}
                        className="block px-4 py-2 text-sm text-kotoba-text/80 hover:bg-kotoba-background/60"
                      >
                        Contact support
                      </Link>
                      {user.role === 'admin' && (
                        <>
                          <div className="border-t border-kotoba-text/5 my-1" />
                          <Link
                            to="/admin/dashboard"
                            onClick={() => setShowUserMenu(false)}
                            className="block px-4 py-2 text-sm text-kotoba-text/80 hover:bg-kotoba-background/60"
                          >
                            Admin dashboard
                          </Link>
                        </>
                      )}
                      {['support', 'manager', 'moderator'].includes(user.role) && (
                        <>
                          <div className="border-t border-kotoba-text/5 my-1" />
                          <Link
                            to="/staff/support"
                            onClick={() => setShowUserMenu(false)}
                            className="block px-4 py-2 text-sm text-kotoba-text/80 hover:bg-kotoba-background/60"
                          >
                            Support queue
                          </Link>
                        </>
                      )}
                      {user.tutor_slug && (
                        <>
                          <div className="border-t border-kotoba-text/5 my-1" />
                          <div className="px-4 pt-2 pb-1 text-xs uppercase tracking-wide text-kotoba-text/40">
                            Your tutor site
                          </div>
                          <a
                            href={tutorSiteUrl(user.tutor_slug, '/')}
                            className="block px-4 py-2 text-sm text-kotoba-text/80 hover:bg-kotoba-background/60"
                            onClick={() => setShowUserMenu(false)}
                          >
                            Visit your site
                          </a>
                          <a
                            href={tutorSiteUrl(user.tutor_slug, '/dashboard')}
                            className="block px-4 py-2 text-sm text-kotoba-text/80 hover:bg-kotoba-background/60"
                            onClick={() => setShowUserMenu(false)}
                          >
                            Manage your site
                          </a>
                        </>
                      )}
                      <div className="border-t border-kotoba-text/5 my-1" />
                      <button
                        onClick={handleLogout}
                        className="block w-full text-left px-4 py-2 text-sm text-kotoba-text/80 hover:bg-kotoba-background/60"
                      >
                        Log out
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center gap-3">
                <Link
                  to="/login"
                  className="text-kotoba-text/70 hover:text-kotoba-text px-3 py-2 text-sm font-medium"
                >
                  Log in
                </Link>
                <Link
                  to="/register"
                  className="bg-kotoba-primary text-white hover:bg-kotoba-primary/90 px-4 py-2 rounded-md text-sm font-medium"
                >
                  Get started
                </Link>
              </div>
            )}
          </div>

          {/* Mobile menu trigger */}
          <div className="flex items-center lg:hidden">
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              className="p-2 text-kotoba-text/70 hover:text-kotoba-primary"
            >
              {mobileOpen ? <FaTimes size={20} /> : <FaBars size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="lg:hidden border-t border-kotoba-text/10 py-3 space-y-1">
            <Link
              to="/library"
              onClick={() => setMobileOpen(false)}
              className="block px-2 py-2 rounded text-base text-kotoba-text/80 hover:bg-kotoba-background/40"
            >
              Find a tutor
            </Link>
            <Link
              to="/discover"
              onClick={() => setMobileOpen(false)}
              className="block px-2 py-2 rounded text-base text-kotoba-text/80 hover:bg-kotoba-background/40"
            >
              Discover
            </Link>
            {user && (
              <Link
                to="/groups"
                onClick={() => setMobileOpen(false)}
                className="block px-2 py-2 rounded text-base text-kotoba-text/80 hover:bg-kotoba-background/40"
              >
                Groups
              </Link>
            )}
            {user ? (
              <>
                {dashboardPath && (
                  <Link
                    to={dashboardPath}
                    onClick={() => setMobileOpen(false)}
                    className="block px-2 py-2 rounded text-base text-kotoba-text/80 hover:bg-kotoba-background/40"
                  >
                    Dashboard
                  </Link>
                )}
                <Link
                  to="/messages"
                  onClick={() => setMobileOpen(false)}
                  className="block px-2 py-2 rounded text-base text-kotoba-text/80 hover:bg-kotoba-background/40"
                >
                  Messages{unreadCount > 0 ? ` (${unreadCount})` : ''}
                </Link>
                <Link
                  to="/help"
                  onClick={() => setMobileOpen(false)}
                  className="block px-2 py-2 rounded text-base text-kotoba-text/80 hover:bg-kotoba-background/40"
                >
                  Help
                </Link>

                {moreItems.length > 0 && (
                  <>
                    <div className="px-2 pt-3 pb-1 text-xs uppercase tracking-wide text-kotoba-text/40">
                      More
                    </div>
                    {moreItems.map((item) => (
                      <Link
                        key={item.to}
                        to={item.to}
                        onClick={() => setMobileOpen(false)}
                        className="block px-2 py-2 rounded text-base text-kotoba-text/80 hover:bg-kotoba-background/40"
                      >
                        {item.label}
                      </Link>
                    ))}
                  </>
                )}

                <div className="border-t border-kotoba-text/5 my-2" />
                <div className="px-2 pt-1 pb-1 text-xs uppercase tracking-wide text-kotoba-text/40">
                  Account
                </div>
                <Link
                  to={`/profile/${user.id}`}
                  onClick={() => setMobileOpen(false)}
                  className="block px-2 py-2 rounded text-base text-kotoba-text/80 hover:bg-kotoba-background/40"
                >
                  Your profile
                </Link>
                <Link
                  to="/settings"
                  onClick={() => setMobileOpen(false)}
                  className="block px-2 py-2 rounded text-base text-kotoba-text/80 hover:bg-kotoba-background/40"
                >
                  Settings
                </Link>
                {user.role === 'admin' && (
                  <Link
                    to="/admin/dashboard"
                    onClick={() => setMobileOpen(false)}
                    className="block px-2 py-2 rounded text-base text-kotoba-text/80 hover:bg-kotoba-background/40"
                  >
                    Admin dashboard
                  </Link>
                )}
                {['support', 'manager', 'moderator'].includes(user.role) && (
                  <Link
                    to="/staff/support"
                    onClick={() => setMobileOpen(false)}
                    className="block px-2 py-2 rounded text-base text-kotoba-text/80 hover:bg-kotoba-background/40"
                  >
                    Support queue
                  </Link>
                )}
                {user.tutor_slug && (
                  <>
                    <a
                      href={tutorSiteUrl(user.tutor_slug, '/')}
                      className="block px-2 py-2 rounded text-base text-kotoba-text/80 hover:bg-kotoba-background/40"
                    >
                      Visit your tutor site
                    </a>
                    <a
                      href={tutorSiteUrl(user.tutor_slug, '/dashboard')}
                      className="block px-2 py-2 rounded text-base text-kotoba-text/80 hover:bg-kotoba-background/40"
                    >
                      Manage your tutor site
                    </a>
                  </>
                )}
                <button
                  onClick={() => {
                    setMobileOpen(false);
                    handleLogout();
                  }}
                  className="block w-full text-left px-2 py-2 rounded text-base text-kotoba-text/80 hover:bg-kotoba-background/40"
                >
                  Log out
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/pricing"
                  onClick={() => setMobileOpen(false)}
                  className="block px-2 py-2 rounded text-base text-kotoba-text/80 hover:bg-kotoba-background/40"
                >
                  Pricing
                </Link>
                <Link
                  to="/help/tutor-getting-started"
                  onClick={() => setMobileOpen(false)}
                  className="block px-2 py-2 rounded text-base text-kotoba-text/80 hover:bg-kotoba-background/40"
                >
                  For tutors
                </Link>
                <Link
                  to="/login"
                  onClick={() => setMobileOpen(false)}
                  className="block px-2 py-2 rounded text-base text-kotoba-text/80 hover:bg-kotoba-background/40"
                >
                  Log in
                </Link>
                <Link
                  to="/register"
                  onClick={() => setMobileOpen(false)}
                  className="block px-2 py-2 rounded text-base font-semibold text-kotoba-primary hover:bg-kotoba-primary/5"
                >
                  Get started
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
