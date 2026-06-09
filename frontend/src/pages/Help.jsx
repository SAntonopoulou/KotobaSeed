import React from 'react';
import { Link } from 'react-router-dom';

const Section = ({ title, children }) => (
  <section className="bg-white rounded-2xl shadow-sm p-6 space-y-3">
    <h2 className="text-lg font-bold text-kotoba-primary">{title}</h2>
    <div className="text-sm text-kotoba-text leading-relaxed space-y-2">{children}</div>
  </section>
);

const Help = () => (
  <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
    <header>
      <h1 className="text-3xl font-bold text-kotoba-primary">Help & FAQ</h1>
      <p className="text-sm text-kotoba-text/70 mt-2">
        Common questions about booking, paying, teaching, and getting paid on Kotobaseed. If you can't find what you need,{' '}
        <Link to="/support" className="text-kotoba-primary underline">open a support ticket</Link> and we'll be in touch.
      </p>
    </header>

    <Section title="As a student">
      <p><strong>How do I book a lesson?</strong> Visit your tutor's site, pick a time, pay with card. The classroom opens 15 minutes before your lesson starts.</p>
      <p><strong>What if I need to cancel?</strong> You can cancel up to the tutor's cutoff (48h minimum). Outside that window you get a full refund; inside, talk to the tutor — sometimes they'll reschedule.</p>
      <p><strong>How do recurring lessons work?</strong> Tick "Make this a recurring weekly lesson" when booking. We auto-create the next 4 weeks of bookings; you pay for each one before the lesson.</p>
      <p><strong>What's a group lesson?</strong> Multiple students share one slot. The tutor sets a max + minimum size. If fewer than the minimum book by the cutoff, the lesson is cancelled and everyone is refunded.</p>
    </Section>

    <Section title="As a tutor">
      <p>
        <strong>New here?</strong> Start with the{' '}
        <Link to="/help/tutor-getting-started" className="text-kotoba-primary underline">
          tutor getting-started guide
        </Link>{' '}
        — a long-form walkthrough of every piece. Signed-in tutors can also run the
        interactive version from the dashboard overview.
      </p>
      <p><strong>How do I get paid?</strong> Stripe pays you directly to your bank account on the standard schedule (we hold a 14-day rolling reserve as a buffer against chargebacks). Open the Stripe dashboard from your Money tab.</p>
      <p><strong>How do I set my availability?</strong> Lessons → Availability. Click the grid to add weekly slots; the public site picks them up automatically.</p>
      <p><strong>What's the page builder?</strong> A Pro feature — rearrange and customise the sections on your tutor site. Pick a theme, hide sections you don't need, edit hero/about copy.</p>
      <p><strong>How do referrals work?</strong> Your Referrals page shows your personal codes. Share them and earn — €5 milestone bonus when a tutor you refer teaches their first lesson, more at €500/€2k/€10k of their revenue. €10 lesson credit when a student you refer takes their first paid lesson.</p>
    </Section>

    <Section title="Money, refunds, taxes">
      <p>Cancellation rules and refund eligibility are spelt out on the <Link to="/refunds" className="text-kotoba-primary underline">refunds page</Link>. Your tutor sets the exact cancellation window (with a 48h platform floor).</p>
      <p>For tax — you're responsible for your own income tax and any VAT/sales tax your country requires. Stripe Tax can help; ask your accountant.</p>
    </Section>

    <Section title="Account + privacy">
      <p>Manage your account from <Link to="/settings" className="text-kotoba-primary underline">Settings</Link>. You can download a full export of your data ("Download my data") or delete your account at any time. Deletion anonymises personal data immediately; we keep financial records for tax purposes only.</p>
      <p>Full details: <Link to="/privacy" className="text-kotoba-primary underline">privacy policy</Link> and <Link to="/terms" className="text-kotoba-primary underline">terms</Link>.</p>
    </Section>

    <Section title="Still stuck?">
      <p><Link to="/support" className="text-kotoba-primary underline">Open a support ticket</Link>. We aim to reply within one business day.</p>
    </Section>
  </main>
);

export default Help;
