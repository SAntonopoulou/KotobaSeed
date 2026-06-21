import React from 'react';
import { SECTION_VARIANTS } from '../tutor_sections';
import SchemaForm from '../SchemaForm';
import RichTextInput from './RichTextInput';

// Inline editors per section_type. Each one renders form fields and
// calls onChange with the next content object. Kept inline so the
// PageBuilder list stays readable and we don't add a route per type.

// Shared at the top of every editor: the style picker. We expose only the
// variants registered in SECTION_VARIANTS — pricing/video/language_intro
// just don't show a picker.
const VariantPicker = ({ sectionType, content, onChange }) => {
  const variants = SECTION_VARIANTS[sectionType];
  if (!variants || variants.length <= 1) return null;
  const value = content?.variant || variants[0].value;
  return (
    <div>
      <label className="block text-xs font-medium text-kotoba-text/70 mb-1">
        Layout style
      </label>
      <select
        value={value}
        onChange={(e) => onChange({ ...content, variant: e.target.value })}
        className="w-full px-3 py-2 border border-kotoba-text/20 rounded text-sm focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
      >
        {variants.map((v) => (
          <option key={v.value} value={v.value}>
            {v.label}
          </option>
        ))}
      </select>
    </div>
  );
};

const inputCls =
  'w-full px-3 py-2 border border-kotoba-text/20 rounded text-sm focus:outline-none focus:ring-2 focus:ring-kotoba-primary';
const labelCls = 'block text-xs font-medium text-kotoba-text/70 mb-1';

const TextField = ({ label, value, onChange, placeholder }) => (
  <div>
    <label className={labelCls}>{label}</label>
    <input
      type="text"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={inputCls}
    />
  </div>
);

const TextArea = ({ label, value, onChange, rows = 3, placeholder }) => (
  <div>
    <label className={labelCls}>{label}</label>
    <textarea
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      className={inputCls}
    />
  </div>
);

const ListEditor = ({ label, items, onChange, fields, addLabel = '+ Add', emptyLabel }) => {
  const setItem = (idx, patch) => {
    const next = items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    onChange(next);
  };
  const removeItem = (idx) => onChange(items.filter((_, i) => i !== idx));
  const addItem = () => onChange([...items, Object.fromEntries(fields.map((f) => [f.key, '']))]);
  const move = (idx, delta) => {
    const next = idx + delta;
    if (next < 0 || next >= items.length) return;
    const copy = [...items];
    [copy[idx], copy[next]] = [copy[next], copy[idx]];
    onChange(copy);
  };
  return (
    <div>
      <p className="text-xs font-medium text-kotoba-text/70 mb-2">{label}</p>
      <div className="space-y-2">
        {items.length === 0 && (
          <p className="text-xs text-kotoba-text/50 italic">{emptyLabel || 'Empty.'}</p>
        )}
        {items.map((item, idx) => (
          <div key={idx} className="border border-kotoba-text/10 rounded p-2 space-y-2">
            {fields.map((f) =>
              f.type === 'textarea' ? (
                <TextArea
                  key={f.key}
                  label={f.label}
                  value={item[f.key]}
                  onChange={(v) => setItem(idx, { [f.key]: v })}
                  rows={f.rows || 2}
                  placeholder={f.placeholder}
                />
              ) : (
                <TextField
                  key={f.key}
                  label={f.label}
                  value={item[f.key]}
                  onChange={(v) => setItem(idx, { [f.key]: v })}
                  placeholder={f.placeholder}
                />
              )
            )}
            <div className="flex items-center justify-end gap-1 text-xs">
              <button
                type="button"
                onClick={() => move(idx, -1)}
                disabled={idx === 0}
                className="px-2 py-0.5 text-kotoba-text/60 hover:text-kotoba-primary disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(idx, 1)}
                disabled={idx === items.length - 1}
                className="px-2 py-0.5 text-kotoba-text/60 hover:text-kotoba-primary disabled:opacity-30"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => removeItem(idx)}
                className="px-2 py-0.5 text-red-600 hover:underline"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addItem}
        className="mt-2 px-3 py-1 text-xs rounded border border-kotoba-primary/40 text-kotoba-primary hover:bg-kotoba-primary/5"
      >
        {addLabel}
      </button>
    </div>
  );
};

const EDITORS = {
  hero_portrait: ({ content, onChange }) => (
    <div className="space-y-3">
      <TextField
        label="Headline"
        value={content.headline}
        onChange={(v) => onChange({ ...content, headline: v })}
        placeholder="Defaults to your display name"
      />
      <TextField
        label="Subhead"
        value={content.subhead}
        onChange={(v) => onChange({ ...content, subhead: v })}
        placeholder="Defaults to your languages list"
      />
      <RichTextInput
        label="Bio override"
        value={content.bio_override}
        onChange={(v) => onChange({ ...content, bio_override: v })}
        placeholder="Leave blank to use your profile bio"
        minHeight="6rem"
      />
      <div className="grid grid-cols-2 gap-2">
        <TextField
          label="Button label"
          value={content.cta_label}
          onChange={(v) => onChange({ ...content, cta_label: v })}
          placeholder="Book a lesson"
        />
        <TextField
          label="Button link"
          value={content.cta_anchor}
          onChange={(v) => onChange({ ...content, cta_anchor: v })}
          placeholder="#book"
        />
      </div>
    </div>
  ),
  about_portrait: ({ content, onChange }) => (
    <div className="space-y-3">
      <TextField
        label="Title"
        value={content.title}
        onChange={(v) => onChange({ ...content, title: v })}
        placeholder="About"
      />
      <RichTextInput
        label="Body"
        value={content.body}
        onChange={(v) => onChange({ ...content, body: v })}
        placeholder="Leave blank to use your profile bio"
        minHeight="8rem"
      />
    </div>
  ),
  features_grid: ({ content, onChange }) => (
    <div className="space-y-3">
      <TextField
        label="Title"
        value={content.title}
        onChange={(v) => onChange({ ...content, title: v })}
        placeholder="What you get"
      />
      <ListEditor
        label="Features"
        items={Array.isArray(content.items) ? content.items : []}
        onChange={(items) => onChange({ ...content, items })}
        fields={[
          { key: 'title', label: 'Title' },
          { key: 'body', label: 'Description', type: 'textarea' },
        ]}
        addLabel="+ Add feature"
      />
    </div>
  ),
  levels_alphabet: ({ content, onChange }) => (
    <div className="space-y-3">
      <TextField
        label="Title"
        value={content.title}
        onChange={(v) => onChange({ ...content, title: v })}
        placeholder="Levels"
      />
      <RichTextInput
        label="Intro"
        value={content.body}
        onChange={(v) => onChange({ ...content, body: v })}
        minHeight="6rem"
      />
      <ListEditor
        label="Levels"
        items={Array.isArray(content.levels) ? content.levels : []}
        onChange={(levels) => onChange({ ...content, levels })}
        fields={[
          { key: 'label', label: 'Tag (e.g. A1)' },
          { key: 'title', label: 'Title' },
          { key: 'body', label: 'Description', type: 'textarea' },
        ]}
        addLabel="+ Add level"
      />
    </div>
  ),
  pricing_grid: ({ content, onChange }) => (
    <div className="space-y-3">
      <TextField
        label="Title"
        value={content.title}
        onChange={(v) => onChange({ ...content, title: v })}
        placeholder="Book a lesson"
      />
      <p className="text-xs text-kotoba-text/60">
        The lessons and packs themselves come from your "Lesson packs" panel. This section just renders them.
      </p>
    </div>
  ),
  reviews_grid: ({ content, onChange }) => (
    <div className="space-y-3">
      <TextField
        label="Title"
        value={content.title}
        onChange={(v) => onChange({ ...content, title: v })}
        placeholder="What students say"
      />
      <div>
        <label className={labelCls}>Show at most (blank for all)</label>
        <input
          type="number"
          min="0"
          max="50"
          value={content.limit ?? ''}
          onChange={(e) =>
            onChange({
              ...content,
              limit: e.target.value === '' ? null : parseInt(e.target.value, 10),
            })
          }
          className={`${inputCls} w-24`}
        />
      </div>
    </div>
  ),
  faq_accordion: ({ content, onChange }) => (
    <div className="space-y-3">
      <TextField
        label="Title"
        value={content.title}
        onChange={(v) => onChange({ ...content, title: v })}
        placeholder="Frequently asked"
      />
      <ListEditor
        label="Questions"
        items={Array.isArray(content.items) ? content.items : []}
        onChange={(items) => onChange({ ...content, items })}
        fields={[
          { key: 'q', label: 'Question' },
          { key: 'a', label: 'Answer', type: 'textarea', rows: 3 },
        ]}
        addLabel="+ Add question"
      />
    </div>
  ),
  video_embed: ({ content, onChange }) => (
    <div className="space-y-3">
      <TextField
        label="Title"
        value={content.title}
        onChange={(v) => onChange({ ...content, title: v })}
      />
      <TextField
        label="YouTube or Vimeo URL"
        value={content.url}
        onChange={(v) => onChange({ ...content, url: v })}
        placeholder="https://youtu.be/abc123"
      />
    </div>
  ),
  cta_band: ({ content, onChange }) => (
    <div className="space-y-3">
      <TextField
        label="Headline"
        value={content.headline}
        onChange={(v) => onChange({ ...content, headline: v })}
        placeholder="Ready to start?"
      />
      <TextArea
        label="Subhead"
        value={content.subhead}
        onChange={(v) => onChange({ ...content, subhead: v })}
        rows={2}
      />
      <div className="grid grid-cols-2 gap-2">
        <TextField
          label="Button label"
          value={content.cta_label}
          onChange={(v) => onChange({ ...content, cta_label: v })}
          placeholder="Book a lesson"
        />
        <TextField
          label="Button link"
          value={content.cta_anchor}
          onChange={(v) => onChange({ ...content, cta_anchor: v })}
          placeholder="#book"
        />
      </div>
    </div>
  ),
  language_intro: ({ content, onChange }) => (
    <div className="space-y-3">
      <TextField
        label="Title"
        value={content.title}
        onChange={(v) => onChange({ ...content, title: v })}
        placeholder="About the language"
      />
      <RichTextInput
        label="Body"
        value={content.body}
        onChange={(v) => onChange({ ...content, body: v })}
        minHeight="7rem"
      />
      <TextField
        label="Image URL"
        value={content.image_url}
        onChange={(v) => onChange({ ...content, image_url: v })}
        placeholder="https://…"
      />
    </div>
  ),
  newsletter_signup: () => (
    <div className="space-y-3">
      <div className="bg-kotoba-primary/5 border border-kotoba-primary/15 rounded-xl p-4 text-sm text-kotoba-text/80">
        <p className="font-medium text-kotoba-primary mb-1">Copy comes from your newsletter settings</p>
        <p>
          The headline and short pitch on this card come from your newsletter preferences (Dashboard → Content → Newsletter). Edit them there once and they update everywhere the signup form appears — including the footer and any homepage placement.
        </p>
      </div>
    </div>
  ),
};

const PageSectionEditor = ({ sectionType, content, onChange, variantSchema }) => {
  // When the tutor's tenant is on a v2 custom theme, PageBuilder hands
  // us the active variant's contentSchema for this section type. We
  // render it through SchemaForm — the exact same machinery the admin
  // theme editor uses to author themes. So tutor + designer use one
  // pipeline for content editing, no parallel schemas.
  if (variantSchema) {
    return (
      <div className="space-y-3">
        <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-kotoba-secondary-dark">
          Fields from your theme
        </p>
        <SchemaForm
          schema={variantSchema}
          value={content}
          onChange={onChange}
        />
      </div>
    );
  }

  const Editor = EDITORS[sectionType];
  return (
    <div className="space-y-3">
      <VariantPicker
        sectionType={sectionType}
        content={content}
        onChange={onChange}
      />
      {Editor ? (
        <Editor content={content} onChange={onChange} />
      ) : (
        <p className="text-sm text-kotoba-text/60 italic">
          No content fields for this section type — pick a layout above.
        </p>
      )}
    </div>
  );
};

export default PageSectionEditor;
