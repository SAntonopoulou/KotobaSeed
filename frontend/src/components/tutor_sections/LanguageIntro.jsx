import React from 'react';

const LanguageIntro = ({ content }) => {
  const title = content?.title?.trim() || 'About the language';
  const body = content?.body?.trim() || null;
  const imageUrl = content?.image_url?.trim() || null;
  if (!body && !imageUrl) return null;

  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <div className="bg-white rounded-3xl shadow-soft p-8 sm:p-10">
        <div className={`grid gap-8 sm:gap-10 items-center ${imageUrl ? 'lg:grid-cols-2' : ''}`}>
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark">
              The language
            </p>
            <h2 className="mt-2 font-display text-3xl sm:text-4xl font-bold text-kotoba-primary leading-tight tracking-[-0.015em]">
              {title}
            </h2>
            {body && (
              <p className="mt-5 text-base sm:text-lg text-kotoba-text/80 leading-relaxed whitespace-pre-line">
                {body}
              </p>
            )}
          </div>
          {imageUrl && (
            <img
              src={imageUrl}
              alt={title}
              className="w-full rounded-3xl object-cover aspect-video shadow-soft"
            />
          )}
        </div>
      </div>
    </section>
  );
};

export default LanguageIntro;
