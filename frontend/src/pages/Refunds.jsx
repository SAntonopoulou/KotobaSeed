import React from 'react';
import LegalPageLayout, { H2, P, UL } from '../components/LegalPageLayout';

const Refunds = () => (
  <LegalPageLayout
    title="Refund + cancellation policy"
    lastUpdated="2026-06-08"
    version="2.0"
    currentSlug="/refunds"
  >
    <H2>One-to-one lessons</H2>
    <P>
      Cancellation rules are set by each tutor, with a platform floor of <strong>48 hours' notice</strong>. Tutors may set stricter (longer) windows. The exact cutoff is shown at checkout.
    </P>
    <UL>
      <li><strong>Outside the cancellation window</strong>: cancel from your bookings page; the full amount is refunded automatically. Refunds typically appear in 5–10 business days depending on your bank.</li>
      <li><strong>Inside the cancellation window</strong>: the self-serve cancel button is disabled. The tutor may still choose to refund or reschedule — message them directly.</li>
      <li><strong>Tutor no-show</strong>: contact <a href="mailto:hello@kotobaseed.net" className="text-kotoba-primary underline">hello@kotobaseed.net</a> within 7 days with the booking ID. We refund verified no-shows in full.</li>
      <li><strong>Technical failure preventing the lesson</strong>: contact us; we mediate.</li>
    </UL>

    <H2>Lesson packs (bundles)</H2>
    <P>
      Packs are sold and refunded by individual lesson within the pack — the cancellation rules above apply to each scheduled lesson. Unused, unscheduled lessons from a pack stay available until you book them.
    </P>

    <H2>Digital content (modules + premium homework + premium articles)</H2>
    <P>
      Under the EU Consumer Rights Directive 2011/83 (Belgian Code de droit économique Book VI / Greek Νόμος 2251/1994), you ordinarily have a <strong>14-day withdrawal right</strong> on online purchases. For digital content delivered immediately, this right can be waived if you give express consent before performance begins.
    </P>
    <P>
      <strong>By starting a one-off content purchase you give express consent to immediate performance and acknowledge that this waives your 14-day withdrawal right.</strong> We tell you this at the checkout step. If you do not consent, do not complete the purchase.
    </P>
    <P>
      Refunds outside the waiver are at the tutor's discretion, except where there's a substantive defect (e.g. content that doesn't load, content that doesn't match its description) — message the tutor first; we mediate if needed.
    </P>

    <H2>Subscriptions</H2>
    <P>
      Cancel any subscription from Settings → My subscriptions. Cancellation takes effect at the end of the current billing period — you keep access until then. We don't pro-rate refunds for partial periods.
    </P>

    <H2>Grading credits</H2>
    <P>
      Grading credits are part of a subscription. When the subscription ends, unused credits expire at the end of the billing period.
    </P>

    <H2>Chargebacks</H2>
    <P>
      Please reach out to us before initiating a chargeback — we can almost always resolve disputes faster than your bank. Repeated chargebacks may trigger account review.
    </P>

    <H2>EU online dispute resolution</H2>
    <P>
      EU consumers can also use the European Commission's{' '}
      <a
        href="https://ec.europa.eu/consumers/odr"
        target="_blank"
        rel="noopener noreferrer"
        className="text-kotoba-primary underline"
      >
        Online Dispute Resolution platform
      </a>.
    </P>
  </LegalPageLayout>
);

export default Refunds;
