import React, { useEffect, useMemo, useState } from 'react';
import client from '../api/client';
import VassoLayout from './vasso_greek/VassoLayout';
import VassoBookingDialog from './vasso_greek/VassoBookingDialog';
import DafniLayout from './dafni_botanical/DafniLayout';
import DafniBookingDialog from './dafni_botanical/DafniBookingDialog';
import SophiaLayout from './sophia_inkwell/SophiaLayout';
import SophiaBookingDialog from './sophia_inkwell/SophiaBookingDialog';
import { getVariant } from './variants';
import NewsletterSignupCard from '../components/NewsletterSignupCard';
import { SECTION_COMPONENTS } from '../components/tutor_sections';
import './vasso_greek/vasso_greek.css';
import './dafni_botanical/dafni_botanical.css';
import './sophia_inkwell/sophia_inkwell.css';

// Per-customer layout components. Each paying customer's bespoke pack
// includes its own chrome (header + footer + scope class) AND its own
// booking dialog (the only modal the hero CTAs open). The runtime
// picks the right pair from the theme_key. New paying clients in the
// future add a new entry here when their pack ships.
const LAYOUT_BY_THEME_KEY = {
  'custom-vasso': VassoLayout,
  'custom-dafni': DafniLayout,
  'custom-sophia': SophiaLayout,
};
const BOOKING_DIALOG_BY_THEME_KEY = {
  'custom-vasso': VassoBookingDialog,
  'custom-dafni': DafniBookingDialog,
  'custom-sophia': SophiaBookingDialog,
};
const DEFAULT_LAYOUT = VassoLayout;
const DEFAULT_BOOKING_DIALOG = VassoBookingDialog;

// CustomThemeSite — generic runtime renderer for v2 custom themes.
//
// The theme owns STRUCTURE + VISUAL TREATMENT (palette, fonts, the
// section order, and which variant treats each section). The TUTOR's
// own backend rows own CONTENT. So the renderer merges two sources:
//
//   1. `theme.design_payload_json` — list of
//        `{section_type, variant_key, position, is_visible}`
//      with NO content (it stays the same across every tutor on the
//      theme).
//   2. `pageSections` prop — the tutor's `TutorPageSection` rows
//      (from `/tutor/page-sections`), keyed by section_type. Each
//      row's `content` becomes the props passed to the variant.
//
// If a tutor hasn't filled in a section (no matching `TutorPageSection`
// row OR an empty content), the variant's own "required" checks will
// hide it. Sophia's rule: if she doesn't have something, none should
// show. No baked-in placeholder copy on a live tenant.
//
// Also injects palette as inline CSS vars, loads the fonts URL once
// per session, and wraps in the shared VassoLayout chrome.

const FONTS_LOADED = new Set();

function useFontsUrl(url) {
  useEffect(() => {
    if (!url || typeof document === 'undefined') return undefined;
    if (FONTS_LOADED.has(url)) return undefined;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    link.setAttribute('data-custom-theme-font', '');
    document.head.appendChild(link);
    FONTS_LOADED.add(url);
    return () => {
      // Keep the link in the DOM after unmount — re-mounting a theme
      // shouldn't re-fetch fonts. The Set guards against duplicate
      // <link> nodes piling up across SPA navigation.
    };
  }, [url]);
}

function useTabTitle(title) {
  useEffect(() => {
    if (!title) return undefined;
    const previous = document.title;
    document.title = title;
    return () => { document.title = previous; };
  }, [title]);
}

function parseJSON(raw, fallback) {
  if (raw == null) return fallback;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return fallback; }
}

function paletteToInlineStyle(palette) {
  if (!palette || typeof palette !== 'object') return {};
  const style = {};
  // Accept either keys with the `--` prefix or without — designers
  // tend to forget, the runtime is lenient.
  for (const [rawKey, value] of Object.entries(palette)) {
    if (value == null) continue;
    const key = rawKey.startsWith('--') ? rawKey : `--${rawKey}`;
    style[key] = value;
  }
  return style;
}

const CustomThemeSite = ({
  theme,
  tutor,
  packs = [],
  trial,
  testimonials = [],
  singleLesson,
  subscriptionPlan,
  pageSections = [],
  currentUser,
  onLogout,
}) => {
  const palette = parseJSON(theme?.palette_json, {});
  const fonts = parseJSON(theme?.fonts_json, {});
  const layout = parseJSON(theme?.design_payload_json, []);
  // Chrome (wordmark, nav, footer) lives as a sibling on the fonts_json
  // blob for now — keeps the v2 schema additive without a migration.
  // VassoLayout consumes it; defaults kick in for any field absent.
  const chrome = fonts?.chrome || null;

  useFontsUrl(fonts?.url);
  useTabTitle(theme?.tab_title || theme?.name);

  const firstName =
    (tutor?.display_name || '').trim().split(/\s+/)[0] || 'Tutor';

  // Index the tutor's content by section_type so we can resolve each
  // section in the theme's layout to a content blob in O(1). Theme can
  // declare a section type at most once (mirrors the page builder's
  // model — TutorPageSection rows are unique by tutor+section_type via
  // the position ordering).
  const contentBySectionType = useMemo(() => {
    const map = {};
    for (const row of pageSections) {
      if (!row || !row.section_type) continue;
      // Last write wins for duplicates — same behaviour the page
      // builder enforces server-side via replace_page_sections.
      map[row.section_type] = row.content || {};
    }
    return map;
  }, [pageSections]);

  // Booking state shared across every variant that wires a "book"
  // callback into its CTAs.
  const [bookingPack, setBookingPack] = useState(null);
  const onBook = (pack) => setBookingPack(pack);
  const onClose = () => setBookingPack(null);

  // Is this tutor actually open to bookings right now? Hero variants
  // flip the "Booking now" pill to "Not taking new students" when this
  // is false. Truthy default avoids discouraging students on a slow
  // network — only flip to false when we've heard back and the answer
  // really is "no availability windows configured".
  const [isAcceptingBookings, setIsAcceptingBookings] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await client.get('/tutor/availability');
        if (cancelled) return;
        const windows = Array.isArray(res.data) ? res.data : [];
        setIsAcceptingBookings(windows.length > 0);
      } catch {
        // Transient failure — leave as accepting so we don't falsely
        // tell visitors the tutor is closed.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Trial pack synthesised from the tenant settings — same shape
  // VassoGreekSite builds today so variants don't have to know about
  // the backend's split between `/tutor/trial` (settings) and the
  // singleton trial lesson pack.
  const trialPack = trial?.offers_free_trial
    ? {
        id: 'trial',
        name: 'Free trial lesson',
        num_lessons: 1,
        duration_minutes: trial.free_trial_minutes || 20,
        price_cents: 0,
        currency: 'eur',
        is_group: false,
      }
    : null;
  const trialContext = trialPack ? { pack: trialPack } : null;

  // Shared props every variant receives. Variants are free to ignore
  // anything they don't use.
  const variantProps = useMemo(() => ({
    tutor,
    firstName,
    packs,
    trial: trialContext,
    testimonials,
    singleLesson,
    plan: subscriptionPlan,
    isAcceptingBookings,
    onBook,
  }), [tutor, firstName, packs, trialContext, testimonials, singleLesson, subscriptionPlan, isAcceptingBookings]);

  // Walk the theme layout (just structure: section_type + variant_key
  // + position). For each entry, pull content from the tutor's matching
  // TutorPageSection row. Theme.design_payload can also carry inline
  // `content` for back-compat with v2 theme drafts that haven't yet
  // been migrated to per-tutor content; tutor content wins when both
  // are present.
  const visibleSections = (Array.isArray(layout) ? layout : [])
    .filter((s) => s && s.is_visible !== false)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  // Layout is picked per theme_key — each paying customer's bespoke
  // pack ships its own chrome. Tutors on a custom theme whose layout
  // isn't registered (e.g. a draft theme without a deployed layout
  // yet) fall back to the default chrome rather than crashing.
  const Layout = LAYOUT_BY_THEME_KEY[theme?.theme_key] || DEFAULT_LAYOUT;
  const BookingDialog =
    BOOKING_DIALOG_BY_THEME_KEY[theme?.theme_key] || DEFAULT_BOOKING_DIALOG;

  return (
    <div style={paletteToInlineStyle(palette)}>
      <Layout
        tutor={tutor}
        currentUser={currentUser}
        onLogout={onLogout}
        variant="landing"
        chrome={chrome}
      >
        {visibleSections.map((section, idx) => {
          const entry = getVariant(section.section_type, section.variant_key);
          if (!entry) return null;
          const Component = entry.component;
          // Tutor content > theme inline content > {} . If both are
          // present, prefer tutor (per-tenant truth).
          const tutorContent = contentBySectionType[section.section_type] || null;
          const themeContent = section.content || null;
          const mergedContent = tutorContent || themeContent || {};
          return (
            <Component
              key={section.id || `${section.section_type}-${idx}`}
              content={mergedContent}
              {...variantProps}
            />
          );
        })}
        {/* Tutor-added sections that aren't part of the theme layout
            (e.g. newsletter signup placed via the page builder). They
            render after the theme's structured sections via the public
            variant if one exists. Sections that have a matching theme
            layout entry are skipped — those rendered above. */}
        {(pageSections || [])
          .filter((s) => s && s.is_visible !== false)
          .filter(
            (s) => !visibleSections.some(
              (v) => v.section_type === s.section_type,
            ),
          )
          .map((s, idx) => {
            // Prefer a public variant if one is registered; otherwise
            // fall back to the apex SECTION_COMPONENTS entry.
            const publicEntry = getVariant(s.section_type, 'public_card');
            if (publicEntry) {
              const Comp = publicEntry.component;
              return (
                <Comp
                  key={`extra-${s.section_type}-${idx}`}
                  content={s.content || {}}
                  {...variantProps}
                />
              );
            }
            const Fallback = SECTION_COMPONENTS[s.section_type];
            if (!Fallback) return null;
            return (
              <Fallback
                key={`extra-${s.section_type}-${idx}`}
                tutor={tutor}
                content={s.content || {}}
              />
            );
          })}
        {/* Auto-mounted homepage card (legacy — only renders if tutor
            hasn't already placed newsletter_signup via PageBuilder, to
            avoid showing it twice). Kept so tutors who never touch the
            page builder still get a CTA on their homepage. */}
        {!pageSections?.some((s) => s.section_type === 'newsletter_signup') && (
          <div style={{ maxWidth: 720, margin: '24px auto 48px', padding: '0 16px' }}>
            <NewsletterSignupCard
              tutorSlug={tutor?.tutor_slug}
              variant="apex"
            />
          </div>
        )}
        {bookingPack && (
          <BookingDialog
            pack={bookingPack}
            tutorDisplayName={tutor?.display_name || firstName}
            onClose={onClose}
          />
        )}
      </Layout>
    </div>
  );
};

export default CustomThemeSite;
