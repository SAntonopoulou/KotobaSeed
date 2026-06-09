import React from 'react';
import LegalPageLayout, { H2, H3, P, UL } from '../components/LegalPageLayout';

// Full content lives in /legal-research/policies/privacy-policy.md.

const Privacy = () => (
  <LegalPageLayout
    title="Privacy policy"
    lastUpdated="2026-06-08"
    version="2.0"
    currentSlug="/privacy"
  >
    <P>
      This Policy explains how Kotobaseed handles your personal data. It is written to satisfy our obligations under the EU <strong>General Data Protection Regulation 2016/679 (GDPR)</strong>, the Belgian Law of 30 July 2018, and the Greek Law 4624/2019.
    </P>
    <P>
      Questions or to exercise your rights: <a href="mailto:dpo@kotobaseed.net" className="text-kotoba-primary underline">dpo@kotobaseed.net</a>.
    </P>

    <H2>1. Who is the data controller</H2>
    <P>
      <strong>Kotobaseed</strong>, operated by Sophia Willowood. Controller details will be updated on company incorporation in 2026. Contact: <a href="mailto:hello@kotobaseed.net" className="text-kotoba-primary underline">hello@kotobaseed.net</a>; DPO: <a href="mailto:dpo@kotobaseed.net" className="text-kotoba-primary underline">dpo@kotobaseed.net</a>.
    </P>
    <P>
      For most data about you, Kotobaseed is the data controller. There are two specific cases of joint controllership with a tutor — see Section 7.
    </P>

    <H2>2. The data we collect</H2>
    <H3>Account data</H3>
    <UL>
      <li>Name, email, password hash, language(s) you teach or learn</li>
      <li>Profile photo (optional), short bio (optional)</li>
      <li>Your account timezone</li>
      <li>For tutors: bank routing / payout details (held by Stripe, not by us)</li>
      <li>For tutors: KYC documents Stripe collects during Connect onboarding (Stripe is the controller for those)</li>
      <li>For students: the Stripe customer ID; underlying card data lives with Stripe</li>
    </UL>
    <H3>From lesson + content interactions</H3>
    <UL>
      <li>Bookings: lesson date, duration, pack, status</li>
      <li>Homework: questions, answers, tutor feedback</li>
      <li>Articles + modules: published or purchased, dwell time on paywalled reader pages (used internally, not for advertising)</li>
      <li>Reviews / testimonials</li>
      <li>Inbox messages</li>
    </UL>
    <H3>Technical telemetry</H3>
    <UL>
      <li>Login + critical-action audit log (IP, timestamp, user agent) — for security</li>
      <li>Error reports (Sentry) — stack traces, browser version; we redact obvious personal data</li>
      <li>Server access logs — IP, request URL, response time</li>
    </UL>
    <H3>What we DON'T collect</H3>
    <UL>
      <li>No advertising cookies, fingerprinting, or session-replay tools</li>
      <li>No special-category data (health, religion, sexual orientation, biometrics) — please don't put it in your bio or messages</li>
      <li>No cross-site tracking</li>
      <li>No data sold or shared for behavioural advertising</li>
    </UL>

    <H2>3. Why we use it (legal basis under Article 6 GDPR)</H2>
    <div className="overflow-x-auto">
      <table className="w-full text-sm border border-kotoba-text/15 my-4">
        <thead className="bg-kotoba-background/50">
          <tr>
            <th className="text-left px-3 py-2 border-b border-kotoba-text/15">Purpose</th>
            <th className="text-left px-3 py-2 border-b border-kotoba-text/15">Legal basis</th>
          </tr>
        </thead>
        <tbody>
          <tr><td className="px-3 py-2 align-top">Operate your account</td><td className="px-3 py-2 align-top">Contract — Art 6(1)(b)</td></tr>
          <tr><td className="px-3 py-2 align-top">Process bookings + payments</td><td className="px-3 py-2 align-top">Contract</td></tr>
          <tr><td className="px-3 py-2 align-top">Transactional emails</td><td className="px-3 py-2 align-top">Contract</td></tr>
          <tr><td className="px-3 py-2 align-top">Marketing emails / newsletters from tutors</td><td className="px-3 py-2 align-top">Consent — opt-in, withdrawable</td></tr>
          <tr><td className="px-3 py-2 align-top">Customer support</td><td className="px-3 py-2 align-top">Contract / Legitimate interest</td></tr>
          <tr><td className="px-3 py-2 align-top">Tax + accounting (7-year retention)</td><td className="px-3 py-2 align-top">Legal obligation — Art 6(1)(c)</td></tr>
          <tr><td className="px-3 py-2 align-top">Fraud prevention, KYC/AML</td><td className="px-3 py-2 align-top">Legal obligation + Legitimate interest</td></tr>
          <tr><td className="px-3 py-2 align-top">Aggregate usage analytics (never personal)</td><td className="px-3 py-2 align-top">Legitimate interest — Art 6(1)(f)</td></tr>
          <tr><td className="px-3 py-2 align-top">Defending legal claims</td><td className="px-3 py-2 align-top">Legitimate interest</td></tr>
        </tbody>
      </table>
    </div>

    <H2>4. Sub-processors we use</H2>
    <P>
      Processors operating on our behalf under written Data Processing Agreements per Article 28 GDPR.
    </P>
    <div className="overflow-x-auto">
      <table className="w-full text-sm border border-kotoba-text/15 my-4">
        <thead className="bg-kotoba-background/50">
          <tr>
            <th className="text-left px-3 py-2 border-b border-kotoba-text/15">Sub-processor</th>
            <th className="text-left px-3 py-2 border-b border-kotoba-text/15">Purpose</th>
            <th className="text-left px-3 py-2 border-b border-kotoba-text/15">Country</th>
            <th className="text-left px-3 py-2 border-b border-kotoba-text/15">Transfer basis</th>
          </tr>
        </thead>
        <tbody>
          <tr><td className="px-3 py-2">Hetzner Online GmbH</td><td className="px-3 py-2">Production hosting</td><td className="px-3 py-2">Germany (EU)</td><td className="px-3 py-2">n/a — EEA</td></tr>
          <tr><td className="px-3 py-2">Cloudflare, Inc.</td><td className="px-3 py-2">CDN, DNS, TLS</td><td className="px-3 py-2">US + edges</td><td className="px-3 py-2">DPF + SCCs</td></tr>
          <tr><td className="px-3 py-2">Cloudflare R2</td><td className="px-3 py-2">Backup storage</td><td className="px-3 py-2">EU + global</td><td className="px-3 py-2">DPF + SCCs</td></tr>
          <tr><td className="px-3 py-2">Stripe Payments Europe + Stripe Inc.</td><td className="px-3 py-2">Payments + KYC (separate controller)</td><td className="px-3 py-2">Ireland + US</td><td className="px-3 py-2">DPF + SCCs</td></tr>
          <tr><td className="px-3 py-2">Daily.co (Pluot Communications)</td><td className="px-3 py-2">Video classroom</td><td className="px-3 py-2">US</td><td className="px-3 py-2">DPF + SCCs</td></tr>
          <tr><td className="px-3 py-2">Sentry</td><td className="px-3 py-2">Error tracking</td><td className="px-3 py-2">US</td><td className="px-3 py-2">DPF + SCCs</td></tr>
          <tr><td className="px-3 py-2">AWS SES (or equivalent)</td><td className="px-3 py-2">Transactional email</td><td className="px-3 py-2">EU (eu-west-1)</td><td className="px-3 py-2">n/a — EEA</td></tr>
          <tr><td className="px-3 py-2">Google Workspace</td><td className="px-3 py-2">Internal email + docs (no student data)</td><td className="px-3 py-2">EU + US</td><td className="px-3 py-2">DPF + SCCs</td></tr>
        </tbody>
      </table>
    </div>
    <P>
      We maintain a Records of Processing Activities (ROPA) per Article 30 GDPR, available to our supervisory authority on request.
    </P>

    <H2>5. International transfers</H2>
    <P>
      Where personal data leaves the EU/EEA, we rely on the EU–US Data Privacy Framework or Standard Contractual Clauses (Module 2 / Module 3) supplemented by encryption in transit and at rest. If DPF status changes or is invalidated, we move to SCCs + additional safeguards within 30 days.
    </P>

    <H2>6. How long we keep your data</H2>
    <div className="overflow-x-auto">
      <table className="w-full text-sm border border-kotoba-text/15 my-4">
        <thead className="bg-kotoba-background/50">
          <tr>
            <th className="text-left px-3 py-2 border-b border-kotoba-text/15">Data</th>
            <th className="text-left px-3 py-2 border-b border-kotoba-text/15">Retention</th>
          </tr>
        </thead>
        <tbody>
          <tr><td className="px-3 py-2">Active account data</td><td className="px-3 py-2">While account is open + 30 days for accidental-delete recovery</td></tr>
          <tr><td className="px-3 py-2">Invoices and tax records</td><td className="px-3 py-2">7 years (Belgian + Greek tax law)</td></tr>
          <tr><td className="px-3 py-2">Booking records</td><td className="px-3 py-2">7 years (financial / dispute history)</td></tr>
          <tr><td className="px-3 py-2">Audit logs (security)</td><td className="px-3 py-2">12 months</td></tr>
          <tr><td className="px-3 py-2">Transactional emails sent</td><td className="px-3 py-2">6 months</td></tr>
          <tr><td className="px-3 py-2">Marketing email sends + opens</td><td className="px-3 py-2">24 months</td></tr>
          <tr><td className="px-3 py-2">Server access logs</td><td className="px-3 py-2">90 days</td></tr>
          <tr><td className="px-3 py-2">Backups</td><td className="px-3 py-2">Rolling 30-day window</td></tr>
        </tbody>
      </table>
    </div>

    <H2>7. Joint controllership with tutors</H2>
    <P>
      In two situations, Kotobaseed and a tutor are <strong>joint controllers</strong> under Article 26 GDPR:
    </P>
    <UL>
      <li>A student's bookings + homework with that specific tutor</li>
      <li>Private notes a tutor writes about a student</li>
    </UL>
    <P>
      We handle data subject requests, security, breach notification, deletion mechanics, audit logs. The tutor handles accuracy of content they write, responding to questions about that content, confidentiality. Either party can be approached; we forward requests to the tutor and copy you.
    </P>

    <H2>8. Your rights under GDPR</H2>
    <UL>
      <li><strong>Access</strong> (Art 15) — Settings → "Download my data" for an immediate JSON export, or contact dpo@kotobaseed.net</li>
      <li><strong>Rectification</strong> (Art 16) — edit in Settings, or contact us</li>
      <li><strong>Erasure</strong> (Art 17) — Settings → "Delete my account"; we delete within 30 days</li>
      <li><strong>Restrict processing</strong> (Art 18)</li>
      <li><strong>Data portability</strong> (Art 20) — same JSON export</li>
      <li><strong>Object</strong> (Art 21) — including unsubscribing from marketing emails any time</li>
      <li><strong>Withdraw consent</strong> (Art 7(3))</li>
      <li><strong>Not be subject to solely automated decisions</strong> (Art 22) — we don't make such decisions</li>
    </UL>
    <P>
      Complaints to: <a href="https://www.dpa.gr" target="_blank" rel="noopener noreferrer" className="text-kotoba-primary underline">Hellenic DPA (HDPA)</a> · <a href="https://www.dataprotectionauthority.be" target="_blank" rel="noopener noreferrer" className="text-kotoba-primary underline">Belgian DPA (APD/GBA)</a>.
    </P>

    <H2>9. Security</H2>
    <UL>
      <li><strong>Encryption in transit</strong>: TLS 1.2+ everywhere</li>
      <li><strong>Encryption at rest</strong> on production servers + at sub-processors</li>
      <li><strong>Password storage</strong>: bcrypt; no plaintext, no reversible storage</li>
      <li><strong>Access controls</strong>: principle of least privilege; multi-factor on infra accounts</li>
      <li><strong>Auditing</strong>: critical actions logged; reviewed monthly</li>
      <li><strong>Daily database backups</strong> to R2 (offsite, 30-day rolling)</li>
      <li><strong>Sentry + Cloudflare WAF</strong> for detection</li>
      <li><strong>72-hour breach notification</strong> to affected users + supervisory authority where Art 33 GDPR threshold met</li>
    </UL>

    <H2>10. Cookies + similar technologies</H2>
    <P>
      Two strictly-necessary first-party cookies and no third-party trackers. Full list in the <a href="/legal/cookies" className="text-kotoba-primary underline">Cookie Policy</a>.
    </P>

    <H2>11. Responsible disclosure</H2>
    <P>
      Security vulnerabilities to <a href="mailto:security@kotobaseed.net" className="text-kotoba-primary underline">security@kotobaseed.net</a>. We don't take legal action against good-faith researchers. Acknowledgement within 5 business days; remediation aim 90 days for non-trivial issues.
    </P>

    <H2>12. Children</H2>
    <P>
      Service not directed at children under 16. We do not knowingly collect their data.
    </P>

    <H2>13. Changes to this Policy</H2>
    <P>
      Material changes: at least 14 days' notice via banner + email.
    </P>
  </LegalPageLayout>
);

export default Privacy;
