import React from 'react';
import LegalPageLayout, { H2, H3, P, UL } from '../components/LegalPageLayout';

// Full content lives in /legal-research/policies/acceptable-use-policy.md.
const AcceptableUse = () => (
  <LegalPageLayout
    title="Acceptable use policy"
    lastUpdated="2026-06-08"
    version="1.0"
    currentSlug="/legal/acceptable-use"
  >
    <P>
      This Acceptable Use Policy supplements the <a href="/terms" className="text-kotoba-primary underline">Terms of Service</a> and applies to everyone who uses Kotobaseed. It is enforced under the Digital Services Act (Regulation (EU) 2022/2065).
    </P>

    <H2>1. Prohibited content</H2>
    <H3>Illegal content (always)</H3>
    <UL>
      <li><strong>Child sexual abuse material.</strong> Reported immediately to INHOPE and law enforcement.</li>
      <li><strong>Content promoting violence, terrorism, or hate</strong> against a person or group based on race, ethnicity, national origin, religion, sex, gender identity, sexual orientation, disability, or other protected characteristic</li>
      <li><strong>Content that infringes intellectual property</strong> — copyright, trademark, patent. DMCA-equivalent notices accepted at <a href="mailto:dmca@kotobaseed.net" className="text-kotoba-primary underline">dmca@kotobaseed.net</a>.</li>
      <li><strong>Counterfeit goods or services</strong>, including fake credentials or certifications</li>
      <li><strong>Stolen credentials or accounts</strong></li>
      <li><strong>Personal data of others</strong> posted without their consent — phone numbers, addresses, private images, financial records (doxing)</li>
      <li><strong>Sexually explicit content</strong> without robust age-verification (we don't currently support adult content)</li>
      <li><strong>Content that violates EU sanctions</strong></li>
    </UL>

    <H3>Disallowed on Kotobaseed even where not strictly illegal</H3>
    <UL>
      <li><strong>Solicitation to bypass the platform</strong> — directing students off-platform to avoid the platform fee</li>
      <li><strong>False reviews / fake testimonials</strong> — written by anyone other than a real student who actually had the lesson</li>
      <li><strong>Spam</strong> — unsolicited bulk messaging, repeated posting</li>
      <li><strong>Multi-level marketing or pyramid schemes</strong></li>
      <li><strong>Cryptocurrency or financial-product promotion</strong> that misleads or that you're not authorised to market</li>
      <li><strong>Selling regulated goods</strong> without proper authorisation</li>
    </UL>

    <H2>2. Prohibited conduct</H2>
    <UL>
      <li><strong>Harass, threaten, dox, or defame</strong> any person, including other users</li>
      <li><strong>Impersonate</strong> anyone or misrepresent your affiliation</li>
      <li><strong>Scrape, mine, or systematically extract content</strong> from the Service without our written consent — including AI training on tutor/student content</li>
      <li><strong>Probe or attack the security</strong> of the Service except via the responsible-disclosure channel at <a href="mailto:security@kotobaseed.net" className="text-kotoba-primary underline">security@kotobaseed.net</a></li>
      <li><strong>Bypass technical measures</strong> — paywalls, rate limits, CAPTCHAs, content gates, DRM</li>
      <li><strong>Use bots or automated tooling</strong> that affect other users (mass-messaging, mass-booking, mass-scraping)</li>
      <li><strong>Sell your account</strong> or transfer it to another person</li>
    </UL>

    <H2>3. Tutor-specific prohibitions</H2>
    <UL>
      <li><strong>No exclusivity demands</strong>: you may not require students to buy lessons only from you or only on Kotobaseed</li>
      <li><strong>No discrimination</strong>: you may not refuse a student based on protected characteristics. You may decline a booking for legitimate professional reasons (level mismatch, scheduling, communication breakdown).</li>
      <li><strong>No false credentialling</strong>: language certifications, teaching degrees, native-speaker claims must be honest</li>
      <li><strong>No off-platform demands</strong>: don't ask students to pay you outside Kotobaseed for lessons booked on Kotobaseed</li>
      <li><strong>No impersonating other tutors</strong> — name, voice, photo, style</li>
      <li><strong>No teaching material that infringes copyright</strong></li>
    </UL>

    <H2>4. Student-specific prohibitions</H2>
    <UL>
      <li>No verbal abuse or harassment of tutors</li>
      <li>No requesting illegal services (e.g. forged language-test answers)</li>
      <li>No payment fraud — using stolen cards, fraudulent chargebacks</li>
      <li>No misuse of the trial system — creating multiple accounts to claim multiple free trials with the same tutor</li>
    </UL>

    <H2>5. Reporting illegal content (DSA Article 16)</H2>
    <P>Anyone — user or non-user — can report content believed to be illegal:</P>
    <UL>
      <li><strong>Form</strong>: <a href="/legal/report-content" className="text-kotoba-primary underline">kotobaseed.net/legal/report-content</a></li>
      <li><strong>Email</strong>: <a href="mailto:report@kotobaseed.net" className="text-kotoba-primary underline">report@kotobaseed.net</a></li>
    </UL>
    <P>
      Reports should include the URL of the content, why you believe it's illegal (a specific legal basis if you know one), your contact email, and whether you act on your own behalf or represent a trusted flagger.
    </P>
    <P>
      We acknowledge reports promptly and act in good faith. For genuine illegal-content reports we aim to act within 24 hours; complex cases may take longer. We inform you of our decision and reasoning.
    </P>

    <H2>6. How we act on violations</H2>
    <P>Our response is proportionate to the violation:</P>
    <UL>
      <li><strong>First-time minor breach</strong>: warning + content edit request</li>
      <li><strong>Repeat or serious breach</strong>: temporary suspension with a clear statement of reasons (DSA Article 17)</li>
      <li><strong>Illegal content or fraud</strong>: immediate removal + account termination + (for illegal content) referral to authorities and preservation of evidence</li>
      <li><strong>Imminent danger</strong>: immediate suspension while investigated</li>
    </UL>

    <H2>7. Appeals (DSA Article 20)</H2>
    <P>
      If your content was removed or your account was suspended, you may appeal by emailing <a href="mailto:hello@kotobaseed.net" className="text-kotoba-primary underline">hello@kotobaseed.net</a>. We aim to review appeals within 14 days. Humans review every appeal — we don't use solely automated decision-making for content moderation.
    </P>

    <H2>8. Transparency reports</H2>
    <P>
      Once we cross DSA Article 24 thresholds we will publish annual transparency reports describing notice volumes, actions taken, complaints handled, and median response times. Until then we maintain this information internally and disclose to the relevant supervisory authority on request.
    </P>

    <H2>9. Changes</H2>
    <P>
      We may update this Policy. Material changes for business users (tutors) get 15 days' notice per the P2B Regulation. Material changes for everyone else are announced via banner + email at least 14 days before they take effect.
    </P>
  </LegalPageLayout>
);

export default AcceptableUse;
