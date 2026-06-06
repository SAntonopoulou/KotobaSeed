import React, { useState } from 'react';

const FaqAccordion = ({ content }) => {
  const variant = content?.variant || 'accordion';
  const title = content?.title?.trim() || 'Frequently asked';
  const items = Array.isArray(content?.items) ? content.items : [];
  const [openIdx, setOpenIdx] = useState(null);
  if (items.length === 0) return null;

  if (variant === 'inline') {
    return (
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 bg-white rounded-2xl shadow-sm mx-4 sm:mx-auto mb-8">
        <h2 className="text-2xl font-bold text-kotoba-primary mb-5">{title}</h2>
        <div className="space-y-6">
          {items.map((item, idx) => (
            <div key={idx}>
              <p className="font-semibold text-kotoba-primary mb-1">{item.q}</p>
              {item.a && (
                <p className="text-kotoba-text leading-relaxed whitespace-pre-line">{item.a}</p>
              )}
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (variant === 'two_column') {
    // Q + A side-by-side, no expand/collapse.
    return (
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 bg-white rounded-2xl shadow-sm mx-4 sm:mx-auto mb-8">
        <h2 className="text-2xl font-bold text-kotoba-primary mb-5">{title}</h2>
        <div className="divide-y divide-kotoba-text/10">
          {items.map((item, idx) => (
            <div key={idx} className="grid sm:grid-cols-[1fr_2fr] gap-4 py-4">
              <p className="font-semibold text-kotoba-primary">{item.q}</p>
              {item.a && (
                <p className="text-kotoba-text leading-relaxed whitespace-pre-line">{item.a}</p>
              )}
            </div>
          ))}
        </div>
      </section>
    );
  }

  // accordion (default)
  return (
    <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 bg-white rounded-2xl shadow-sm mx-4 sm:mx-auto mb-8">
      <h2 className="text-2xl font-bold text-kotoba-primary mb-5">{title}</h2>
      <div className="divide-y divide-kotoba-text/10 border-y border-kotoba-text/10">
        {items.map((item, idx) => {
          const isOpen = openIdx === idx;
          return (
            <div key={idx}>
              <button
                type="button"
                onClick={() => setOpenIdx(isOpen ? null : idx)}
                className="w-full text-left py-3 flex items-center justify-between gap-3 hover:text-kotoba-primary"
                aria-expanded={isOpen}
              >
                <span className="font-medium text-kotoba-text">{item.q}</span>
                <span className="text-kotoba-text/40 text-lg flex-shrink-0">
                  {isOpen ? '−' : '+'}
                </span>
              </button>
              {isOpen && item.a && (
                <p className="pb-4 text-kotoba-text leading-relaxed whitespace-pre-line">
                  {item.a}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default FaqAccordion;
