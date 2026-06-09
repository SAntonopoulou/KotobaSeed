import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import client from '../../api/client';
import { VARIANT_REGISTRY, listSectionTypes, listVariantsFor } from '../../themes/variants';
import SchemaForm, {
  FieldRow,
  TextInput,
  EnumInput,
} from '../../components/SchemaForm';

// Admin v2 custom-theme editor.
//
// The designer fills out:
//   - identity (name, theme_key, preview image)
//   - palette (CSS custom properties)
//   - fonts (Google Fonts loader URL + per-role family names)
//   - sections (ordered list of {section_type, variant_key, content})
//
// The content sub-form for each section is generated from the variant's
// `contentSchema`. Adding a new variant elsewhere in the codebase
// automatically shows up here — no edit needed.
//
// Saves through POST/PATCH /admin/custom-themes/v2 . A tutor activates
// a saved theme through their dashboard (Phase B step 5).

const FONT_PRESETS = [
  {
    key: 'vasso',
    label: 'Commissioner + Manrope (Greek with Vasso)',
    url:
      'https://fonts.googleapis.com/css2?family=Commissioner:wght@400;500;600;700;800&family=Manrope:wght@400;500;600;700;800&family=Syne:wght@600;700;800&display=swap',
    fonts: { display: 'Commissioner', body: 'Manrope', logo: 'Syne' },
  },
  {
    key: 'kotobaseed',
    label: 'Fraunces + Quicksand (Kotobaseed default)',
    url:
      'https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700;9..144,800&display=swap',
    fonts: { display: 'Fraunces', body: 'Quicksand', logo: 'Fraunces' },
  },
  {
    key: 'inter',
    label: 'Inter (modern utilitarian)',
    url:
      'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap',
    fonts: { display: 'Inter', body: 'Inter', logo: 'Inter' },
  },
];

// Default palette keys that the runtime renderer translates into CSS
// vars on a scoped root. Designers see these as labelled colour inputs;
// they're free to add more keys through the JSON escape hatch but the
// common ones are surfaced for ergonomics.
const DEFAULT_PALETTE_KEYS = [
  { key: '--brand', label: 'Brand', hint: 'Primary actions, links, accents' },
  { key: '--brand-hover', label: 'Brand hover' },
  { key: '--accent', label: 'Accent', hint: 'Highlights, ribbons' },
  { key: '--bg', label: 'Background' },
  { key: '--surface', label: 'Surface (cards)' },
  { key: '--fg', label: 'Text' },
  { key: '--fg-muted', label: 'Text muted' },
  { key: '--border', label: 'Border' },
];

const slugify = (raw) =>
  raw.toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

const slugifyKey = (raw) => {
  const slug = slugify(raw);
  if (!slug) return '';
  return slug.startsWith('custom-') ? slug : `custom-${slug}`;
};

const buildEmptySection = (sectionType, variantKey) => {
  const entry = VARIANT_REGISTRY[sectionType]?.[variantKey];
  const schema = entry?.contentSchema || {};
  const content = {};
  for (const [field, def] of Object.entries(schema)) {
    if (def?.default !== undefined) content[field] = def.default;
  }
  return {
    section_type: sectionType,
    variant_key: variantKey,
    is_visible: true,
    position: 0,
    content,
  };
};

// SchemaForm + FieldRow + TextInput + EnumInput + ListInput + ColorsInput
// are imported from ../../components/SchemaForm — single source of truth
// shared with the tutor page builder so designers and tutors edit
// content through the same machinery.

// --- Main editor page --------------------------------------------------

const Card = ({ title, children }) => (
  <section style={{
    background: '#fff',
    border: '1px solid rgb(var(--kotoba-text-rgb) / 0.08)',
    borderRadius: 18,
    padding: 22,
    marginBottom: 18,
    boxShadow: '0 4px 14px -10px rgba(0,0,0,0.15)',
  }}>
    <h2 style={{
      fontFamily: 'var(--font-display, inherit)',
      fontWeight: 700,
      fontSize: 18,
      margin: '0 0 14px',
      color: 'rgb(var(--kotoba-primary-rgb))',
    }}>{title}</h2>
    {children}
  </section>
);

const AdminCustomThemeV2Editor = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const editing = !!id;

  const [name, setName] = useState('');
  const [themeKey, setThemeKey] = useState('');
  const [keyEdited, setKeyEdited] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [publicCatalogue, setPublicCatalogue] = useState(false);

  const [paletteRows, setPaletteRows] = useState(
    DEFAULT_PALETTE_KEYS.map((k) => ({ key: k.key, label: k.label, hint: k.hint, value: '#000000' })),
  );
  const [extraPaletteJson, setExtraPaletteJson] = useState('{}');

  const [fontPreset, setFontPreset] = useState(FONT_PRESETS[0].key);
  const [customFontsUrl, setCustomFontsUrl] = useState('');
  const [customFontsJson, setCustomFontsJson] = useState('{}');

  const [sections, setSections] = useState([]);

  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState(null);
  const [bannerOk, setBannerOk] = useState(false);

  // When editing, hydrate from the backend.
  useEffect(() => {
    if (!editing) return;
    (async () => {
      try {
        const res = await client.get(`/admin/custom-themes/v2`);
        const row = (res.data || []).find((t) => t.id === Number(id));
        if (!row) {
          setBanner('Theme not found.');
          setBannerOk(false);
          return;
        }
        setName(row.name);
        setThemeKey(row.theme_key);
        setKeyEdited(true);
        setPreviewUrl(row.preview_image_url || '');
        setPublicCatalogue(!!row.is_public_catalogue);

        const palette = (() => { try { return JSON.parse(row.palette_json || '{}'); } catch { return {}; } })();
        const known = DEFAULT_PALETTE_KEYS.map((k) => ({
          key: k.key,
          label: k.label,
          hint: k.hint,
          value: palette[k.key] || '#000000',
        }));
        setPaletteRows(known);
        const extras = {};
        for (const [k, v] of Object.entries(palette)) {
          if (!DEFAULT_PALETTE_KEYS.find((d) => d.key === k)) extras[k] = v;
        }
        setExtraPaletteJson(JSON.stringify(extras, null, 2));

        const fonts = (() => { try { return JSON.parse(row.fonts_json || '{}'); } catch { return {}; } })();
        const matchedPreset = FONT_PRESETS.find((p) => p.url === fonts.url);
        if (matchedPreset) {
          setFontPreset(matchedPreset.key);
        } else {
          setFontPreset('custom');
          setCustomFontsUrl(fonts.url || '');
          setCustomFontsJson(JSON.stringify(fonts, null, 2));
        }

        const decoded = (() => { try { return JSON.parse(row.design_payload_json || '[]'); } catch { return []; } })();
        setSections(Array.isArray(decoded) ? decoded : []);
      } catch (err) {
        setBanner(err?.response?.data?.detail || 'Could not load theme.');
        setBannerOk(false);
      }
    })();
  }, [id, editing]);

  const handleNameChange = (next) => {
    setName(next);
    if (!keyEdited && !editing) setThemeKey(slugifyKey(next));
  };

  const handleKeyChange = (next) => {
    setKeyEdited(true);
    setThemeKey(slugifyKey(next));
  };

  const handleAddSection = (sectionType, variantKey) => {
    setSections([
      ...sections,
      { ...buildEmptySection(sectionType, variantKey), position: sections.length },
    ]);
  };

  const sectionTypes = useMemo(() => listSectionTypes(), []);

  const paletteJson = useMemo(() => {
    const out = {};
    for (const row of paletteRows) {
      if (row.value) out[row.key] = row.value;
    }
    try {
      const extras = JSON.parse(extraPaletteJson || '{}');
      if (extras && typeof extras === 'object') {
        for (const [k, v] of Object.entries(extras)) out[k] = v;
      }
    } catch { /* extras invalid — caller will see the form error */ }
    return JSON.stringify(out);
  }, [paletteRows, extraPaletteJson]);

  const fontsJson = useMemo(() => {
    if (fontPreset === 'custom') {
      try {
        const parsed = JSON.parse(customFontsJson || '{}');
        if (customFontsUrl) parsed.url = customFontsUrl;
        return JSON.stringify(parsed);
      } catch {
        return JSON.stringify({ url: customFontsUrl });
      }
    }
    const preset = FONT_PRESETS.find((p) => p.key === fontPreset) || FONT_PRESETS[0];
    return JSON.stringify({ url: preset.url, ...preset.fonts });
  }, [fontPreset, customFontsJson, customFontsUrl]);

  const submit = async () => {
    setBanner(null);
    if (!name.trim() || !themeKey.trim()) {
      setBanner('Name and theme key are required.');
      setBannerOk(false);
      return;
    }
    if (!themeKey.startsWith('custom-')) {
      setBanner('Theme key must start with `custom-`.');
      setBannerOk(false);
      return;
    }
    try { JSON.parse(extraPaletteJson || '{}'); } catch (e) {
      setBanner(`Extra palette JSON is invalid: ${e.message}`);
      setBannerOk(false);
      return;
    }

    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        theme_key: themeKey,
        palette_json: paletteJson,
        fonts_json: fontsJson,
        design_payload_json: JSON.stringify(
          sections.map((s, idx) => ({ ...s, position: idx })),
        ),
        preview_image_url: previewUrl.trim() || null,
        is_public_catalogue: publicCatalogue,
      };
      if (editing) {
        await client.patch(`/admin/custom-themes/v2/${id}`, payload);
      } else {
        const res = await client.post('/admin/custom-themes/v2', payload);
        if (res.data?.id) navigate(`/admin/custom-themes/v2/${res.data.id}/edit`, { replace: true });
      }
      setBanner('Saved.');
      setBannerOk(true);
    } catch (err) {
      setBanner(err?.response?.data?.detail || 'Save failed.');
      setBannerOk(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 920, margin: '0 auto', padding: '32px 18px 80px', fontFamily: 'var(--font-sans, sans-serif)' }}>
      <header style={{ marginBottom: 24, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgb(var(--kotoba-secondary-dark-rgb))', margin: 0 }}>
            Custom themes
          </p>
          <h1 style={{ fontFamily: 'var(--font-display, inherit)', fontWeight: 700, fontSize: 30, margin: '6px 0 0', color: 'rgb(var(--kotoba-primary-rgb))' }}>
            {editing ? 'Edit theme' : 'New theme'}
          </h1>
        </div>
        <Link to="/admin/custom-themes" style={{ fontSize: 13, color: 'rgb(var(--kotoba-primary-rgb))', textDecoration: 'none' }}>
          ← All themes
        </Link>
      </header>

      {banner && (
        <div style={{
          background: bannerOk ? 'rgb(var(--kotoba-primary-rgb) / 0.08)' : '#fee2e2',
          color: bannerOk ? 'rgb(var(--kotoba-primary-rgb))' : '#991b1b',
          border: `1px solid ${bannerOk ? 'rgb(var(--kotoba-primary-rgb) / 0.2)' : '#fecaca'}`,
          padding: '10px 14px',
          borderRadius: 12,
          marginBottom: 16,
          fontSize: 14,
        }}>
          {banner}
        </div>
      )}

      <Card title="Identity">
        <FieldRow label="Name" hint="Shown to tutors in their theme picker.">
          <TextInput value={name} onChange={handleNameChange} maxLength={160} />
        </FieldRow>
        <FieldRow label="Theme key" hint="Slug stored on Tutor.theme. Must start with `custom-`. Auto-generated from the name.">
          <TextInput value={themeKey} onChange={handleKeyChange} maxLength={64} />
        </FieldRow>
        <FieldRow label="Preview image URL" hint="Screenshot shown on the picker — upload to your storage of choice, paste the public URL here.">
          <TextInput value={previewUrl} onChange={setPreviewUrl} maxLength={2048} />
        </FieldRow>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <input
            type="checkbox"
            checked={publicCatalogue}
            onChange={(e) => setPublicCatalogue(e.target.checked)}
          />
          <span style={{ fontSize: 13 }}>
            Show on every tutor's picker (public curated catalogue)
          </span>
        </label>
      </Card>

      <Card title="Palette">
        <p style={{ fontSize: 13, color: 'rgb(var(--kotoba-text-rgb) / 0.65)', margin: '0 0 14px' }}>
          These values are injected as inline CSS custom properties on the themed root. The runtime renderer applies them via <code>style</code>; existing layout selectors cascade with the new colours.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
          {paletteRows.map((row, idx) => (
            <FieldRow key={row.key} label={row.label} hint={row.hint}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="color"
                  value={row.value || '#000000'}
                  onChange={(e) => {
                    const next = [...paletteRows];
                    next[idx] = { ...row, value: e.target.value };
                    setPaletteRows(next);
                  }}
                  style={{ width: 40, height: 32, padding: 0, border: 'none', cursor: 'pointer', borderRadius: 8 }}
                />
                <code style={{ fontSize: 12, color: 'rgb(var(--kotoba-text-rgb) / 0.6)' }}>{row.key}</code>
              </div>
            </FieldRow>
          ))}
        </div>
        <FieldRow label="Extra palette JSON" hint="Any additional CSS variables not covered above. Use `{ '--my-key': '#abc' }` shape.">
          <TextInput value={extraPaletteJson} onChange={setExtraPaletteJson} maxLength={4000} multiline />
        </FieldRow>
      </Card>

      <Card title="Fonts">
        <FieldRow label="Preset">
          <EnumInput
            value={fontPreset}
            onChange={setFontPreset}
            values={[...FONT_PRESETS.map((p) => p.key), 'custom']}
          />
        </FieldRow>
        {fontPreset === 'custom' && (
          <>
            <FieldRow label="Google Fonts URL">
              <TextInput value={customFontsUrl} onChange={setCustomFontsUrl} maxLength={1000} />
            </FieldRow>
            <FieldRow label="Per-role family names (JSON)" hint='e.g. `{ "display": "Playfair", "body": "Inter", "logo": "Playfair" }`'>
              <TextInput value={customFontsJson} onChange={setCustomFontsJson} maxLength={1000} multiline />
            </FieldRow>
          </>
        )}
      </Card>

      <Card title="Sections">
        <p style={{ fontSize: 13, color: 'rgb(var(--kotoba-text-rgb) / 0.65)', margin: '0 0 14px' }}>
          The themed tenant landing renders these in order. Each card lets you pick a section type, then a variant for that type, then fill the copy.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {sections.map((s, idx) => (
            <SectionEditor
              key={idx}
              section={s}
              onChange={(next) => {
                const copy = [...sections];
                copy[idx] = next;
                setSections(copy);
              }}
              onRemove={() => setSections(sections.filter((_, i) => i !== idx))}
              onMoveUp={idx > 0 ? () => {
                const copy = [...sections];
                [copy[idx - 1], copy[idx]] = [copy[idx], copy[idx - 1]];
                setSections(copy);
              } : null}
              onMoveDown={idx < sections.length - 1 ? () => {
                const copy = [...sections];
                [copy[idx], copy[idx + 1]] = [copy[idx + 1], copy[idx]];
                setSections(copy);
              } : null}
            />
          ))}
        </div>
        <AddSectionControl
          types={sectionTypes}
          onAdd={handleAddSection}
        />
      </Card>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
        <Link
          to="/admin/custom-themes"
          style={{
            padding: '10px 18px',
            background: 'transparent',
            border: '1px solid rgb(var(--kotoba-text-rgb) / 0.2)',
            borderRadius: 10,
            color: 'rgb(var(--kotoba-text-rgb))',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          Cancel
        </Link>
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          style={{
            padding: '10px 22px',
            background: 'rgb(var(--kotoba-primary-rgb))',
            color: '#fff',
            border: 'none',
            borderRadius: 10,
            fontWeight: 700,
            fontSize: 14,
            cursor: busy ? 'not-allowed' : 'pointer',
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Create theme'}
        </button>
      </div>
    </div>
  );
};

const SectionEditor = ({ section, onChange, onRemove, onMoveUp, onMoveDown }) => {
  const variants = listVariantsFor(section.section_type);
  const entry = VARIANT_REGISTRY[section.section_type]?.[section.variant_key];
  const schema = entry?.contentSchema || {};
  return (
    <div style={{
      border: '1px solid rgb(var(--kotoba-text-rgb) / 0.12)',
      borderRadius: 14,
      padding: 16,
      background: 'rgb(var(--kotoba-text-rgb) / 0.02)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgb(var(--kotoba-text-rgb) / 0.7)' }}>
          {section.section_type} · {section.variant_key}
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          {onMoveUp && (
            <button type="button" onClick={onMoveUp} style={smallBtn}>↑</button>
          )}
          {onMoveDown && (
            <button type="button" onClick={onMoveDown} style={smallBtn}>↓</button>
          )}
          <button type="button" onClick={onRemove} style={{ ...smallBtn, color: '#b91c1c' }}>Remove</button>
        </div>
      </div>
      <FieldRow label="Variant">
        <EnumInput
          value={section.variant_key}
          onChange={(next) => onChange({
            ...buildEmptySection(section.section_type, next),
            content: { ...buildEmptySection(section.section_type, next).content, ...section.content },
            position: section.position,
            is_visible: section.is_visible,
          })}
          values={variants.map((v) => v.key)}
        />
      </FieldRow>
      <SchemaForm
        schema={schema}
        value={section.content || {}}
        onChange={(next) => onChange({ ...section, content: next })}
      />
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <input
          type="checkbox"
          checked={section.is_visible !== false}
          onChange={(e) => onChange({ ...section, is_visible: e.target.checked })}
        />
        <span style={{ fontSize: 13 }}>Visible</span>
      </label>
    </div>
  );
};

const smallBtn = {
  background: 'transparent',
  border: '1px solid rgb(var(--kotoba-text-rgb) / 0.18)',
  borderRadius: 8,
  fontSize: 12,
  padding: '4px 10px',
  cursor: 'pointer',
};

const AddSectionControl = ({ types, onAdd }) => {
  const [type, setType] = useState(types[0] || '');
  const variants = listVariantsFor(type);
  const [variantKey, setVariantKey] = useState(variants[0]?.key || '');
  useEffect(() => {
    setVariantKey(listVariantsFor(type)[0]?.key || '');
  }, [type]);
  if (types.length === 0) return null;
  return (
    <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 160 }}>
        <FieldRow label="Section type">
          <EnumInput value={type} onChange={setType} values={types} />
        </FieldRow>
      </div>
      <div style={{ flex: 1, minWidth: 160 }}>
        <FieldRow label="Variant">
          <EnumInput value={variantKey} onChange={setVariantKey} values={variants.map((v) => v.key)} />
        </FieldRow>
      </div>
      <button
        type="button"
        onClick={() => variantKey && onAdd(type, variantKey)}
        style={{
          padding: '10px 16px',
          background: 'rgb(var(--kotoba-primary-rgb))',
          color: '#fff',
          border: 'none',
          borderRadius: 10,
          fontWeight: 700,
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        + Add section
      </button>
    </div>
  );
};

export default AdminCustomThemeV2Editor;
