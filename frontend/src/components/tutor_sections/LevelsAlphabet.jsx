import React from 'react';

const SectionEyebrow = ({ children }) => (
  <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark">
    {children}
  </p>
);

const LevelsAlphabet = ({ content }) => {
  const variant = content?.variant || 'cards';
  const title = content?.title?.trim() || 'Levels';
  const intro = content?.body?.trim() || null;
  const levels = Array.isArray(content?.levels) ? content.levels : [];
  if (levels.length === 0 && !intro) return null;

  if (variant === 'table') {
    return (
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="bg-white rounded-3xl shadow-soft p-8 sm:p-10">
          <SectionEyebrow>Levels</SectionEyebrow>
          <h2 className="mt-2 font-display text-3xl sm:text-4xl font-bold text-kotoba-primary leading-tight tracking-[-0.015em]">
            {title}
          </h2>
          {intro && (
            <p className="mt-4 text-kotoba-text/80 leading-relaxed whitespace-pre-line">{intro}</p>
          )}
          {levels.length > 0 && (
            <table className="mt-7 w-full text-sm">
              <tbody className="divide-y divide-kotoba-text/[0.06]">
                {levels.map((level, idx) => (
                  <tr key={idx}>
                    {level.label && (
                      <td className="py-4 pr-5 font-mono text-kotoba-primary font-bold whitespace-nowrap align-top text-base tracking-wider">
                        {level.label}
                      </td>
                    )}
                    <td className="py-4 align-top">
                      {level.title && (
                        <p className="font-display font-bold text-base text-kotoba-text">
                          {level.title}
                        </p>
                      )}
                      {level.body && (
                        <p className="mt-1.5 text-kotoba-text/75 whitespace-pre-line leading-relaxed">
                          {level.body}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    );
  }

  if (variant === 'pills') {
    return (
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="bg-white rounded-3xl shadow-soft p-8 sm:p-10 text-center">
          <SectionEyebrow>Levels</SectionEyebrow>
          <h2 className="mt-2 font-display text-3xl sm:text-4xl font-bold text-kotoba-primary leading-tight tracking-[-0.015em]">
            {title}
          </h2>
          {intro && (
            <p className="mt-4 text-kotoba-text/80 leading-relaxed whitespace-pre-line max-w-xl mx-auto">
              {intro}
            </p>
          )}
          <div className="mt-7 flex flex-wrap gap-2.5 justify-center">
            {levels.map((level, idx) => (
              <div
                key={idx}
                className="px-4 py-2 rounded-full bg-kotoba-secondary/30 text-kotoba-text border border-kotoba-secondary/40 hover:border-kotoba-secondary transition-colors"
                title={level.body || ''}
              >
                <span className="font-mono font-bold text-kotoba-primary tracking-wider">
                  {level.label}
                </span>
                {level.title && (
                  <span className="ml-2 font-display">{level.title}</span>
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
        <SectionEyebrow>Levels</SectionEyebrow>
        <h2 className="mt-2 font-display text-3xl sm:text-4xl font-bold text-kotoba-primary leading-tight tracking-[-0.015em]">
          {title}
        </h2>
        {intro && (
          <p className="mt-4 text-kotoba-text/80 leading-relaxed whitespace-pre-line max-w-2xl">
            {intro}
          </p>
        )}
        {levels.length > 0 && (
          <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {levels.map((level, idx) => (
              <div
                key={idx}
                className="rounded-2xl p-5 bg-kotoba-background/40 border border-kotoba-text/[0.06] hover:border-kotoba-primary/20 hover:-translate-y-1 hover:shadow-soft transition-all duration-500 ease-soft"
              >
                {level.label && (
                  <p className="font-mono font-bold text-xs uppercase tracking-[0.18em] text-kotoba-primary/70">
                    {level.label}
                  </p>
                )}
                {level.title && (
                  <h3 className="font-display text-lg font-bold text-kotoba-primary mt-1.5 leading-tight">
                    {level.title}
                  </h3>
                )}
                {level.body && (
                  <p className="mt-2 text-sm text-kotoba-text/80 leading-relaxed whitespace-pre-line">
                    {level.body}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default LevelsAlphabet;
