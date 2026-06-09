import React from 'react';
import {
  FaRegCalendarCheck,
  FaRegHeart,
  FaWandMagicSparkles,
} from 'react-icons/fa6';

// Three-step "how it works" card row. Each card has a numbered badge,
// an icon, a title + body.
//
// Props:
//   content — { eyebrow, title, sub, steps[] }
//             each step: { n, icon, title, desc }
//   The icon field is a string key from ICON_REGISTRY below; the
//   admin form picks one from a curated list so designers can swap
//   without filing a code change.

const ICON_REGISTRY = {
  calendar_check: FaRegCalendarCheck,
  heart: FaRegHeart,
  sparkles: FaWandMagicSparkles,
};

export const contentSchema = {
  eyebrow: { type: 'text', max: 50, default: 'How it works' },
  title_pre: { type: 'text', max: 80, required: true },
  title_gr: { type: 'text', max: 30 },
  sub: { type: 'long-text', max: 300 },
  steps: {
    type: 'list',
    required: true,
    item: {
      n: { type: 'text', max: 6 },
      icon: { type: 'enum', values: Object.keys(ICON_REGISTRY), default: 'calendar_check' },
      title: { type: 'text', max: 80, required: true },
      desc: { type: 'long-text', max: 280 },
    },
  },
};

const getValue = (content, key) => {
  if (content && content[key] != null) return content[key];
  return contentSchema[key]?.default;
};

const Icon = ({ name, size = 26 }) => {
  const Comp = ICON_REGISTRY[name] || ICON_REGISTRY.sparkles;
  return <Comp size={size} />;
};

const FeaturesNumberedCards = ({ content = {} }) => {
  const steps = getValue(content, 'steps') || [];
  const titlePre = getValue(content, 'title_pre');
  if (!titlePre || steps.length === 0) return null;

  return (
    <section id="how" className="v-section">
      <div className="wrap">
        <div className="sec-head">
          <span className="eyebrow">{getValue(content, 'eyebrow')}</span>
          <h2>
            {titlePre}
            {getValue(content, 'title_gr') && (
              <span className="gr">{getValue(content, 'title_gr')}</span>
            )}
          </h2>
          {getValue(content, 'sub') && <p>{getValue(content, 'sub')}</p>}
        </div>
        <div className="feat">
          {steps.map((s, i) => (
            <div className="card" key={s.n || i}>
              <div className="ico">
                <Icon name={s.icon} />
              </div>
              <div className="step">STEP {s.n}</div>
              <h3 style={{ marginTop: 6 }}>{s.title}</h3>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesNumberedCards;
