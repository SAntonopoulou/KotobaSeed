import HeroPortrait from './HeroPortrait';
import AboutPortrait from './AboutPortrait';
import FeaturesGrid from './FeaturesGrid';
import LevelsAlphabet from './LevelsAlphabet';
import PricingGrid from './PricingGrid';
import ReviewsGrid from './ReviewsGrid';
import FaqAccordion from './FaqAccordion';
import VideoEmbed from './VideoEmbed';
import CtaBand from './CtaBand';
import LanguageIntro from './LanguageIntro';
import NewsletterSignup from './NewsletterSignup';

// section_type → React component. Keep keys aligned with TutorPageSectionType
// in backend/models.py. New types must be added in both places.
export const SECTION_COMPONENTS = {
  hero_portrait: HeroPortrait,
  about_portrait: AboutPortrait,
  features_grid: FeaturesGrid,
  levels_alphabet: LevelsAlphabet,
  pricing_grid: PricingGrid,
  reviews_grid: ReviewsGrid,
  faq_accordion: FaqAccordion,
  video_embed: VideoEmbed,
  cta_band: CtaBand,
  language_intro: LanguageIntro,
  newsletter_signup: NewsletterSignup,
};

// Tutor-facing labels for the page builder picker.
export const SECTION_LABELS = {
  hero_portrait: 'Hero',
  about_portrait: 'About',
  features_grid: 'Features',
  levels_alphabet: 'Levels',
  pricing_grid: 'Pricing & booking',
  reviews_grid: 'Reviews',
  faq_accordion: 'FAQ',
  video_embed: 'Video',
  cta_band: 'Call to action',
  language_intro: 'Language intro',
  newsletter_signup: 'Newsletter signup',
};

// Short blurb shown in the section picker.
export const SECTION_DESCRIPTIONS = {
  hero_portrait: 'Big name + photo + intro line. Usually first.',
  about_portrait: 'Free-text "about me" block. Overrides your bio when set.',
  features_grid: 'Three columns of selling points.',
  levels_alphabet: 'Levels you teach — A1/A2/B1 or beginner/intermediate, with optional intro.',
  pricing_grid: 'Trial CTA, single lessons, lesson packs. Reads from your lesson packs.',
  reviews_grid: 'Testimonials from your students.',
  faq_accordion: 'Collapsible question/answer list.',
  video_embed: 'YouTube or Vimeo embed.',
  cta_band: 'Final "ready to start?" prompt with a button.',
  language_intro: 'Image + intro text about the language itself.',
  newsletter_signup: 'Email signup card. Visitors join your newsletter list.',
};

// Which sections take editable content vs. derive everything from APIs.
// Determines whether the dashboard shows an "Edit" button.
export const SECTION_HAS_EDITOR = {
  hero_portrait: true,
  about_portrait: true,
  features_grid: true,
  levels_alphabet: true,
  pricing_grid: true, // just a title override
  reviews_grid: true, // title + limit
  faq_accordion: true,
  video_embed: true,
  cta_band: true,
  language_intro: true,
  newsletter_signup: false, // copy comes from the tutor's newsletter prefs
};

export const ALL_SECTION_TYPES = Object.keys(SECTION_COMPONENTS);

// Per-section visual variants. The first entry in each list is the
// default — used when content.variant is unset, matching the original
// layout exactly. Section types not listed here have no variants (e.g.
// pricing_grid renders from API data; reviews/faq listed below have rich
// variants because layout matters more than content for those).
export const SECTION_VARIANTS = {
  hero_portrait: [
    { value: 'portrait_right', label: 'Portrait right (default)' },
    { value: 'portrait_left', label: 'Portrait left' },
    { value: 'centered', label: 'Centered with portrait above' },
    { value: 'minimal', label: 'Minimal — text only' },
  ],
  about_portrait: [
    { value: 'simple', label: 'Simple text (default)' },
    { value: 'with_photo', label: 'Side-by-side with photo' },
    { value: 'quote_style', label: 'Pull-quote style' },
  ],
  features_grid: [
    { value: 'cards', label: '3-column cards (default)' },
    { value: 'numbered_list', label: 'Numbered list' },
    { value: 'icon_row', label: 'Icons in a row' },
  ],
  levels_alphabet: [
    { value: 'cards', label: 'Card grid (default)' },
    { value: 'table', label: 'Compact table' },
    { value: 'pills', label: 'Pills' },
  ],
  reviews_grid: [
    { value: 'grid', label: '3-column grid (default)' },
    { value: 'wall', label: 'Masonry wall' },
    { value: 'carousel', label: 'Horizontal carousel' },
    { value: 'single_quote', label: 'Single highlighted quote' },
  ],
  faq_accordion: [
    { value: 'accordion', label: 'Expand on click (default)' },
    { value: 'inline', label: 'All open inline' },
    { value: 'two_column', label: 'Two-column Q + A' },
  ],
  cta_band: [
    { value: 'band', label: 'Gradient band (default)' },
    { value: 'centered_box', label: 'Centered card' },
    { value: 'split', label: 'Split — text + button' },
  ],
};
