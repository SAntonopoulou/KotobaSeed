import React from 'react';

const LevelsAlphabet = ({ content }) => {
  const variant = content?.variant || 'cards';
  const title = content?.title?.trim() || 'Levels';
  const intro = content?.body?.trim() || null;
  const levels = Array.isArray(content?.levels) ? content.levels : [];
  if (levels.length === 0 && !intro) return null;

  if (variant === 'table') {
    return (
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 bg-white rounded-2xl shadow-sm mx-4 sm:mx-auto mb-8">
        <h2 className="text-2xl font-bold text-kotoba-primary mb-3">{title}</h2>
        {intro && (
          <p className="text-kotoba-text leading-relaxed whitespace-pre-line mb-5">{intro}</p>
        )}
        {levels.length > 0 && (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-kotoba-text/10">
              {levels.map((level, idx) => (
                <tr key={idx}>
                  {level.label && (
                    <td className="py-3 pr-4 font-mono text-kotoba-primary font-semibold whitespace-nowrap align-top">
                      {level.label}
                    </td>
                  )}
                  <td className="py-3 align-top">
                    {level.title && (
                      <p className="font-semibold text-kotoba-text">{level.title}</p>
                    )}
                    {level.body && (
                      <p className="mt-1 text-kotoba-text/80 whitespace-pre-line">{level.body}</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    );
  }

  if (variant === 'pills') {
    return (
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 bg-white rounded-2xl shadow-sm mx-4 sm:mx-auto mb-8 text-center">
        <h2 className="text-2xl font-bold text-kotoba-primary mb-3">{title}</h2>
        {intro && (
          <p className="text-kotoba-text leading-relaxed whitespace-pre-line mb-5">{intro}</p>
        )}
        <div className="flex flex-wrap gap-3 justify-center">
          {levels.map((level, idx) => (
            <div
              key={idx}
              className="px-4 py-2 rounded-full bg-kotoba-secondary/30 text-kotoba-text"
              title={level.body || ''}
            >
              <span className="font-semibold text-kotoba-primary">{level.label}</span>
              {level.title && <span className="ml-2">{level.title}</span>}
            </div>
          ))}
        </div>
      </section>
    );
  }

  // cards (default)
  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 bg-white rounded-2xl shadow-sm mx-4 sm:mx-auto mb-8">
      <h2 className="text-2xl font-bold text-kotoba-primary mb-3">{title}</h2>
      {intro && (
        <p className="text-kotoba-text leading-relaxed whitespace-pre-line mb-5">{intro}</p>
      )}
      {levels.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {levels.map((level, idx) => (
            <div
              key={idx}
              className="border border-kotoba-text/10 rounded-xl p-4 bg-kotoba-background/30"
            >
              {level.label && (
                <p className="text-xs uppercase tracking-wider text-kotoba-text/60">
                  {level.label}
                </p>
              )}
              {level.title && (
                <h3 className="text-lg font-semibold text-kotoba-primary mt-1">
                  {level.title}
                </h3>
              )}
              {level.body && (
                <p className="mt-2 text-sm text-kotoba-text leading-relaxed whitespace-pre-line">
                  {level.body}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default LevelsAlphabet;
