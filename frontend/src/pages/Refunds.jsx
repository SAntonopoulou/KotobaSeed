import React from 'react';
import { Link } from 'react-router-dom';

const Refunds = () => (
  <div className="bg-white min-h-screen">
    <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-kotoba-primary mb-2">Refund + cancellation policy</h1>
      <p className="text-sm text-kotoba-text/60 mb-8">Last updated: 6 June 2026</p>

      <section className="space-y-4 text-kotoba-text leading-relaxed">
        <h2 className="text-xl font-semibold text-kotoba-primary mt-8">One-to-one lessons</h2>
        <p>
          Cancellation rules are set by each tutor, with a platform floor of <strong>48 hours' notice</strong>. Tutors may set stricter (longer) windows. The exact cutoff is shown at checkout.
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>Outside the cancellation window</strong>: cancel from your bookings page; the full amount is refunded automatically. Refunds typically appear in 5–10 business days depending on your bank.</li>
          <li><strong>Inside the cancellation window</strong>: the self-serve cancel button is disabled. The tutor may still choose to refund or reschedule — message them directly.</li>
          <li><strong>If a tutor doesn't show up</strong>: contact <a href="mailto:hello@kotobaseed.net" className="text-kotoba-primary underline">hello@kotobaseed.net</a> within 7 days with the booking ID. We refund verified no-shows in full.</li>
          <li><strong>Technical failures preventing the lesson</strong>: contact us; we'll mediate.</li>
        </ul>

        <h2 className="text-xl font-semibold text-kotoba-primary mt-8">Lesson packs (bundles)</h2>
        <p>
          Packs are sold and refunded by individual lesson within the pack — the cancellation rules above apply to each scheduled lesson. Unused, unscheduled lessons from a pack stay available until you book them.
        </p>

        <h2 className="text-xl font-semibold text-kotoba-primary mt-8">Digital content (modules + premium homework)</h2>
        <p>
          By starting a one-off content purchase you confirm immediate access and waive the EU 14-day withdrawal right (where it would otherwise apply). Refunds are at the tutor's discretion, except where there's a substantive defect — message the tutor first; we'll mediate if needed.
        </p>

        <h2 className="text-xl font-semibold text-kotoba-primary mt-8">Subscriptions</h2>
        <p>
          You can cancel any subscription from your Settings → My subscriptions page. Cancellation takes effect at the end of the current billing period — you keep access until then. We don't pro-rate refunds for partial periods.
        </p>

        <h2 className="text-xl font-semibold text-kotoba-primary mt-8">Grading credits</h2>
        <p>
          Grading credits are part of a subscription. When the subscription ends, unused credits expire at the end of the billing period.
        </p>

        <h2 className="text-xl font-semibold text-kotoba-primary mt-8">Chargebacks</h2>
        <p>
          Please reach out to us before initiating a chargeback — we can almost always resolve disputes faster than your bank. Repeated chargebacks may trigger account review.
        </p>

        <p className="text-sm text-kotoba-text/60 pt-8 border-t border-kotoba-text/10">
          See also: <Link to="/terms" className="text-kotoba-primary underline">Terms</Link> · <Link to="/privacy" className="text-kotoba-primary underline">Privacy</Link>
        </p>
      </section>
    </main>
  </div>
);

export default Refunds;
