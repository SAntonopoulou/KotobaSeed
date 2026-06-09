import React from 'react';
import LegalPageLayout, { H2, H3, P, UL } from '../components/LegalPageLayout';

// Full content lives in /legal-research/policies/tutor-agreement.md.
const TutorAgreement = () => (
  <LegalPageLayout
    title="Tutor agreement"
    lastUpdated="2026-06-08"
    version="1.0"
    currentSlug="/legal/tutor-agreement"
  >
    <P>
      This Tutor Agreement is the contract between you (the <strong>Tutor</strong>) and Kotobaseed. It is in addition to the general <a href="/terms" className="text-kotoba-primary underline">Terms of Service</a> and the <a href="/legal/acceptable-use" className="text-kotoba-primary underline">Acceptable Use Policy</a>. Where it conflicts with the general Terms, this Agreement governs in respect of your activity as a Tutor.
    </P>
    <P>
      By onboarding as a Tutor (creating an account with the CREATOR role and completing initial setup), you accept this Tutor Agreement.
    </P>

    <H2>1. What you are getting from Kotobaseed</H2>
    <P>Kotobaseed provides you with <strong>tools</strong> to operate your own teaching business:</P>
    <UL>
      <li>A tenant subdomain and, on Pro+, a custom domain option</li>
      <li>A bookings + calendar system, a video classroom (Daily.co), payment processing via Stripe Connect, content publishing (articles, modules, homework), a student CRM</li>
      <li>Marketing surfaces — your tenant landing page, content discoverability, an opt-in marketplace listing</li>
      <li>Optionally (Pro+), a custom-designed bespoke theme</li>
    </UL>

    <H2>2. What you are NOT getting from Kotobaseed</H2>
    <P>You are not:</P>
    <UL>
      <li>An employee, worker, agent, partner, or franchisee of Kotobaseed</li>
      <li>Receiving a wage, salary, holiday pay, sick pay, pension contribution, or any other employment-related benefit</li>
      <li>Subject to a minimum hours requirement or an exclusivity requirement</li>
      <li>Required to follow operational instructions from Kotobaseed beyond the Terms, this Agreement, and the Acceptable Use Policy</li>
      <li>Sold as a service by Kotobaseed — your students contract directly with you for the lesson</li>
    </UL>

    <H2>3. Independent-contractor status (EU Platform Work Directive)</H2>
    <P>
      This Section is structured to make your status as an independent professional defensible under Directive (EU) 2024/2831 and its national transpositions in Belgium, Greece, and other EU member states. You confirm:
    </P>
    <UL>
      <li><strong>You set your own prices.</strong> No platform-imposed minimum or maximum.</li>
      <li><strong>You set your own availability.</strong> No minimum number of hours required. You can be available zero hours per week.</li>
      <li><strong>You choose which students you accept.</strong> You may decline any booking for any non-discriminatory reason.</li>
      <li><strong>You are free to work for competitors.</strong> No exclusivity. You may sell on Preply, italki, your own website, in person, or anywhere else, at any time.</li>
      <li><strong>You are not paid by Kotobaseed.</strong> Students pay you directly via Stripe Connect.</li>
      <li><strong>You decide how you teach.</strong> Lesson content, pedagogy, style, language are entirely your choice subject only to the Acceptable Use Policy.</li>
      <li><strong>You provide your own equipment</strong> — laptop, microphone, camera, internet.</li>
      <li><strong>You are responsible for your own taxes, social-security contributions, professional insurance</strong> in the country you reside in.</li>
    </UL>
    <P>
      Kotobaseed's interest in your work is limited to (a) the platform fee and (b) Acceptable Use compliance.
    </P>

    <H2>4. Payments</H2>
    <UL>
      <li><strong>Students pay you directly via Stripe Connect.</strong> Funds flow from student card to your Stripe Connect Express account under Stripe's <code>transfer_data.destination</code> mechanism. Kotobaseed never holds student funds.</li>
      <li><strong>Kotobaseed's revenue from you</strong> is (a) your monthly tutor subscription (Free / Plus / Pro / Business) and (b) a platform transaction fee (0% / 5% / 10% depending on tier).</li>
      <li><strong>Stripe fees</strong> are charged to your Stripe account.</li>
      <li><strong>Payouts</strong> follow Stripe's standard schedule. You manage payout cadence from your Stripe Express dashboard via Money → Open my Stripe dashboard.</li>
      <li><strong>Invoicing</strong>: you are responsible for issuing VAT-compliant invoices to your students where required by your jurisdiction.</li>
    </UL>

    <H2>5. Tax responsibilities</H2>
    <P>You are responsible for:</P>
    <UL>
      <li>Registering for any tax IDs / VAT numbers required in your country</li>
      <li>Declaring your income and paying any income tax due</li>
      <li>Where applicable, registering for VAT/OSS and using the EU One-Stop-Shop for cross-border digital service sales over €10,000/year</li>
      <li><strong>Greek tutors</strong>: complying with <strong>myDATA</strong> real-time invoice reporting (mandatory for all businesses by October 2026)</li>
      <li>Belgian tutors: complying with monthly Belgian BTW/TVA filings if registered</li>
    </UL>
    <P>
      Kotobaseed is not your accountant, tax adviser, or tax agent.
    </P>

    <H2>6. Subscription tiers + 15-day notice</H2>
    <P>
      We may revise tier features with at least <strong>15 calendar days' notice</strong> per Article 8 of the EU P2B Regulation, sent via email and via a dashboard banner. Subscription cancellation or downgrade takes effect at the end of the current billing period.
    </P>
    <P>
      Current tiers, fees, and the monthly classroom-minute allowance are published at <a href="/pricing" className="text-kotoba-primary underline">/pricing</a>.
    </P>

    <H2>7. Use of student data — joint controllership</H2>
    <P>
      You see student data (names, lesson history, homework answers, private notes) for the limited purpose of teaching those students. You are a <strong>joint controller</strong> with Kotobaseed for that data under Article 26 GDPR.
    </P>
    <UL>
      <li>Don't use student data for any purpose other than teaching, contacting the student about their lessons, or honouring their data-subject rights</li>
      <li>Don't sell, rent, or share student lists with third parties</li>
      <li>Don't bulk-export student data and use it outside Kotobaseed</li>
      <li>Keep your access secured (strong password, no shared logins)</li>
      <li>If a student exercises a right on data you control, respond promptly</li>
      <li>Report any data breach you become aware of to <a href="mailto:security@kotobaseed.net" className="text-kotoba-primary underline">security@kotobaseed.net</a> within 24 hours</li>
    </UL>

    <H2>8. Acceptable use</H2>
    <P>
      You will comply with the <a href="/legal/acceptable-use" className="text-kotoba-primary underline">Acceptable Use Policy</a>. In particular: don't direct students off-platform to avoid the platform fee, and don't write false credentials.
    </P>

    <H2>9. Termination</H2>
    <P>
      You may close your account from Settings → Delete my account. Closure takes effect immediately for the public-facing site; pending bookings continue until completion or cancellation; payouts continue to your Stripe account for any past confirmed lessons.
    </P>
    <P>
      We may terminate your account for breach, non-payment, or failed KYC. We provide a clear statement of reasons per DSA Article 17 and you may appeal under the Acceptable Use Policy.
    </P>

    <H2>10. Content licence</H2>
    <P>
      You retain ownership of your articles, modules, homework templates, custom themes, profile content, and everything else you publish. You grant Kotobaseed a non-exclusive, royalty-free, worldwide licence to host and present that content within the Service to the audience you have specified. You retain the right to publish the same content elsewhere.
    </P>

    <H2>11. Liability</H2>
    <P>
      The standard Terms of Service liability provisions apply. Kotobaseed is not liable for any business loss or loss of profit caused by an outage of the Service or of a sub-processor. You indemnify Kotobaseed against claims by your students arising from your conduct or content.
    </P>

    <H2>12. Notices to you</H2>
    <P>
      Per P2B Article 8, material changes that affect you as a business user get <strong>at least 15 calendar days' notice</strong> via email + dashboard banner.
    </P>

    <H2>13. Governing law</H2>
    <P>
      This Agreement is governed by the law of Kotobaseed's country of incorporation (Belgium OR Greece — to be confirmed). Disputes between Kotobaseed and a Tutor are subject to the exclusive jurisdiction of the courts of that country, except where mandatory consumer / employment law in your country of residence provides otherwise.
    </P>
  </LegalPageLayout>
);

export default TutorAgreement;
