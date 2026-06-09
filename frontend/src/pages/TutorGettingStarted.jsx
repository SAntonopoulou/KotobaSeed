import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MODULES } from '../onboarding/modules';

// Static reference guide for tutors. Mirrors the onboarding wizard's
// catalogue so the content has a single source of truth, but renders it
// as a scrollable long-form article with anchor links from a sticky TOC.
//
// Public route: anyone considering signing up can read this without an
// account. Signed-in tutors who'd rather "browse and search" than
// "click next-next-next" use this instead of the interactive wizard.

const slugify = (key) => key.replace(/_/g, '-');

const TutorGettingStarted = () => {
  const { hash } = useLocation();
  const [activeKey, setActiveKey] = useState(MODULES[0].key);
  const mobileTocRef = useRef(null);

  // Collapse the mobile TOC after the user jumps to a chapter — otherwise
  // it stays open and pushes the chapter heading off-screen.
  const handleMobileNavClick = () => {
    if (mobileTocRef.current) mobileTocRef.current.open = false;
  };

  // Smooth-scroll to the anchor on initial load if the URL has one.
  useEffect(() => {
    if (!hash) return;
    const el = document.querySelector(hash);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash]);

  // Track which section is in view so the TOC highlights it.
  useEffect(() => {
    const observers = MODULES.map((m) => {
      const el = document.getElementById(slugify(m.key));
      if (!el) return null;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActiveKey(m.key);
        },
        { rootMargin: '-30% 0px -55% 0px', threshold: 0 },
      );
      obs.observe(el);
      return obs;
    });
    return () => observers.forEach((o) => o?.disconnect());
  }, []);

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <header className="max-w-3xl">
        <p className="text-xs uppercase tracking-wider font-semibold text-kotoba-text/60">
          For tutors
        </p>
        <h1 className="mt-1 text-4xl font-bold text-kotoba-primary">
          Getting started on Kotobaseed
        </h1>
        <p className="mt-3 text-base text-kotoba-text leading-relaxed">
          Everything you need to set up your shopfront, take payments, and run
          your teaching business. Each section is a self-contained chapter —
          read top to bottom on your first day, or jump to whatever you need
          later. The interactive walkthrough on your dashboard covers the same
          ground if you'd rather click through it.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            to="/register"
            className="px-5 py-2 rounded-md bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90"
          >
            Create your tutor account
          </Link>
          <Link
            to="/pricing"
            className="px-5 py-2 rounded-md border-2 border-kotoba-primary text-kotoba-primary font-semibold hover:bg-kotoba-primary hover:text-white"
          >
            See pricing
          </Link>
        </div>
      </header>

      {/* Mobile + tablet: collapsible sticky TOC. Hidden at lg where the
          sidebar version takes over. */}
      <details
        ref={mobileTocRef}
        className="group lg:hidden mt-8 sticky top-2 z-20 rounded-lg border border-kotoba-text/15 bg-kotoba-background/95 backdrop-blur shadow-sm"
      >
        <summary className="flex items-center justify-between cursor-pointer list-none px-4 py-3 font-semibold text-kotoba-primary select-none">
          <span className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider font-semibold text-kotoba-text/60">
              On this page
            </span>
          </span>
          <svg
            className="w-4 h-4 transition-transform group-open:rotate-180"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </summary>
        <nav
          aria-label="Table of contents"
          className="px-2 pb-3 max-h-[60vh] overflow-y-auto"
        >
          <ol className="space-y-0.5">
            {MODULES.map((m, idx) => {
              const isActive = m.key === activeKey;
              return (
                <li key={m.key}>
                  <a
                    href={`#${slugify(m.key)}`}
                    onClick={handleMobileNavClick}
                    className={`block text-sm leading-snug py-1.5 px-3 rounded ${
                      isActive
                        ? 'bg-kotoba-primary/10 text-kotoba-primary font-medium'
                        : 'text-kotoba-text/80 hover:bg-kotoba-text/5'
                    }`}
                  >
                    {idx + 1}. {m.title}
                  </a>
                </li>
              );
            })}
          </ol>
        </nav>
      </details>

      <div className="mt-10 grid lg:grid-cols-[16rem_1fr] gap-10">
        {/* Sticky table of contents (desktop only — small screens use the
            collapsible <details> above) */}
        <aside className="hidden lg:block">
          <nav
            aria-label="Table of contents"
            className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto"
          >
            <p className="text-xs uppercase tracking-wider font-semibold text-kotoba-text/60 mb-2">
              On this page
            </p>
            <ol className="space-y-1">
              {MODULES.map((m, idx) => {
                const isActive = m.key === activeKey;
                return (
                  <li key={m.key}>
                    <a
                      href={`#${slugify(m.key)}`}
                      className={`block text-sm leading-snug py-1.5 pl-3 border-l-2 ${
                        isActive
                          ? 'border-kotoba-primary text-kotoba-primary font-medium'
                          : 'border-transparent text-kotoba-text/70 hover:text-kotoba-text hover:border-kotoba-text/20'
                      }`}
                    >
                      {idx + 1}. {m.title}
                    </a>
                  </li>
                );
              })}
            </ol>
          </nav>
        </aside>

        {/* Long-form content */}
        <article className="space-y-10 prose-spacing">
          {MODULES.map((m, idx) => (
            <section
              key={m.key}
              id={slugify(m.key)}
              className="scroll-mt-20 border-t border-kotoba-text/10 pt-8 first:border-t-0 first:pt-0"
            >
              <p className="text-xs uppercase tracking-wider font-semibold text-kotoba-text/60">
                Chapter {idx + 1}
              </p>
              <h2 className="mt-1 text-2xl font-bold text-kotoba-primary">{m.title}</h2>
              {m.summary && (
                <p className="mt-1 text-sm italic text-kotoba-text/70">{m.summary}</p>
              )}
              <div className="mt-4 space-y-4">
                {m.sections.map((s, sIdx) => (
                  <div key={sIdx}>
                    <h3 className="text-base font-semibold text-kotoba-text">{s.heading}</h3>
                    <p className="mt-1 text-sm text-kotoba-text leading-relaxed whitespace-pre-line">
                      {s.body}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ))}

          <section className="border-t border-kotoba-text/10 pt-8">
            <h2 className="text-xl font-bold text-kotoba-primary">Ready to start?</h2>
            <p className="mt-2 text-sm text-kotoba-text leading-relaxed">
              Sign up takes about two minutes. Stripe verification kicks off
              right after so you can start accepting bookings the same day.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                to="/register"
                className="px-5 py-2 rounded-md bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90"
              >
                Create your tutor account
              </Link>
              <Link
                to="/support"
                className="px-5 py-2 rounded-md border border-kotoba-text/20 text-kotoba-text font-semibold hover:bg-kotoba-background/60"
              >
                Contact support
              </Link>
            </div>
          </section>
        </article>
      </div>
    </main>
  );
};

export default TutorGettingStarted;
