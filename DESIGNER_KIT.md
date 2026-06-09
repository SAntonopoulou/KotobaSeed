# Kotobaseed designer kit

A reference for the freelance designer working on custom tutor themes. Everything you need to ship a design that drops cleanly into a tutor's live site without engineering glue.

If you're picking up your first order, read this end to end once. Subsequent orders, jump to the relevant section.

---

## 1. Brand tokens

Every design must use the platform's tokenised palette + typography. This keeps the dashboard, marketplace, and tutor sites visually coherent across themes and ensures dark-mode and accessibility passes hold.

**Canonical source files** (commit these into the repo as you iterate):

| File | What lives there |
|---|---|
| `design-system/colors_and_type.css` | Honey gold, sage, plum, etc. CSS custom properties + body/display font pairs |
| `frontend/src/themes.css` | The runtime kotoba-primary/secondary/accent CSS variables consumed by Tailwind |
| `design-system/ui_kits/` | Existing kit references for marketing, booking, lesson-player, admin surfaces |

You can swap palette tokens per theme (that's the whole point of bespoke design) but stay inside the **kotoba-\*** token name scheme. If you need a color outside the palette, declare a new variable inside the theme rather than hard-coding hex.

Greek-word accents stay in honey gold. Reserve sentence case for the entire site (no caps lock headlines).

---

## 2. Section catalogue — what's allowed in a layout

A tutor site is rendered from a list of `TutorPageSection` rows. Each row has:

```json
{
  "section_type": "<one of the values below>",
  "position": 0,
  "is_visible": true,
  "content": { ... }
}
```

`position` orders the sections vertically; `is_visible: false` hides without deleting. Your final deliverable is a **JSON array of these objects** that the admin pastes into the order's "Attach final design" form, and we materialise as rows for the tutor (or every team member, if the order targets a team).

### Available `section_type` values

These map 1-to-1 with `backend/models.py::TutorPageSectionType`:

| section_type | What it renders | Content schema |
|---|---|---|
| `hero_portrait` | Top-of-page hero with photo + headline + subhead + CTA | `{ "headline": "string", "subhead": "string", "cta_label": "string", "cta_anchor": "string", "variant": "portrait_right \| portrait_left \| centered \| minimal", "bio_override": "string" }` |
| `about_portrait` | About-the-tutor section | `{ "title": "string", "body": "string", "variant": "..." }` |
| `features_grid` | "What you get" feature cards | `{ "title": "string", "items": [{"title": "string", "body": "string"}] }` |
| `levels_alphabet` | Visual CEFR-level breakdown | `{ "title": "string", "body": "string", "levels": [{"label": "A1", "title": "string", "body": "string"}] }` |
| `pricing_grid` | Auto-renders the tutor's lesson packs | `{ "title": "string" }` (no further content needed — pulls from `LessonPack` rows) |
| `reviews_grid` | Testimonials block | `{ "title": "string", "limit": 6 }` |
| `faq_accordion` | Expandable Q&A | `{ "title": "string", "items": [{"q": "string", "a": "string"}] }` |
| `video_embed` | YouTube or Vimeo embed | `{ "title": "string", "url": "string" }` |
| `cta_band` | Full-width call to action band | `{ "headline": "string", "subhead": "string", "cta_label": "string", "cta_anchor": "string" }` |
| `language_intro` | Block introducing the language taught | `{ "title": "string", "body": "string", "image_url": "string" }` |

**Custom section types are NOT supported in v1.** If you need a new component type, raise it before the brief is approved — adding one needs a frontend change.

### Constraints to design within

- **Headlines** ≤ 80 chars
- **Subheads / blurbs** ≤ 280 chars per field
- **FAQ items** ≤ 10 in a single accordion
- **Levels list** ≤ 6
- **Photos** must be at least 1200px wide; we serve them at 2× density
- **Variant choices** (where listed) are the only allowed values — don't invent new variants

### Example final-payload deliverable

```json
[
  { "section_type": "hero_portrait", "position": 0, "is_visible": true,
    "content": { "headline": "Modern Greek, slowly and well", "subhead": "Adult conversation lessons", "variant": "portrait_right", "cta_label": "Book a trial" }},
  { "section_type": "about_portrait", "position": 1, "is_visible": true,
    "content": { "title": "About Vasso", "body": "..." }},
  { "section_type": "pricing_grid", "position": 2, "is_visible": true,
    "content": { "title": "Book a lesson" }},
  { "section_type": "reviews_grid", "position": 3, "is_visible": true,
    "content": { "title": "What students say", "limit": 6 }},
  { "section_type": "faq_accordion", "position": 4, "is_visible": true,
    "content": { "title": "Frequently asked", "items": [{"q": "...", "a": "..."}] }}
]
```

---

## 3. The brief intake

Each order arrives as a JSON brief with these fields. Use this as your design checklist:

| Field | Use |
|---|---|
| `audience` | Who the tutor teaches. Sets tone register and reference points. |
| `tone` | Vibe — warm, scholarly, modern, playful, etc. Drives type pair + photo direction. |
| `language_focus` | The language taught. Often dictates script support (Greek glyphs, Japanese kana, etc.). |
| `color_leanings` | Hints, NOT commands. Translate into palette decisions. |
| `inspiration_links` | What the tutor likes. Look for shared visual themes, then improve on them. |
| `photo_url` | If provided, your hero photo. If not, plan for stock-friendly geometry that works with a placeholder until they upload. |
| `extra_notes` | Anything else — read first, it usually contains the real ask. |

If a brief field is empty, fill it from the tutor's existing site / public profile rather than asking unless something critical is missing.

---

## 4. The three concepts

You deliver **3 visually distinct concepts**. Not three color variations of the same design — three genuinely different directions so the tutor has a real choice. Common axes:

- Layout (portrait-right vs centered vs minimal)
- Color philosophy (warm earth vs cool muted vs single-bold-accent)
- Typography mood (humanist serif body vs geometric sans vs editorial slab)

Each concept is a Figma frame, exported at 2× retina as a single tall PNG of the homepage scroll. Host it somewhere we can hot-link from the admin queue (Google Drive shared link, Dropbox, your own server). The admin pastes the URL in the order's Concept Upload form.

Give each concept a one-line label and 1-2 sentence designer note so the tutor knows what they're seeing.

---

## 5. Revisions

The customer gets up to 2 revision rounds. We pay you per concept round; check your contract for the rate.

When a revision lands, you'll see the tutor's notes in the order's revision-notes block. Re-export the affected concepts at 2× and re-upload. Don't replace concepts they liked; only adjust what they flagged.

---

## 6. Handoff (the FINAL deliverable)

Once the tutor approves a concept and pays the final 50%, we move to delivery. You produce **two things**:

1. **The final TutorPageSection JSON array** — the format from section 2 above, ready to paste into the Attach Design form.
2. **All asset URLs** (photo, illustrations, any uploaded images) hosted on stable URLs we can copy into our CDN later.

The admin pastes the JSON, clicks Finalize, and the layout applies live to the tutor's site within seconds (or every team member's site, if it's a team theme).

If the tutor came in via a Pro discount, double-check that no Pro-gated section is in the layout (Pro themes lose access to a few advanced widgets — see model gating notes). Business themes have no such restriction.

---

## 7. Workflow summary

```
Brief arrives → 3 concepts (1-2 days) → Tutor reviews
                                       → Picks one
                                       → (optional) Asks for adjustments → you revise (≤2 rounds)
                                       → Approves
Tutor pays final 50% → You produce final layout JSON + assets → Admin pastes + clicks Finalize → Live
```

Average end-to-end timeline: 5-10 business days.

---

## 8. What makes a Kotobaseed-good tutor site

- The tutor's photo is the first thing visible above the fold.
- The hero subhead names the language + the audience in plain words.
- Pricing is reachable without scrolling on mobile — at most one section between hero and pricing.
- Testimonials anchor the lower half.
- Greek/Japanese/etc accent words use the honey-gold token, not bare CSS color.
- Nothing breaks at 360px width.
- The tutor's verified credential badges (DELE, CELTA, etc) are visible on the hero — we render them automatically when present.

---

## 9. Where to ask for help

Pull request or DM in the team channel. If the brief is ambiguous, ask the tutor directly via the support ticket attached to their order — don't guess.

Happy designing.
