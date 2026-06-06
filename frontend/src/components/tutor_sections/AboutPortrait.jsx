import React from 'react';

const AboutPortrait = ({ tutor, content }) => {
  const variant = content?.variant || 'simple';
  const title = content?.title?.trim() || 'About';
  const body = content?.body?.trim() || tutor.bio || 'Bio coming soon.';

  if (variant === 'with_photo') {
    return (
      <section
        id="about"
        className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 bg-white rounded-2xl shadow-sm mx-4 sm:mx-auto mt-8 mb-8"
      >
        <div className="grid lg:grid-cols-[1fr_auto] gap-8 items-start">
          <div>
            <h2 className="text-2xl font-bold text-kotoba-primary mb-3">{title}</h2>
            <p className="text-kotoba-text whitespace-pre-line leading-relaxed">{body}</p>
          </div>
          {tutor.photo_url && (
            <img
              src={tutor.photo_url}
              alt={tutor.display_name}
              className="w-48 h-48 rounded-2xl shadow-md object-cover order-first lg:order-last"
            />
          )}
        </div>
      </section>
    );
  }

  if (variant === 'quote_style') {
    // Pull-quote treatment — first sentence is bigger, rest of body below.
    const sentences = body.split(/(?<=[.!?])\s+/);
    const pullQuote = sentences[0];
    const rest = sentences.slice(1).join(' ');
    return (
      <section
        id="about"
        className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 bg-white rounded-2xl shadow-sm mx-4 sm:mx-auto mt-8 mb-8"
      >
        <h2 className="text-2xl font-bold text-kotoba-primary mb-6 text-center">{title}</h2>
        <blockquote className="text-2xl text-kotoba-text leading-relaxed text-center font-light italic border-l-4 border-kotoba-secondary pl-6">
          "{pullQuote}"
        </blockquote>
        {rest && (
          <p className="mt-6 text-kotoba-text leading-relaxed whitespace-pre-line">{rest}</p>
        )}
      </section>
    );
  }

  // simple (default)
  return (
    <section
      id="about"
      className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 bg-white rounded-2xl shadow-sm mx-4 sm:mx-auto mt-8 mb-8"
    >
      <h2 className="text-2xl font-bold text-kotoba-primary mb-3">{title}</h2>
      <p className="text-kotoba-text whitespace-pre-line leading-relaxed">{body}</p>
    </section>
  );
};

export default AboutPortrait;
