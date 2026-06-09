import React from 'react';
import { Link } from 'react-router-dom';

// Shared layout for every static legal page (Terms, Privacy, Refunds,
// Tutor Agreement, Acceptable Use, Cookie Policy, Report Content).
// Keeps the wrapper, h1, "last updated" line, prose styling, and footer
// nav consistent so updating one doesn't drift from the others.

const RELATED_PAGES = [
  { to: '/terms', label: 'Terms of service' },
  { to: '/privacy', label: 'Privacy policy' },
  { to: '/legal/tutor-agreement', label: 'Tutor agreement' },
  { to: '/legal/acceptable-use', label: 'Acceptable use' },
  { to: '/legal/cookies', label: 'Cookie policy' },
  { to: '/refunds', label: 'Refunds + cancellation' },
  { to: '/legal/report-content', label: 'Report illegal content' },
];

const LegalPageLayout = ({ title, lastUpdated, version, children, currentSlug }) => {
  return (
    <div className="bg-white min-h-screen">
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <header className="mb-8">
          <p className="text-xs uppercase tracking-[0.18em] font-semibold text-kotoba-secondary-dark">
            Legal
          </p>
          <h1 className="mt-2 font-display text-4xl font-bold text-kotoba-primary leading-tight tracking-[-0.02em]">
            {title}
          </h1>
          {(lastUpdated || version) && (
            <p className="mt-2 text-sm text-kotoba-text/60">
              {lastUpdated && <>Last updated: {lastUpdated}</>}
              {lastUpdated && version && <> · </>}
              {version && <>Version {version}</>}
            </p>
          )}
        </header>

        <article className="legal-prose space-y-4 text-kotoba-text leading-relaxed">
          {children}
        </article>

        <nav className="mt-12 pt-6 border-t border-kotoba-text/10">
          <p className="text-xs uppercase tracking-[0.14em] font-semibold text-kotoba-text/55 mb-3">
            Related documents
          </p>
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {RELATED_PAGES.filter((p) => p.to !== currentSlug).map((p) => (
              <li key={p.to}>
                <Link to={p.to} className="text-kotoba-primary hover:underline">
                  {p.label}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-xs text-kotoba-text/55">
            Data protection (DPO): <a href="mailto:dpo@kotobaseed.net" className="text-kotoba-primary hover:underline">dpo@kotobaseed.net</a> · General contact: <a href="mailto:hello@kotobaseed.net" className="text-kotoba-primary hover:underline">hello@kotobaseed.net</a>
          </p>
        </nav>
      </main>
    </div>
  );
};

// Shared section helpers so individual policy files stay scannable.
export const H2 = ({ children, id }) => (
  <h2 id={id} className="font-display text-xl font-semibold text-kotoba-primary mt-8 mb-2 scroll-mt-24">
    {children}
  </h2>
);
export const H3 = ({ children, id }) => (
  <h3 id={id} className="font-display text-base font-semibold text-kotoba-primary mt-6 mb-1 scroll-mt-24">
    {children}
  </h3>
);
export const P = ({ children }) => <p className="leading-relaxed">{children}</p>;
export const UL = ({ children }) => (
  <ul className="list-disc pl-6 space-y-2">{children}</ul>
);

export default LegalPageLayout;
