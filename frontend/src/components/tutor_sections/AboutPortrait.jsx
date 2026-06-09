import React from 'react';

const SectionEyebrow = ({ children }) => (
  <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark">
    {children}
  </p>
);

const AboutPortrait = ({ tutor, content }) => {
  const variant = content?.variant || 'simple';
  const title = content?.title?.trim() || 'About';
  const body = content?.body?.trim() || tutor.bio || 'Bio coming soon.';

  if (variant === 'with_photo') {
    return (
      <section
        id="about"
        className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16"
      >
        <div className="bg-white rounded-3xl shadow-soft p-8 sm:p-10">
          <div className="grid lg:grid-cols-[1fr_auto] gap-8 sm:gap-10 items-start">
            <div>
              <SectionEyebrow>About</SectionEyebrow>
              <h2 className="mt-2 font-display text-3xl sm:text-4xl font-bold text-kotoba-primary leading-tight tracking-[-0.015em]">
                {title}
              </h2>
              <p className="mt-5 text-base sm:text-lg text-kotoba-text/80 whitespace-pre-line leading-relaxed">
                {body}
              </p>
            </div>
            {tutor.photo_url && (
              <img
                src={tutor.photo_url}
                alt={tutor.display_name}
                className="w-48 h-48 sm:w-56 sm:h-56 rounded-3xl shadow-soft-lg object-cover order-first lg:order-last"
              />
            )}
          </div>
        </div>
      </section>
    );
  }

  if (variant === 'quote_style') {
    const sentences = body.split(/(?<=[.!?])\s+/);
    const pullQuote = sentences[0];
    const rest = sentences.slice(1).join(' ');
    return (
      <section
        id="about"
        className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16"
      >
        <div className="bg-white rounded-3xl shadow-soft p-8 sm:p-12 text-center">
          <SectionEyebrow>About</SectionEyebrow>
          <h2 className="mt-2 font-display text-3xl sm:text-4xl font-bold text-kotoba-primary leading-tight tracking-[-0.015em]">
            {title}
          </h2>
          <blockquote className="mt-8 font-display text-2xl sm:text-3xl text-kotoba-text leading-relaxed italic">
            <span aria-hidden="true" className="text-kotoba-secondary-dark">“</span>
            {pullQuote}
            <span aria-hidden="true" className="text-kotoba-secondary-dark">”</span>
          </blockquote>
          {rest && (
            <p className="mt-6 text-base text-kotoba-text/80 leading-relaxed whitespace-pre-line">
              {rest}
            </p>
          )}
        </div>
      </section>
    );
  }

  return (
    <section
      id="about"
      className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16"
    >
      <div className="bg-white rounded-3xl shadow-soft p-8 sm:p-10">
        <SectionEyebrow>About</SectionEyebrow>
        <h2 className="mt-2 font-display text-3xl sm:text-4xl font-bold text-kotoba-primary leading-tight tracking-[-0.015em]">
          {title}
        </h2>
        <p className="mt-5 text-base sm:text-lg text-kotoba-text/80 whitespace-pre-line leading-relaxed">
          {body}
        </p>
      </div>
    </section>
  );
};

export default AboutPortrait;
