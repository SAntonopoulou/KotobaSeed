import React from 'react';

const FeaturesGrid = ({ content }) => {
  const variant = content?.variant || 'cards';
  const title = content?.title?.trim() || 'What you get';
  const items = Array.isArray(content?.items) ? content.items : [];
  if (items.length === 0) return null;

  if (variant === 'numbered_list') {
    return (
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 bg-white rounded-2xl shadow-sm mx-4 sm:mx-auto mb-8">
        <h2 className="text-2xl font-bold text-kotoba-primary mb-6">{title}</h2>
        <ol className="space-y-6">
          {items.map((item, idx) => (
            <li key={idx} className="flex gap-4">
              <span className="flex-shrink-0 w-10 h-10 rounded-full bg-kotoba-primary text-white font-bold flex items-center justify-center">
                {idx + 1}
              </span>
              <div>
                {item.title && (
                  <h3 className="text-lg font-semibold text-kotoba-primary">{item.title}</h3>
                )}
                {item.body && (
                  <p className="mt-1 text-kotoba-text leading-relaxed whitespace-pre-line">
                    {item.body}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>
    );
  }

  if (variant === 'icon_row') {
    return (
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 bg-white rounded-2xl shadow-sm mx-4 sm:mx-auto mb-8">
        <h2 className="text-2xl font-bold text-kotoba-primary mb-6 text-center">{title}</h2>
        <div className="grid sm:grid-cols-3 gap-8">
          {items.map((item, idx) => (
            <div key={idx} className="text-center">
              <div className="w-12 h-12 rounded-full bg-kotoba-secondary/30 mx-auto mb-3 flex items-center justify-center text-kotoba-primary text-2xl font-bold">
                {item.icon || '•'}
              </div>
              {item.title && (
                <h3 className="text-lg font-semibold text-kotoba-primary">{item.title}</h3>
              )}
              {item.body && (
                <p className="mt-2 text-sm text-kotoba-text leading-relaxed whitespace-pre-line">
                  {item.body}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>
    );
  }

  // cards (default)
  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 bg-white rounded-2xl shadow-sm mx-4 sm:mx-auto mb-8">
      <h2 className="text-2xl font-bold text-kotoba-primary mb-6">{title}</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {items.map((item, idx) => (
          <div
            key={idx}
            className="border border-kotoba-text/10 rounded-xl p-5 bg-kotoba-background/30"
          >
            {item.title && (
              <h3 className="text-lg font-semibold text-kotoba-primary">{item.title}</h3>
            )}
            {item.body && (
              <p className="mt-2 text-kotoba-text leading-relaxed whitespace-pre-line">
                {item.body}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
};

export default FeaturesGrid;
