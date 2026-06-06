import React from 'react';

const LanguageIntro = ({ content }) => {
  const title = content?.title?.trim() || 'About the language';
  const body = content?.body?.trim() || null;
  const imageUrl = content?.image_url?.trim() || null;
  if (!body && !imageUrl) return null;

  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 bg-white rounded-2xl shadow-sm mx-4 sm:mx-auto mb-8">
      <div className={`grid gap-8 items-center ${imageUrl ? 'lg:grid-cols-2' : ''}`}>
        <div>
          <h2 className="text-2xl font-bold text-kotoba-primary mb-3">{title}</h2>
          {body && (
            <p className="text-kotoba-text leading-relaxed whitespace-pre-line">{body}</p>
          )}
        </div>
        {imageUrl && (
          <img
            src={imageUrl}
            alt={title}
            className="w-full rounded-xl object-cover aspect-video"
          />
        )}
      </div>
    </section>
  );
};

export default LanguageIntro;
