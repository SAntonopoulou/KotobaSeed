import React, { useState } from 'react';
import { apexUrl } from '../../hooks/useTenant';
import { useInbox } from '../../context/InboxContext';

// Curated section list. Order matters — most-used at top, settings at bottom.
const SECTIONS = [
  { key: 'overview', label: 'Overview' },
  { key: 'bookings', label: 'Bookings' },
  { key: 'lessons', label: 'Lessons' },
  { key: 'content', label: 'Content' },
  { key: 'students', label: 'Students' },
  { key: 'site', label: 'Site' },
  { key: 'money', label: 'Money' },
  { key: 'settings', label: 'Settings' },
];

const NavButton = ({ section, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-full text-left px-4 py-2 rounded-md text-sm font-medium transition-colors ${
      active
        ? 'bg-kotoba-primary text-white'
        : 'text-kotoba-text/80 hover:bg-kotoba-primary/10 hover:text-kotoba-primary'
    }`}
  >
    {section.label}
  </button>
);

const DashboardSidebar = ({ tutor, currentSection, onSelect, onLogout }) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { unreadCount } = useInbox();

  const select = (key) => {
    onSelect(key);
    setMobileOpen(false);
  };

  return (
    <>
      {/* Mobile bar: brand + hamburger. Hidden on lg+. */}
      <div className="lg:hidden bg-white border-b border-kotoba-text/10 px-4 py-3 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold text-kotoba-primary">
            {tutor?.display_name || 'Dashboard'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 text-kotoba-text/70 hover:text-kotoba-primary"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        >
          {mobileOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* Sidebar — fixed on desktop, drawer on mobile. */}
      <aside
        className={`bg-white border-r border-kotoba-text/10 w-64 flex-shrink-0 flex-col ${
          mobileOpen ? 'flex fixed inset-0 z-40 w-full lg:w-64' : 'hidden lg:flex'
        } lg:sticky lg:top-0 lg:h-screen`}
      >
        <div className="px-5 py-4 border-b border-kotoba-text/10 flex items-center justify-between gap-3">
          <a
            href={apexUrl('/')}
            className="text-xs uppercase tracking-wider text-kotoba-text/50 hover:text-kotoba-primary"
            title="Browse Kotobaseed"
          >
            Kotobaseed
          </a>
          {mobileOpen && (
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="lg:hidden text-kotoba-text/60 hover:text-kotoba-primary"
              aria-label="Close menu"
            >
              ✕
            </button>
          )}
        </div>

        {tutor && (
          <div className="px-5 py-4 border-b border-kotoba-text/10">
            <p className="text-base font-semibold text-kotoba-primary truncate">
              {tutor.display_name}
            </p>
            <p className="text-xs text-kotoba-text/60 mt-0.5">
              {tutor.tutor_slug}.kotobaseed.net
            </p>
          </div>
        )}

        <nav className="flex-grow overflow-y-auto px-3 py-4 space-y-0.5">
          {SECTIONS.map((section) => (
            <NavButton
              key={section.key}
              section={section}
              active={currentSection === section.key}
              onClick={() => select(section.key)}
            />
          ))}
        </nav>

        <div className="border-t border-kotoba-text/10 px-3 py-3 space-y-0.5">
          <a
            href={apexUrl('/messages')}
            className="flex items-center justify-between px-4 py-2 text-sm font-medium text-kotoba-text/80 hover:text-kotoba-primary rounded-md hover:bg-kotoba-primary/5"
          >
            <span>Messages</span>
            {unreadCount > 0 && (
              <span className="ml-2 inline-flex items-center justify-center px-2 py-0.5 text-xs font-semibold rounded-full bg-kotoba-primary text-white">
                {unreadCount}
              </span>
            )}
          </a>
          <a
            href={apexUrl('/support')}
            className="block px-4 py-2 text-sm font-medium text-kotoba-text/80 hover:text-kotoba-primary rounded-md hover:bg-kotoba-primary/5"
          >
            Support
          </a>
          <a
            href="/"
            className="block px-4 py-2 text-sm text-kotoba-text/80 hover:text-kotoba-primary rounded-md hover:bg-kotoba-primary/5"
          >
            View your site →
          </a>
          <button
            type="button"
            onClick={onLogout}
            className="block w-full text-left px-4 py-2 text-sm text-kotoba-text/60 hover:text-kotoba-text rounded-md hover:bg-kotoba-text/5"
          >
            Log out
          </button>
        </div>
      </aside>
    </>
  );
};

export const SECTION_KEYS = SECTIONS.map((s) => s.key);
export default DashboardSidebar;
