import React, { useEffect, useMemo, useState } from 'react';
import client from '../api/client';
import { useConfirm } from '../context/ModalContext';
import {
  ALL_SECTION_TYPES,
  SECTION_DESCRIPTIONS,
  SECTION_LABELS,
} from './tutor_sections';
import PageSectionEditor from './page_builder/PageSectionEditor';
import { SkeletonCard } from './Skeleton';
import { getErrorMessage } from '../utils/errors';
import { getVariant } from '../themes/variants';

// Pro+ feature. The dashboard renders this regardless of tier and the
// component itself shows the gate prompt for non-Pro tutors — keeps the
// "what would I get?" reasoning visible without forcing them to upgrade
// just to see the panel.

const PageBuilder = () => {
  const confirm = useConfirm();
  const [sections, setSections] = useState([]);
  const [tier, setTier] = useState(null);
  // When the tutor has chosen a v2 custom theme, we resolve the
  // theme's design_payload into a `section_type → variant_key` map so
  // the per-section editor can render the variant's contentSchema
  // (the same schema the designer used). Tutors on stock themes fall
  // back to the hard-coded EDITORS in PageSectionEditor.
  const [variantBySection, setVariantBySection] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [editingIndex, setEditingIndex] = useState(null);
  const [showPicker, setShowPicker] = useState(false);
  const [dirty, setDirty] = useState(false);

  const isPro = tier === 'pro' || tier === 'business';

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      // Source the subscription tier from the *tutor* that owns the
      // site, not from the currently-logged-in viewer. A Business-tier
      // tutor with a co-managed team member on the free plan should
      // still be able to use the page builder. Tenant-scoped endpoint.
      const [sectionsRes, tutorRes] = await Promise.all([
        client.get('/tutor/page-sections'),
        client.get('/tutor/me').catch(() => ({ data: null })),
      ]);
      setSections(sectionsRes.data || []);
      setTier(tutorRes.data?.plan || tutorRes.data?.subscription_tier || 'free');
      setDirty(false);

      // If the tutor is on a v2 custom theme, fetch it to know which
      // variant treats each section type — then the per-section editor
      // can render the variant's contentSchema as form fields. Same
      // editing mechanism the designer used to author it.
      const themeKey = tutorRes.data?.theme;
      if (themeKey && typeof themeKey === 'string' && themeKey.startsWith('custom-')) {
        try {
          const themeRes = await client.get(`/custom-themes/v2/by-key/${themeKey}`);
          const layout = JSON.parse(themeRes.data?.design_payload_json || '[]');
          const map = {};
          for (const item of Array.isArray(layout) ? layout : []) {
            if (item?.section_type && item?.variant_key) {
              map[item.section_type] = item.variant_key;
            }
          }
          setVariantBySection(map);
        } catch {
          // Theme fetch failed — fall through; the editor renders the
          // default EDITORS, no harm done.
          setVariantBySection({});
        }
      } else {
        setVariantBySection({});
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load your page layout.'));
    } finally {
      setLoading(false);
    }
  };

  // Resolve the editing schema for a given section. Returns either a
  // variant `contentSchema` (for tutors on custom themes) or null
  // (PageSectionEditor falls back to the default EDITORS).
  const resolveVariantSchema = useMemo(() => {
    return (sectionType) => {
      const variantKey = variantBySection[sectionType];
      if (!variantKey) return null;
      const entry = getVariant(sectionType, variantKey);
      return entry?.contentSchema || null;
    };
  }, [variantBySection]);

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    setError('');
    setInfo('');
    try {
      const payload = {
        sections: sections.map((s) => ({
          section_type: s.section_type,
          is_visible: s.is_visible !== false,
          content: s.content || {},
        })),
      };
      const res = await client.put('/tutor/page-sections', payload);
      setSections(res.data || []);
      setDirty(false);
      setInfo('Saved.');
    } catch (err) {
      const status = err?.response?.status;
      if (status === 402) {
        setError('The page builder is a Pro feature. Upgrade to save changes.');
      } else {
        setError(getErrorMessage(err, 'Could not save your layout.'));
      }
    } finally {
      setSaving(false);
    }
  };

  const resetToDefault = async () => {
    if (!(await confirm({
      title: 'Reset layout',
      message: 'Reset your page to the default layout? Your customisations will be removed.',
      confirmText: 'Reset',
      destructive: true,
    }))) return;
    setSaving(true);
    setError('');
    setInfo('');
    try {
      await client.delete('/tutor/page-sections');
      await load();
      setInfo('Reset to default.');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not reset.'));
    } finally {
      setSaving(false);
    }
  };

  const move = (idx, delta) => {
    const next = idx + delta;
    if (next < 0 || next >= sections.length) return;
    const copy = [...sections];
    [copy[idx], copy[next]] = [copy[next], copy[idx]];
    setSections(copy);
    setDirty(true);
  };

  const toggleVisible = (idx) => {
    const copy = [...sections];
    copy[idx] = { ...copy[idx], is_visible: !(copy[idx].is_visible !== false) };
    setSections(copy);
    setDirty(true);
  };

  const remove = async (idx) => {
    if (!(await confirm({
      title: 'Remove section',
      message: `Remove the "${SECTION_LABELS[sections[idx].section_type]}" section?`,
      confirmText: 'Remove',
      destructive: true,
    }))) return;
    const copy = sections.filter((_, i) => i !== idx);
    setSections(copy);
    setDirty(true);
  };

  const addSection = (sectionType) => {
    setSections([...sections, { section_type: sectionType, is_visible: true, content: {} }]);
    setDirty(true);
    setShowPicker(false);
    setEditingIndex(sections.length);
  };

  const updateContent = (idx, content) => {
    const copy = [...sections];
    copy[idx] = { ...copy[idx], content };
    setSections(copy);
    setDirty(true);
  };

  if (loading) {
    return <SkeletonCard />;
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-kotoba-primary">Site builder</h2>
          <p className="text-sm text-kotoba-text/70 mt-1">
            Rearrange, hide, or customise the sections on your public page. Edits go live as soon as you save.
          </p>
        </div>
        {!isPro && (
          <span className="px-3 py-1 rounded-md bg-kotoba-secondary/30 text-kotoba-text text-sm font-medium">
            Pro feature
          </span>
        )}
      </div>

      {!isPro && (
        <div className="bg-kotoba-secondary/15 text-kotoba-text border border-kotoba-secondary/40 px-4 py-3 rounded-md text-sm">
          You can preview the layout below, but saving requires a Pro plan. Upgrade to unlock the builder.
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md text-sm">
          {error}
        </div>
      )}
      {info && !error && (
        <div className="bg-kotoba-primary/10 text-kotoba-primary px-4 py-2 rounded-md text-sm">
          {info}
        </div>
      )}

      <ul className="divide-y divide-kotoba-text/10 border border-kotoba-text/10 rounded-md">
        {sections.map((section, idx) => {
          const label = SECTION_LABELS[section.section_type] || section.section_type;
          const desc = SECTION_DESCRIPTIONS[section.section_type] || '';
          const isVisible = section.is_visible !== false;
          return (
            <li key={`${section.section_type}-${idx}`} className="px-3 py-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-grow">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-kotoba-primary">{label}</span>
                    {!isVisible && (
                      <span className="text-xs px-2 py-0.5 rounded bg-kotoba-text/10 text-kotoba-text/60">
                        Hidden
                      </span>
                    )}
                  </div>
                  {desc && (
                    <p className="text-xs text-kotoba-text/60 mt-0.5">{desc}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 text-sm">
                  <button
                    type="button"
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0}
                    className="px-2 py-1 text-kotoba-text/60 hover:text-kotoba-primary disabled:opacity-30"
                    title="Move up"
                    aria-label={`Move ${label} up`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(idx, 1)}
                    disabled={idx === sections.length - 1}
                    className="px-2 py-1 text-kotoba-text/60 hover:text-kotoba-primary disabled:opacity-30"
                    title="Move down"
                    aria-label={`Move ${label} down`}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleVisible(idx)}
                    className="px-2 py-1 text-kotoba-text/60 hover:text-kotoba-primary"
                    title={isVisible ? 'Hide section' : 'Show section'}
                  >
                    {isVisible ? 'Hide' : 'Show'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingIndex(editingIndex === idx ? null : idx)}
                    className="px-3 py-1 rounded-md border border-kotoba-primary text-kotoba-primary hover:bg-kotoba-primary hover:text-white"
                  >
                    {editingIndex === idx ? 'Close' : 'Edit'}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(idx)}
                    className="px-2 py-1 text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              </div>
              {editingIndex === idx && (
                <div className="mt-3 border-t border-kotoba-text/10 pt-3">
                  <PageSectionEditor
                    sectionType={section.section_type}
                    content={section.content || {}}
                    onChange={(content) => updateContent(idx, content)}
                    variantSchema={resolveVariantSchema(section.section_type)}
                  />
                </div>
              )}
            </li>
          );
        })}
        {sections.length === 0 && (
          <li className="px-3 py-3 text-sm text-kotoba-text/60">
            No sections — your site will be blank. Add one below.
          </li>
        )}
      </ul>

      <div className="relative">
        <button
          type="button"
          onClick={() => setShowPicker(!showPicker)}
          className="px-4 py-2 rounded-md border-2 border-dashed border-kotoba-primary/50 text-kotoba-primary text-sm font-medium hover:bg-kotoba-primary/5"
        >
          + Add a section
        </button>
        {showPicker && (
          <div className="absolute z-10 mt-2 bg-white border border-kotoba-text/15 rounded-lg shadow-lg p-2 w-72 max-h-96 overflow-y-auto">
            {ALL_SECTION_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => addSection(type)}
                className="block w-full text-left px-3 py-2 rounded hover:bg-kotoba-background/60"
              >
                <p className="font-medium text-kotoba-primary">{SECTION_LABELS[type]}</p>
                <p className="text-xs text-kotoba-text/60">{SECTION_DESCRIPTIONS[type]}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 pt-3 border-t border-kotoba-text/10">
        <button
          type="button"
          onClick={resetToDefault}
          disabled={saving || !isPro}
          className="text-sm text-kotoba-text/60 hover:text-red-600 disabled:opacity-40"
        >
          Reset to default layout
        </button>
        <div className="flex items-center gap-3">
          {dirty && (
            <span className="text-xs text-kotoba-text/60">Unsaved changes</span>
          )}
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty || !isPro}
            className="px-5 py-2 rounded-md bg-kotoba-primary text-white font-semibold hover:bg-kotoba-primary/90 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save layout'}
          </button>
        </div>
      </div>
    </section>
  );
};

export default PageBuilder;
