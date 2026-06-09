import React from 'react';
import NewsletterSignupCard from '../NewsletterSignupCard';

// Tutor-placeable newsletter signup. Renders the public-CTA card the
// tutor configured under Dashboard → Content → Newsletter. Designed
// to be added to the page in any position via the page builder.
//
// `content` may carry an inline title/description override; if the
// tutor leaves those blank we fall back to what the underlying card
// component pulls from /public/tutors/{slug}/newsletter-prefs.

const NewsletterSignup = ({ tutor, content = {} }) => {
  if (!tutor?.tutor_slug) return null;
  const wrapperClass = content.wrapper_class || 'max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12';
  return (
    <section className={wrapperClass}>
      <NewsletterSignupCard tutorSlug={tutor.tutor_slug} />
    </section>
  );
};

export default NewsletterSignup;
