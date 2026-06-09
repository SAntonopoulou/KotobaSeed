import React from 'react';
import { FaCalendarDay, FaHeart, FaLeaf, FaEnvelopeOpen, FaCat } from 'react-icons/fa6';
import { PostageStamp, HandDrawnUnderline } from '../Motifs';

// Features — Postcard Stack (v2).
// Mary-only. Three dramatically tilted postcards (-3.2deg / +1.6deg /
// -1.4deg) with perforated postage-stamp badges in the upper-right. On
// hover the postcards rotate to flat and lift, like a reader picking
// them up.

export const contentSchema = {
  eyebrow: { type: 'text', max: 80 },
  title_pre: { type: 'text', max: 120 },
  title_serif: { type: 'text', max: 120, hint: 'Italic blush phrase rendered as <em>.' },
  sub: { type: 'long-text', max: 400 },
  steps: {
    type: 'list',
    of: {
      n: { type: 'text', max: 4 },
      icon: { type: 'text', max: 32 },
      title: { type: 'text', max: 80 },
      desc: { type: 'long-text', max: 400 },
    },
    min: 3,
    max: 3,
  },
};

const ICONS = {
  calendar: FaCalendarDay,
  heart: FaHeart,
  leaf: FaLeaf,
  envelope: FaEnvelopeOpen,
  cat: FaCat,
};

const FeaturesPostcardStack = ({ content = {} }) => {
  const eyebrow = content.eyebrow;
  const titlePre = content.title_pre;
  const titleSerif = content.title_serif;
  const sub = content.sub;
  const steps = Array.isArray(content.steps) ? content.steps : [];

  if (steps.length === 0) return null;

  return (
    <section className="m-section m-feat" id="how">
      <div className="m-wrap">
        <div className="m-feat-head">
          {eyebrow && (
            <span className="m-eyebrow">
              {eyebrow}
              <HandDrawnUnderline className="m-underline" width={140} />
            </span>
          )}
          <h2 className="m-title">
            {titlePre}
            {titlePre && titleSerif && ' '}
            {titleSerif && <em>{titleSerif}</em>}
          </h2>
          {sub && <p className="m-sub m-sub-center">{sub}</p>}
        </div>
        <div className="m-feat-cards">
          {steps.map((step, idx) => {
            const Icon = ICONS[step.icon] || FaHeart;
            return (
              <article key={idx} className="m-feat-card">
                <div className="m-feat-stamp">
                  <PostageStamp label={step.n || String(idx + 1).padStart(2, '0')} size={72} />
                </div>
                <div className="m-feat-icon">
                  <Icon size={28} />
                </div>
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default FeaturesPostcardStack;
