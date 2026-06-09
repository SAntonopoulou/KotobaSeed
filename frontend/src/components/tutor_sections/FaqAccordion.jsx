import React, { useState } from 'react';

const SectionEyebrow = ({ children }) => (
  <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark">
    {children}
  </p>
);

const FaqAccordion = ({ content }) => {
  const variant = content?.variant || 'accordion';
  const title = content?.title?.trim() || 'Frequently asked';
  const items = Array.isArray(content?.items) ? content.items : [];
  const [openIdx, setOpenIdx] = useState(null);
  if (items.length === 0) return null;

  if (variant === 'inline') {
    return (
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="bg-white rounded-3xl shadow-soft p-8 sm:p-10">
          <SectionEyebrow>FAQ</SectionEyebrow>
          <h2 className="mt-2 font-display text-3xl sm:text-4xl font-bold text-kotoba-primary leading-tight tracking-[-0.015em] mb-7">
            {title}
          </h2>
          <div className="space-y-7">
            {items.map((item, idx) => (
              <div key={idx}>
                <p className="font-display font-bold text-lg text-kotoba-primary leading-tight">{item.q}</p>
                {item.a && (
                  <p className="mt-2 text-kotoba-text/80 leading-relaxed whitespace-pre-line">{item.a}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (variant === 'two_column') {
    return (
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="bg-white rounded-3xl shadow-soft p-8 sm:p-10">
          <SectionEyebrow>FAQ</SectionEyebrow>
          <h2 className="mt-2 font-display text-3xl sm:text-4xl font-bold text-kotoba-primary leading-tight tracking-[-0.015em] mb-7">
            {title}
          </h2>
          <div className="divide-y divide-kotoba-text/[0.06]">
            {items.map((item, idx) => (
              <div key={idx} className="grid sm:grid-cols-[1fr_2fr] gap-5 py-5">
                <p className="font-display font-bold text-kotoba-primary leading-snug">{item.q}</p>
                {item.a && (
                  <p className="text-kotoba-text/80 leading-relaxed whitespace-pre-line">{item.a}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <div className="bg-white rounded-3xl shadow-soft p-8 sm:p-10">
        <SectionEyebrow>FAQ</SectionEyebrow>
        <h2 className="mt-2 font-display text-3xl sm:text-4xl font-bold text-kotoba-primary leading-tight tracking-[-0.015em] mb-6">
          {title}
        </h2>
        <div className="divide-y divide-kotoba-text/[0.06] border-y border-kotoba-text/[0.06]">
          {items.map((item, idx) => {
            const isOpen = openIdx === idx;
            return (
              <div key={idx}>
                <button
                  type="button"
                  onClick={() => setOpenIdx(isOpen ? null : idx)}
                  className="w-full text-left py-4 flex items-center justify-between gap-3 group"
                  aria-expanded={isOpen}
                >
                  <span className="font-medium text-kotoba-text group-hover:text-kotoba-primary transition-colors">
                    {item.q}
                  </span>
                  <span
                    className={
                      'flex-shrink-0 w-7 h-7 rounded-full bg-kotoba-primary/10 text-kotoba-primary flex items-center justify-center text-lg transition-transform duration-300 ease-soft ' +
                      (isOpen ? 'rotate-45' : '')
                    }
                  >
                    +
                  </span>
                </button>
                {isOpen && item.a && (
                  <p className="pb-4 -mt-1 text-kotoba-text/80 leading-relaxed whitespace-pre-line">
                    {item.a}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default FaqAccordion;
