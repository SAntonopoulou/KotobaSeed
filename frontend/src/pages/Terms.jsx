import React from 'react';
import { Link } from 'react-router-dom';

const Terms = () => (
  <div className="bg-white min-h-screen">
    <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-kotoba-primary mb-2">Terms of service</h1>
      <p className="text-sm text-kotoba-text/60 mb-8">Last updated: 6 June 2026</p>

      <section className="space-y-4 text-kotoba-text leading-relaxed">
        <h2 className="text-xl font-semibold text-kotoba-primary mt-8">1. What Kotobaseed is</h2>
        <p>
          Kotobaseed is a platform that lets language tutors run their own site, take
          bookings, run lessons, sell digital content, and grow a student base. By using
          Kotobaseed, you agree to these terms. If you don't agree, please don't use the
          service.
        </p>

        <h2 className="text-xl font-semibold text-kotoba-primary mt-8">2. Accounts</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>You must be 16 or older to create an account. Tutors must be 18+ to onboard with Stripe Connect (Stripe requires this).</li>
          <li>One person, one account. Don't impersonate anyone else.</li>
          <li>Keep your password safe. You're responsible for everything that happens under your account.</li>
        </ul>

        <h2 className="text-xl font-semibold text-kotoba-primary mt-8">3. Tutor relationships</h2>
        <p>
          When you book a lesson or buy content, the contract is between you and the
          tutor — Kotobaseed is a platform, not a party to the lesson itself. Tutors set
          their own prices, schedules, cancellation policies (within platform minimums),
          and content.
        </p>
        <p>
          Tutors are independent. They are not Kotobaseed employees or agents. Each
          tutor is responsible for their own taxes, insurance, and legal compliance
          where they live.
        </p>

        <h2 className="text-xl font-semibold text-kotoba-primary mt-8">4. Payments + fees</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>Payments go through Stripe. Tutors connect their own Stripe accounts and receive payouts directly. Kotobaseed never holds tutor money.</li>
          <li>Kotobaseed takes a platform fee on transactions, varying by tutor subscription tier (0–10%).</li>
          <li>For one-to-one lessons: the platform floor for cancellation is 48 hours' notice. Tutors may set stricter (longer) windows but never shorter.</li>
          <li>Cancellations made within the cancellation window do not entitle the student to a refund unless the tutor chooses to issue one.</li>
        </ul>

        <h2 className="text-xl font-semibold text-kotoba-primary mt-8">5. Acceptable use</h2>
        <p>You agree not to:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Use the service for anything illegal where you are.</li>
          <li>Harass, threaten, or abuse anyone — tutors, students, or staff.</li>
          <li>Scrape, copy, or redistribute platform content or other people's content without permission.</li>
          <li>Sell or transfer your account.</li>
          <li>Attempt to bypass platform fees by moving payment off-platform after a connection was made through Kotobaseed.</li>
          <li>Misrepresent your identity, qualifications, or location.</li>
        </ul>

        <h2 className="text-xl font-semibold text-kotoba-primary mt-8">6. Tutor obligations</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>Show up to scheduled lessons on time, prepared.</li>
          <li>Refund or reschedule promptly if you can't make a lesson.</li>
          <li>Don't publish content you don't have the rights to.</li>
          <li>Handle student data with respect — never sell, share, or repurpose it outside teaching the student you got it from.</li>
          <li>Comply with local regulations around freelance teaching, including any required business registration or VAT/sales tax.</li>
        </ul>

        <h2 className="text-xl font-semibold text-kotoba-primary mt-8">7. Content you create</h2>
        <p>
          You keep ownership of anything you create — articles, lessons, modules, homework,
          messages. By posting it through Kotobaseed, you grant us a non-exclusive licence
          to host and display it as part of running the service. That licence ends when
          you delete the content or your account.
        </p>

        <h2 className="text-xl font-semibold text-kotoba-primary mt-8">8. Suspension + termination</h2>
        <p>
          We can suspend or remove accounts that violate these terms, harm other users, or
          create legal risk for the platform. Repeated chargebacks, fraudulent payments,
          or no-shows may also trigger suspension. We'll explain what happened and how to
          appeal — but we reserve the right to terminate in serious cases without notice.
        </p>
        <p>
          You can delete your account any time from Settings. Personal data is anonymised;
          financial records of completed transactions are kept for tax purposes (see the
          <Link to="/privacy" className="text-kotoba-primary underline"> privacy policy</Link>).
        </p>

        <h2 className="text-xl font-semibold text-kotoba-primary mt-8">9. No warranty</h2>
        <p>
          Kotobaseed is provided "as is". We don't guarantee specific lesson outcomes,
          tutor availability, perfect uptime, or income for tutors. We do work hard to
          keep the platform stable and fair.
        </p>

        <h2 className="text-xl font-semibold text-kotoba-primary mt-8">10. Liability</h2>
        <p>
          To the extent permitted by law, Kotobaseed isn't liable for indirect or
          consequential losses (lost revenue, missed exams, etc.). Our maximum direct
          liability for any claim is capped at the total platform fees we received from
          you in the 12 months before the issue.
        </p>

        <h2 className="text-xl font-semibold text-kotoba-primary mt-8">11. Changes</h2>
        <p>
          We may update these terms as the platform grows. Material changes will be
          announced at least 30 days in advance, by email and a notice on the site.
          Continuing to use the service after that means you accept the new terms.
        </p>

        <h2 className="text-xl font-semibold text-kotoba-primary mt-8">12. Law + disputes</h2>
        <p>
          These terms are governed by the law of the country where Kotobaseed is
          legally established. We'd much rather sort out problems by email than in court —
          start there: <a href="mailto:hello@kotobaseed.net" className="text-kotoba-primary underline">hello@kotobaseed.net</a>.
        </p>

        <p className="text-sm text-kotoba-text/60 pt-8 border-t border-kotoba-text/10">
          See also: <Link to="/privacy" className="text-kotoba-primary underline">Privacy policy</Link> · <Link to="/refunds" className="text-kotoba-primary underline">Refund + cancellation policy</Link>
        </p>
      </section>
    </main>
  </div>
);

export default Terms;
