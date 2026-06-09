import React from 'react';

const SectionEyebrow = ({ children, center = false }) => (
  <p
    className={
      'text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark ' +
      (center ? 'text-center' : '')
    }
  >
    {children}
  </p>
);

const FeaturesGrid = ({ content }) => {
  const variant = content?.variant || 'cards';
  const title = content?.title?.trim() || 'What you get';
  const items = Array.isArray(content?.items) ? content.items : [];
  if (items.length === 0) return null;

  if (variant === 'numbered_list') {
    return (
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="bg-white rounded-3xl shadow-soft p-8 sm:p-10">
          <SectionEyebrow>What you get</SectionEyebrow>
          <h2 className="mt-2 font-display text-3xl sm:text-4xl font-bold text-kotoba-primary leading-tight tracking-[-0.015em] mb-8">
            {title}
          </h2>
          <ol className="space-y-7">
            {items.map((item, idx) => (
              <li key={idx} className="flex gap-5">
                <span className="flex-shrink-0 w-11 h-11 rounded-2xl bg-kotoba-primary/10 text-kotoba-primary font-display font-bold flex items-center justify-center tabular-nums">
                  {String(idx + 1).padStart(2, '0')}
                </span>
                <div className="flex-1 min-w-0 pt-1">
                  {item.title && (
                    <h3 className="font-display text-lg font-bold text-kotoba-primary leading-tight">
                      {item.title}
                    </h3>
                  )}
                  {item.body && (
                    <p className="mt-2 text-kotoba-text/80 leading-relaxed whitespace-pre-line">
                      {item.body}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>
    );
  }

  if (variant === 'icon_row') {
    return (
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="bg-white rounded-3xl shadow-soft p-8 sm:p-10">
          <div className="text-center mb-10">
            <SectionEyebrow center>What you get</SectionEyebrow>
            <h2 className="mt-2 font-display text-3xl sm:text-4xl font-bold text-kotoba-primary leading-tight tracking-[-0.015em]">
              {title}
            </h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-8">
            {items.map((item, idx) => (
              <div key={idx} className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-kotoba-secondary/30 mx-auto mb-4 flex items-center justify-center text-kotoba-primary font-display text-2xl font-bold">
                  {item.icon || '•'}
                </div>
                {item.title && (
                  <h3 className="font-display text-lg font-bold text-kotoba-primary leading-tight">
                    {item.title}
                  </h3>
                )}
                {item.body && (
                  <p className="mt-2 text-sm text-kotoba-text/80 leading-relaxed whitespace-pre-line">
                    {item.body}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <div className="bg-white rounded-3xl shadow-soft p-8 sm:p-10">
        <SectionEyebrow>What you get</SectionEyebrow>
        <h2 className="mt-2 font-display text-3xl sm:text-4xl font-bold text-kotoba-primary leading-tight tracking-[-0.015em] mb-8">
          {title}
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item, idx) => (
            <div
              key={idx}
              className="group rounded-2xl p-5 bg-kotoba-background/40 border border-kotoba-text/[0.06] hover:border-kotoba-primary/20 hover:-translate-y-1 hover:shadow-soft transition-all duration-500 ease-soft"
            >
              {item.title && (
                <h3 className="font-display text-lg font-bold text-kotoba-primary leading-tight">
                  {item.title}
                </h3>
              )}
              {item.body && (
                <p className="mt-2 text-sm text-kotoba-text/80 leading-relaxed whitespace-pre-line">
                  {item.body}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesGrid;
