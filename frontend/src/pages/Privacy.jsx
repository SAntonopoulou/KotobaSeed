import React from 'react';
import { Link } from 'react-router-dom';

// Plain-language privacy notice. Not legal advice — designed to be
// honest, readable, and complete enough for Stripe Connect's platform
// agreement requirements + GDPR Article 13/14 basics. A formal legal
// review before scaling beyond a few hundred users is sensible.

const Privacy = () => (
  <div className="bg-white min-h-screen">
    <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 prose prose-kotoba">
      <h1 className="text-3xl font-bold text-kotoba-primary mb-2">Privacy policy</h1>
      <p className="text-sm text-kotoba-text/60 mb-8">Last updated: 6 June 2026</p>

      <section className="space-y-4 text-kotoba-text leading-relaxed">
        <h2 className="text-xl font-semibold text-kotoba-primary mt-8">Who we are</h2>
        <p>
          Kotobaseed is a platform that lets language tutors run their own teaching site —
          take bookings, hold lessons, sell content. The platform is operated by Kotobaseed
          (the "platform", "we", "us"). When you book a lesson or buy content, the actual
          contract is between you and the individual tutor; we provide the infrastructure.
        </p>

        <h2 className="text-xl font-semibold text-kotoba-primary mt-8">What data we collect</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong>Account data</strong>: email, name, password (hashed with Argon2 — never
            stored in plain text), the language(s) you teach or learn, and the bio + photo
            you choose to share.
          </li>
          <li>
            <strong>Booking + payment data</strong>: which lessons you booked or sold,
            timestamps, amounts. Card details are handled entirely by Stripe — we never
            see or store your card number.
          </li>
          <li>
            <strong>Content you create</strong>: articles, modules, homework, messages,
            testimonials.
          </li>
          <li>
            <strong>Technical data</strong>: IP address (for security and rate limiting),
            browser type, basic usage logs.
          </li>
        </ul>

        <h2 className="text-xl font-semibold text-kotoba-primary mt-8">Why we use it</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>To run the service</strong> — bookings, payments, lessons, messages.</li>
          <li><strong>To send you transactional emails</strong> — booking confirmations, reminders, cancellation notices. You can't opt out of these as long as you have bookings in progress.</li>
          <li><strong>To process payments via Stripe</strong>. Stripe receives the data it needs to charge cards and pay tutors out. See <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="text-kotoba-primary underline">Stripe's privacy policy</a>.</li>
          <li><strong>To meet legal obligations</strong> — keeping a record of completed transactions for tax purposes (typically 6–7 years depending on jurisdiction).</li>
        </ul>

        <h2 className="text-xl font-semibold text-kotoba-primary mt-8">Who we share it with</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>Stripe</strong> — payments, payouts, KYC for tutors</li>
          <li><strong>Resend</strong> — transactional email delivery</li>
          <li><strong>Daily.co</strong> — classroom video calls</li>
          <li><strong>Cloudflare</strong> — DNS and basic CDN</li>
          <li><strong>The tutor you book with</strong>, or the student who books you — only the data needed for the lesson (name, email for reminders, message history)</li>
        </ul>
        <p>We never sell your data to advertisers. We don't run third-party tracking pixels.</p>

        <h2 className="text-xl font-semibold text-kotoba-primary mt-8">Cookies</h2>
        <p>
          We use a single first-party cookie/local-storage item to keep you logged in
          (your auth token). We don't use third-party analytics or advertising cookies.
          You'll see a one-time banner the first time you visit confirming this — clicking
          "OK" remembers your acknowledgement.
        </p>

        <h2 className="text-xl font-semibold text-kotoba-primary mt-8">Your rights (GDPR)</h2>
        <p>If you're in the EU/UK or somewhere with similar privacy law, you have the right to:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong>Access</strong> — download a copy of everything we hold about you.
            Go to Settings → "Download my data" or email us.
          </li>
          <li>
            <strong>Correct</strong> — fix anything that's wrong by editing your profile
            or asking us.
          </li>
          <li>
            <strong>Delete</strong> — Settings → "Delete my account". Personal data is
            anonymised; financial records for completed transactions are kept (legal
            obligation) but no longer linked to your identity.
          </li>
          <li>
            <strong>Object</strong> — to processing for any purpose; contact us.
          </li>
          <li>
            <strong>Complain</strong> — to your local data protection authority.
          </li>
        </ul>

        <h2 className="text-xl font-semibold text-kotoba-primary mt-8">How long we keep data</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>Active accounts</strong> — for as long as you keep the account open.</li>
          <li><strong>Deleted accounts</strong> — personal data is anonymised within minutes; records of completed paid bookings stay 6–7 years for tax reasons, in an anonymised form (no identifying details).</li>
          <li><strong>Email verification codes + password reset tokens</strong> — 24 hours max.</li>
          <li><strong>Server logs</strong> — 30 days.</li>
        </ul>

        <h2 className="text-xl font-semibold text-kotoba-primary mt-8">Children</h2>
        <p>
          Kotobaseed isn't for children under 16. If a tutor teaches younger students,
          the booking must be made by a parent or legal guardian using their own account.
        </p>

        <h2 className="text-xl font-semibold text-kotoba-primary mt-8">Contact</h2>
        <p>
          Email <a href="mailto:hello@kotobaseed.net" className="text-kotoba-primary underline">hello@kotobaseed.net</a> for any privacy-related request. We aim to reply within a week.
        </p>

        <p className="text-sm text-kotoba-text/60 pt-8 border-t border-kotoba-text/10">
          See also: <Link to="/terms" className="text-kotoba-primary underline">Terms of service</Link> · <Link to="/refunds" className="text-kotoba-primary underline">Refund + cancellation policy</Link>
        </p>
      </section>
    </main>
  </div>
);

export default Privacy;
