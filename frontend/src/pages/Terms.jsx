import React from 'react';
import LegalPageLayout, { H2, H3, P, UL } from '../components/LegalPageLayout';

// Full content (with statutory references and footnotes) lives in
// /legal-research/policies/terms-of-service.md.

const Terms = () => (
  <LegalPageLayout
    title="Terms of service"
    lastUpdated="2026-06-08"
    version="2.0"
    currentSlug="/terms"
  >
    <P>
      These Terms are a legally binding agreement between you and Kotobaseed. They apply when you create an account, browse a tutor's site at <code>&lt;slug&gt;.kotobaseed.net</code>, or interact with anything we publish on kotobaseed.net. By using the Service you agree to these Terms.
    </P>
    <P>
      <strong>Provider:</strong> Kotobaseed (the "Service" or "Kotobaseed"), operated by Sophia Willowood. Registered office and VAT details will be added on incorporation.{' '}
      <br />
      <strong>Contact:</strong> hello@kotobaseed.net · Data protection: <a href="mailto:dpo@kotobaseed.net" className="text-kotoba-primary underline">dpo@kotobaseed.net</a>
    </P>

    <H2>1. What Kotobaseed is — and what it isn't</H2>
    <P>
      Kotobaseed is an <strong>online intermediation service</strong> under EU Regulation 2019/1150 (the "P2B Regulation") and an <strong>online platform</strong> under EU Regulation 2022/2065 (the "Digital Services Act"). We provide independent language tutors with a tenant subdomain, payment infrastructure via Stripe Connect, a video classroom via Daily.co, content publishing tools, and student CRM. We enable students to discover those tutors, book lessons, and pay them directly.
    </P>
    <P>
      We are <strong>not</strong> a party to the lesson contract between you and a tutor. We do not employ tutors. We are not a video provider — Daily.co is. We are not a payment institution — Stripe Payments Europe Ltd is, and we operate as a <strong>commercial agent</strong> under Article 3(b) PSD2 (as transposed) facilitating direct charges to tutors' Stripe Connect Express accounts.
    </P>

    <H2>2. Eligibility</H2>
    <UL>
      <li><strong>Minimum age</strong>: 16 for students. 18 for tutors.</li>
      <li><strong>Capacity</strong>: you confirm you have legal capacity to enter this agreement in your jurisdiction.</li>
      <li><strong>One person, one account</strong>: don't share, impersonate, or use someone else's account.</li>
      <li><strong>Tutors</strong>: by onboarding as a tutor you confirm you are an <strong>independent provider</strong>, not an employee or agent of Kotobaseed. See the <a href="/legal/tutor-agreement" className="text-kotoba-primary underline">Tutor Agreement</a>.</li>
    </UL>

    <H2>3. Accounts + responsibilities</H2>
    <UL>
      <li>Provide accurate information and keep it up to date.</li>
      <li>Keep your password confidential. You are responsible for everything that happens under your account.</li>
      <li>We may suspend or terminate accounts that breach these Terms, infringe third-party rights, fail to pay, or fail KYC/AML checks. Per Article 17 DSA, you'll receive a clear written statement of reasons and (where applicable) appeal instructions.</li>
      <li>We may close inactive accounts after 24 months of inactivity following 30 days' notice.</li>
    </UL>

    <H2>4. Tutor–student relationship</H2>
    <P>
      When you book a lesson or buy content from a tutor, the contract is <strong>between you and the tutor</strong>. The tutor is the supplier of the lesson or digital content. Kotobaseed is the technical intermediary that facilitates discovery, scheduling, payment, and delivery.
    </P>
    <P>
      Tutors set their own prices and currencies, lesson durations and pack structures, availability windows and timezone, cancellation policies (subject to platform floors below), free-trial settings, bios, photos, content, and branding (subject to the <a href="/legal/acceptable-use" className="text-kotoba-primary underline">Acceptable Use Policy</a>).
    </P>
    <P>
      Tutors are <strong>independent contractors</strong> for the purpose of EU Directive 2024/2831. Each tutor is responsible for their own taxes, social-security contributions, professional insurance, and regulatory compliance.
    </P>

    <H2>5. Payments, fees, and refunds</H2>
    <H3>5.1 How payment works</H3>
    <P>
      Payments are processed by <strong>Stripe Payments Europe Ltd</strong>. Funds flow directly from your card to the tutor's connected Stripe account under <code>transfer_data.destination</code>. Kotobaseed never holds or controls student funds.
    </P>
    <H3>5.2 Platform fee</H3>
    <P>
      Kotobaseed charges a platform fee as a percentage of each transaction: Free / Plus 10%; Pro 5%; Business 0%. Tutor subscriptions are separately billed monthly or annually.
    </P>
    <H3>5.3 14-day withdrawal right (digital content)</H3>
    <P>
      Where the EU Consumer Rights Directive 2011/83 (as transposed into Belgian Code de droit économique Book VI / Greek Νόμος 2251/1994) applies, you ordinarily have a 14-day withdrawal right for online purchases.
    </P>
    <P>
      For <strong>digital content delivered immediately</strong> (modules, premium articles, downloadable homework), clicking "Buy" gives your <strong>express consent</strong> to immediate performance and you <strong>acknowledge that this waives your 14-day withdrawal right</strong> for that content. We tell you this at checkout. If you don't consent, don't click Buy.
    </P>
    <P>
      For <strong>lessons</strong>, the 14-day withdrawal does not apply because the lesson is performed on a specific calendar date you choose. Lesson cancellation is governed by Section 5.4.
    </P>
    <H3>5.4 Lesson cancellation + refunds</H3>
    <P>See the <a href="/refunds" className="text-kotoba-primary underline">Refunds + cancellation policy</a> for the full rules.</P>
    <H3>5.5 Subscriptions</H3>
    <P>
      Cancel any subscription from Settings → My subscriptions. Cancellation takes effect at the end of the current billing period. We don't pro-rate refunds.
    </P>
    <H3>5.6 Chargebacks</H3>
    <P>
      Please contact us before initiating a chargeback — we can usually resolve faster than your bank. Repeated chargebacks may trigger account review.
    </P>

    <H2>6. VAT and invoicing</H2>
    <P>
      The supplier of the lesson or digital content is the <strong>tutor</strong>. Where the tutor is VAT-registered, the tutor is responsible for issuing VAT invoices and for compliance with VAT-OSS, myDATA (Greece), or local equivalents. Kotobaseed separately invoices the tutor for the platform fee and subscription.
    </P>

    <H2>7. Content uploaded by you</H2>
    <P>
      You retain ownership of everything you upload. You grant Kotobaseed a non-exclusive, royalty-free, worldwide licence to host, store, transmit, and display that content for the purpose of operating the Service. This licence ends when you delete the content or your account, except where retention is required by law.
    </P>

    <H2>8. Tutor content</H2>
    <P>
      Tutors retain ownership of their articles, modules, homework templates, and other materials they publish. By publishing on Kotobaseed they grant us a non-exclusive licence to host and present that content within the Service to the audience they specify.
    </P>

    <H2>9. Acceptable use</H2>
    <P>
      You agree not to use the Service for illegal activity, to upload illegal content, to harass or defame, to scrape or extract content without consent, to replicate the platform, to bypass the platform fee (tutors), to circumvent KYC/AML/sanctions controls, or to probe the security of the Service except via our responsible-disclosure channel. Full details in the <a href="/legal/acceptable-use" className="text-kotoba-primary underline">Acceptable Use Policy</a>.
    </P>

    <H2>10. Suspension, termination, and notice + action (DSA)</H2>
    <P>
      We may suspend or terminate accounts that breach these Terms. Per Article 17 DSA, we provide a clear <strong>statement of reasons</strong>.
    </P>
    <P>
      <strong>Reporting illegal content</strong> (DSA Article 16): use the form at <a href="/legal/report-content" className="text-kotoba-primary underline">/legal/report-content</a> or email <a href="mailto:report@kotobaseed.net" className="text-kotoba-primary underline">report@kotobaseed.net</a>. We acknowledge reports promptly and act in good faith.
    </P>
    <P>
      <strong>Appeals</strong>: email hello@kotobaseed.net. We aim to respond within 14 days. Humans review every appeal.
    </P>

    <H2>11. Changes to these Terms (P2B Article 8)</H2>
    <P>
      For material changes that affect <strong>tutors as business users</strong>, we provide at least <strong>15 calendar days' notice</strong> before the change takes effect (per Article 8 of the P2B Regulation). For shorter notice in urgent legal-compliance situations, we explain the reason.
    </P>
    <P>
      For changes that only affect students, we provide notice on kotobaseed.net and via email at least 14 days before the change takes effect, unless required by law in less time.
    </P>
    <P>
      If you don't agree to a change, you can terminate your account before the change takes effect.
    </P>

    <H2>12. Data, privacy, and cookies</H2>
    <P>
      Our <a href="/privacy" className="text-kotoba-primary underline">Privacy Policy</a> describes what personal data we collect, how we use it, who we share it with (including international transfers under SCCs / Data Privacy Framework), and your rights under GDPR.
    </P>
    <P>
      Our <a href="/legal/cookies" className="text-kotoba-primary underline">Cookie Policy</a> lists the cookies we use — exactly two first-party cookies; no advertising, no third-party tracking.
    </P>
    <P>
      We do not sell personal data. We are not a data broker. DPO: <a href="mailto:dpo@kotobaseed.net" className="text-kotoba-primary underline">dpo@kotobaseed.net</a>.
    </P>

    <H2>13. Intellectual property</H2>
    <P>
      The Kotobaseed name, logo, and overall site design are © 2026 Kotobaseed.
    </P>

    <H2>14. Disclaimer and liability</H2>
    <P>
      To the maximum extent permitted by mandatory consumer law in your jurisdiction, the Service is provided "as is". We make no warranty about availability, error-free operation, or fitness for any particular purpose.
    </P>
    <P>
      We are not liable for tutor conduct or quality. We are not liable for failures of third-party services we rely on (Stripe, Daily.co, Cloudflare, R2, Sentry, Hetzner, the underlying internet) provided we have not been negligent.
    </P>
    <P>
      To the maximum extent permitted by mandatory law, our total liability to you in any 12-month period is capped at the greater of the platform fees you paid us in that period and €100.
    </P>
    <P>
      Nothing here limits liability that cannot be limited under mandatory law (gross negligence, intentional misconduct, death/injury caused by our negligence, GDPR damages). For EU/EEA consumers, mandatory consumer protection law in your country of residence applies.
    </P>

    <H2>15. Governing law and jurisdiction</H2>
    <P>
      Governed by the law of our country of incorporation (Belgium OR Greece — confirmed on incorporation; this Section will be updated and Section 11 notice given).
    </P>
    <P>
      Consumer disputes: subject to the mandatory consumer protection law of your habitual residence. EU consumers may also use the European Commission's <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer" className="text-kotoba-primary underline">Online Dispute Resolution platform</a>.
    </P>
    <P>
      Business-user disputes: exclusive jurisdiction of the courts of our country of incorporation, except where mandatory law provides otherwise.
    </P>

    <H2>16. Other</H2>
    <UL>
      <li><strong>Entire agreement</strong> between you and Kotobaseed; local mandatory law overrides anything inconsistent here.</li>
      <li><strong>No waiver</strong>: failure to enforce a provision is not a waiver.</li>
      <li><strong>Severability</strong>: if any provision is unenforceable, the rest remains in effect.</li>
      <li><strong>Assignment</strong>: you may not assign without consent; we may assign on sale or reorganisation.</li>
      <li><strong>Force majeure</strong>: neither party is liable for failure caused by events outside reasonable control.</li>
      <li><strong>Notices</strong>: from us to you via the email on your account; from you to us at hello@kotobaseed.net.</li>
    </UL>
  </LegalPageLayout>
);

export default Terms;
