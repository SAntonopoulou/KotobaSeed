import React, { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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

// Stable per-row UID for dnd-kit. The backend doesn't store this — we add
// it on load and on add, strip it before save.
const nextUid = (() => {
  let n = 0;
  return () =>
    (typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `s-${Date.now()}-${++n}`);
})();
const withUid = (s) => (s._uid ? s : { ...s, _uid: nextUid() });

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
  const [tutorSlug, setTutorSlug] = useState(null);

  const isPro = tier === 'pro' || tier === 'business';

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const onDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSections((prev) => {
      const oldIdx = prev.findIndex((s) => s._uid === active.id);
      const newIdx = prev.findIndex((s) => s._uid === over.id);
      if (oldIdx < 0 || newIdx < 0) return prev;
      return arrayMove(prev, oldIdx, newIdx);
    });
    setDirty(true);
  };

  const previewUrl = useMemo(() => {
    if (typeof window === 'undefined') return null;
    if (!tutorSlug) return null;
    const host = window.location.host;
    if (host.startsWith(`${tutorSlug}.`)) return '/';
    const apex = host.replace(/^[^.]+\./, '');
    return `${window.location.protocol}//${tutorSlug}.${apex}/`;
  }, [tutorSlug]);

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
      setSections((sectionsRes.data || []).map(withUid));
      setTier(tutorRes.data?.plan || tutorRes.data?.subscription_tier || 'free');
      setTutorSlug(tutorRes.data?.tutor_slug || null);
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
      setSections((res.data || []).map(withUid));
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
    setSections([
      ...sections,
      withUid({ section_type: sectionType, is_visible: true, content: {} }),
    ]);
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
            Drag sections to reorder, hide what you don't want, edit the
            copy with the rich-text toolbar. Saves go live on your public
            site immediately.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {previewUrl && (
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-kotoba-primary/40 text-kotoba-primary text-sm font-medium hover:bg-kotoba-primary/5"
              title="Open your public site in a new tab"
            >
              View live site
              <span aria-hidden>↗</span>
            </a>
          )}
          {!isPro && (
            <span className="px-3 py-1 rounded-md bg-kotoba-secondary/30 text-kotoba-text text-sm font-medium">
              Pro feature
            </span>
          )}
        </div>
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

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={sections.map((s) => s._uid)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="divide-y divide-kotoba-text/10 border border-kotoba-text/10 rounded-md">
            {sections.map((section, idx) => (
              <SortableSectionRow
                key={section._uid}
                section={section}
                idx={idx}
                editingIndex={editingIndex}
                setEditingIndex={setEditingIndex}
                toggleVisible={toggleVisible}
                remove={remove}
                updateContent={updateContent}
                resolveVariantSchema={resolveVariantSchema}
              />
            ))}
            {sections.length === 0 && (
              <li className="px-3 py-3 text-sm text-kotoba-text/60">
                No sections — your site will be blank. Add one below.
              </li>
            )}
          </ul>
        </SortableContext>
      </DndContext>

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

const SortableSectionRow = ({
  section,
  idx,
  editingIndex,
  setEditingIndex,
  toggleVisible,
  remove,
  updateContent,
  resolveVariantSchema,
}) => {
  const label = SECTION_LABELS[section.section_type] || section.section_type;
  const desc = SECTION_DESCRIPTIONS[section.section_type] || '';
  const isVisible = section.is_visible !== false;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section._uid });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
    background: isDragging ? 'rgb(var(--kotoba-background-rgb) / 0.6)' : undefined,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <li ref={setNodeRef} style={style} className="px-3 py-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0 flex-grow">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing px-1.5 py-1 text-kotoba-text/40 hover:text-kotoba-text/80 -ml-1 select-none touch-none"
            title="Drag to reorder"
            aria-label={`Drag ${label} to reorder`}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              aria-hidden
              fill="currentColor"
            >
              <circle cx="4" cy="3" r="1.2" />
              <circle cx="10" cy="3" r="1.2" />
              <circle cx="4" cy="7" r="1.2" />
              <circle cx="10" cy="7" r="1.2" />
              <circle cx="4" cy="11" r="1.2" />
              <circle cx="10" cy="11" r="1.2" />
            </svg>
          </button>
          <div className="min-w-0">
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
        </div>
        <div className="flex items-center gap-1 text-sm">
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
};

export default PageBuilder;
