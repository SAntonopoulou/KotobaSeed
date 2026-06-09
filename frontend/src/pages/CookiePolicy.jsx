import React from 'react';
import LegalPageLayout, { H2, H3, P, UL } from '../components/LegalPageLayout';

// Full content lives in /legal-research/policies/cookie-policy.md.
// Keep the two in sync — counsel + production read the same words.

const CookiePolicy = () => (
  <LegalPageLayout
    title="Cookie policy"
    lastUpdated="2026-06-08"
    version="2.0"
    currentSlug="/legal/cookies"
  >
    <P>
      This Cookie Policy explains what cookies and similar storage technologies Kotobaseed uses, why we use them, and what your choices are. It supplements our <a href="/privacy" className="text-kotoba-primary underline">Privacy Policy</a>.
    </P>
    <P>
      We've deliberately kept the cookie surface tiny. We don't use advertising cookies, analytics trackers, fingerprinting tools, or session-replay tools. The platform works with the bare minimum that is strictly necessary for a working website plus a one-shot record that you've seen this notice.
    </P>

    <H2>1. The cookies we use</H2>
    <P>
      We use exactly <strong>two first-party cookies</strong>. No third-party cookies. No advertising cookies. No analytics cookies that report to external companies.
    </P>
    <div className="overflow-x-auto">
      <table className="w-full text-sm border border-kotoba-text/15 my-4">
        <thead className="bg-kotoba-background/50">
          <tr>
            <th className="text-left px-3 py-2 border-b border-kotoba-text/15">Cookie</th>
            <th className="text-left px-3 py-2 border-b border-kotoba-text/15">Purpose</th>
            <th className="text-left px-3 py-2 border-b border-kotoba-text/15">Lifetime</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="px-3 py-2 align-top font-mono text-xs">kotoba_session</td>
            <td className="px-3 py-2 align-top">Keeps you logged in. Issued only when you successfully sign in.</td>
            <td className="px-3 py-2 align-top">30 days (rolling)</td>
          </tr>
          <tr>
            <td className="px-3 py-2 align-top font-mono text-xs">kotoba_consent_v1</td>
            <td className="px-3 py-2 align-top">Records that you've seen the cookie notice, so we don't show it again.</td>
            <td className="px-3 py-2 align-top">12 months</td>
          </tr>
        </tbody>
      </table>
    </div>
    <P>
      Under EU ePrivacy law and Article 5(3) of EU Directive 2002/58/EC, cookies that are <strong>strictly necessary for the provision of the service requested by the user</strong> do not require prior consent. Both of ours fall into that category.
    </P>

    <H2>2. Cookies we DON'T use</H2>
    <UL>
      <li><strong>No advertising cookies.</strong> We don't run advertising and we don't share data with ad networks.</li>
      <li><strong>No third-party analytics.</strong> No Google Analytics, no Facebook Pixel, no LinkedIn Insight tag.</li>
      <li><strong>No session-replay or behaviour-tracking tools</strong> (no Hotjar, FullStory, etc.).</li>
      <li><strong>No fingerprinting</strong> tools (no FingerprintJS, no canvas fingerprinting).</li>
      <li><strong>No social-media tracking pixels.</strong></li>
    </UL>
    <P>
      If you load a tutor's article that links to YouTube or another external host, that external host may set its own cookies when you click through — that's outside our control and subject to the third party's cookie policy.
    </P>

    <H2>3. Local storage</H2>
    <P>
      We use browser <code>localStorage</code> for a small number of UI preferences:
    </P>
    <UL>
      <li><code>koto:tutor-tour-completed</code> — flag so we don't auto-start the dashboard tour again after you've completed it</li>
      <li><code>koto:demo-tour-completed</code> — same, for the demo onboarding tour</li>
      <li><code>koto-tenant-theme-cache</code> — caches the active theme key so the page paints quickly on second load</li>
    </UL>
    <P>
      None of this contains personal data. None of it is sent to our servers — it stays in your browser. You can clear it any time via your browser's developer tools or by clearing site data.
    </P>

    <H2>4. Your choices</H2>
    <UL>
      <li><strong>Reject all but strictly necessary</strong>: that's already the default. We don't set anything else.</li>
      <li><strong>Block our cookies entirely</strong>: configure your browser to reject cookies from <code>*.kotobaseed.net</code>. The Service won't work logged-in if you do this, but read-only browsing still works.</li>
      <li><strong>Clear cookies</strong>: in your browser settings under "Privacy" / "Site data".</li>
      <li><strong>Block third-party redirects</strong>: use a browser extension like uBlock Origin or your browser's "block third-party cookies" setting.</li>
    </UL>

    <H2>5. Changes to this Policy</H2>
    <P>
      If we add a cookie or change a purpose, we will update this Policy and (if the change is material — e.g. introducing analytics or advertising cookies) require explicit consent before setting the new cookie.
    </P>

    <H2>6. Questions</H2>
    <P>
      Email <a href="mailto:dpo@kotobaseed.net" className="text-kotoba-primary underline">dpo@kotobaseed.net</a> or <a href="mailto:hello@kotobaseed.net" className="text-kotoba-primary underline">hello@kotobaseed.net</a>.
    </P>
  </LegalPageLayout>
);

export default CookiePolicy;
