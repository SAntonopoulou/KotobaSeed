// Variant registry — the catalogue of section variants the runtime
// CustomThemeSite renderer can pick from. Each entry maps a
// `(section_type, variant_key)` pair to a default-export component
// plus the variant's `contentSchema`.
//
// Per Sophia's policy: variants ARE customer-private. Each paying
// custom-theme client gets their own bespoke pack — Vasso's variants
// are HERS only, Dafni's are HERS only, etc. The variant_key carries
// the customer prefix so it's visually obvious which pack a key
// belongs to (e.g. `vasso_gold_ring`, `dafni_editorial_warm`).
//
// A theme's design_payload_json picks variants by key. Only the
// customer's own theme references their own variant keys. Future
// "Pro pack" shared variants would live under a different prefix
// (e.g. `pack1_*`) once Sophia + designer ship those after launch.

// --- Vasso's bespoke pack ---------------------------------------------

import HeroGoldRing, {
  contentSchema as HeroGoldRingSchema,
} from './hero/GoldRing';
import FeaturesNumberedCards, {
  contentSchema as FeaturesNumberedCardsSchema,
} from './features/NumberedCards';
import LevelsGlyphAegean, {
  contentSchema as LevelsGlyphAegeanSchema,
} from './levels/GlyphAegean';
import PricingGoldRibbon, {
  contentSchema as PricingGoldRibbonSchema,
} from './pricing/GoldRibbon';
import AboutTestimonialQuote, {
  contentSchema as AboutTestimonialQuoteSchema,
} from './about/TestimonialQuote';
import ReviewsAvatarCards, {
  contentSchema as ReviewsAvatarCardsSchema,
} from './reviews/AvatarCards';

// --- Dafni's bespoke pack --------------------------------------------

import HeroEditorialWarm, {
  contentSchema as HeroEditorialWarmSchema,
} from '../dafni_botanical/variants/HeroEditorialWarm';
import FeaturesLeafDividers, {
  contentSchema as FeaturesLeafDividersSchema,
} from '../dafni_botanical/variants/FeaturesLeafDividers';
import LevelsLeafPillars, {
  contentSchema as LevelsLeafPillarsSchema,
} from '../dafni_botanical/variants/LevelsLeafPillars';
import PricingSingleColumnList, {
  contentSchema as PricingSingleColumnListSchema,
} from '../dafni_botanical/variants/PricingSingleColumnList';
import AboutLongFormDropcap, {
  contentSchema as AboutLongFormDropcapSchema,
} from '../dafni_botanical/variants/AboutLongFormDropcap';
import ReviewsQuietQuotes, {
  contentSchema as ReviewsQuietQuotesSchema,
} from '../dafni_botanical/variants/ReviewsQuietQuotes';

// --- Mary's bespoke pack (Meadow) ------------------------------------

import HeroLoveLetter, {
  contentSchema as HeroLoveLetterSchema,
} from '../mary_meadow/variants/HeroLoveLetter';
import FeaturesPostcardStack, {
  contentSchema as FeaturesPostcardStackSchema,
} from '../mary_meadow/variants/FeaturesPostcardStack';
import LevelsGardenBeds, {
  contentSchema as LevelsGardenBedsSchema,
} from '../mary_meadow/variants/LevelsGardenBeds';
import PricingTeaParty, {
  contentSchema as PricingTeaPartySchema,
} from '../mary_meadow/variants/PricingTeaParty';
import AboutLetterBox, {
  contentSchema as AboutLetterBoxSchema,
} from '../mary_meadow/variants/AboutLetterBox';
import ReviewsScrapbook, {
  contentSchema as ReviewsScrapbookSchema,
} from '../mary_meadow/variants/ReviewsScrapbook';

// --- Sophia's bespoke pack (Inkwell) ---------------------------------

import HeroInkwellLiterary, {
  contentSchema as HeroInkwellLiterarySchema,
} from '../sophia_inkwell/variants/HeroInkwellLiterary';
import FeaturesEditorialCards, {
  contentSchema as FeaturesEditorialCardsSchema,
} from '../sophia_inkwell/variants/FeaturesEditorialCards';
import LevelsDeepInkwell, {
  contentSchema as LevelsDeepInkwellSchema,
} from '../sophia_inkwell/variants/LevelsDeepInkwell';
import PricingInkwellTrio, {
  contentSchema as PricingInkwellTrioSchema,
} from '../sophia_inkwell/variants/PricingInkwellTrio';
import AboutEssayDropcap, {
  contentSchema as AboutEssayDropcapSchema,
} from '../sophia_inkwell/variants/AboutEssayDropcap';
import ReviewsInkwellQuotes, {
  contentSchema as ReviewsInkwellQuotesSchema,
} from '../sophia_inkwell/variants/ReviewsInkwellQuotes';

// --- Public variants (available to every theme) ----------------------

import NewsletterSignup from '../../components/tutor_sections/NewsletterSignup';

const NewsletterSignupVariantSchema = {
  type: 'object',
  properties: {
    wrapper_class: {
      type: 'string',
      title: 'Wrapper CSS class (advanced)',
      description: 'Optional Tailwind classes for the section wrapper. Leave blank for the default centered card.',
    },
  },
};

export const VARIANT_REGISTRY = {
  hero_portrait: {
    vasso_gold_ring: {
      component: HeroGoldRing,
      contentSchema: HeroGoldRingSchema,
      owner: 'vasso',
      label: 'Gold-ring portrait',
      description: "Vasso's bespoke hero — gold conic-gradient ring around the portrait + floating pills + sun decoration.",
    },
    dafni_editorial_warm: {
      component: HeroEditorialWarm,
      contentSchema: HeroEditorialWarmSchema,
      owner: 'dafni',
      label: 'Editorial warm',
      description: "Dafni's bespoke hero — large editorial photo, serif typography, generous whitespace, one quiet sage ring decoration.",
    },
    sophia_inkwell_literary: {
      component: HeroInkwellLiterary,
      contentSchema: HeroInkwellLiterarySchema,
      owner: 'sophia',
      label: 'Inkwell literary',
      description: "Sophia's bespoke hero — Playfair display, deep navy + coral palette, hand-drawn calligraphic ink-stroke flourish behind the portrait, floating level + booking pills.",
    },
    mary_love_letter: {
      component: HeroLoveLetter,
      contentSchema: HeroLoveLetterSchema,
      owner: 'mary',
      label: 'Love letter',
      description: "Mary's bespoke hero — handwritten Caveat greeting, oval-frame portrait with a honey ribbon + dashed cottagecore stamp, garden-vine SVG sweeping behind the columns.",
    },
  },
  features_grid: {
    vasso_numbered_cards: {
      component: FeaturesNumberedCards,
      contentSchema: FeaturesNumberedCardsSchema,
      owner: 'vasso',
      label: 'Numbered step cards',
      description: "Vasso's bespoke features — three numbered cards with brand-tinted icon tiles.",
    },
    dafni_leaf_dividers: {
      component: FeaturesLeafDividers,
      contentSchema: FeaturesLeafDividersSchema,
      owner: 'dafni',
      label: 'Leaf-stem dividers',
      description: "Dafni's bespoke features — vertical stack of numbered steps with hand-drawn sage leaf-stem dividers between.",
    },
    sophia_editorial_cards: {
      component: FeaturesEditorialCards,
      contentSchema: FeaturesEditorialCardsSchema,
      owner: 'sophia',
      label: 'Editorial three-up cards',
      description: "Sophia's bespoke features — three editorial cards side by side with italic coral Playfair numerals.",
    },
    mary_postcard_stack: {
      component: FeaturesPostcardStack,
      contentSchema: FeaturesPostcardStackSchema,
      owner: 'mary',
      label: 'Postcard stack',
      description: "Mary's bespoke features — three gently tilted postcards with honey-coloured numbered stamps and a soft cottage palette.",
    },
  },
  levels_alphabet: {
    vasso_glyph_aegean: {
      component: LevelsGlyphAegean,
      contentSchema: LevelsGlyphAegeanSchema,
      owner: 'vasso',
      label: 'Alphabet glyphs on aegean',
      description: "Vasso's bespoke levels — three CEFR cards on a deep aegean background with script glyphs.",
    },
    dafni_leaf_pillars: {
      component: LevelsLeafPillars,
      contentSchema: LevelsLeafPillarsSchema,
      owner: 'dafni',
      label: 'Leaf pillar cards',
      description: "Dafni's bespoke levels — vertical stack of cream cards with botanical leaf SVGs on the left.",
    },
    sophia_deep_inkwell: {
      component: LevelsDeepInkwell,
      contentSchema: LevelsDeepInkwellSchema,
      owner: 'sophia',
      label: 'Deep inkwell glass cards',
      description: "Sophia's bespoke levels — three glass-effect cards on a dramatic deep navy section with italic coral CEFR glyphs.",
    },
    mary_garden_beds: {
      component: LevelsGardenBeds,
      contentSchema: LevelsGardenBedsSchema,
      owner: 'mary',
      label: 'Garden bed cards',
      description: "Mary's bespoke levels — three cottage cards with a blush-honey glyph circle on top, sprout bullets, and a striped-soil bottom border.",
    },
  },
  pricing_grid: {
    vasso_gold_ribbon: {
      component: PricingGoldRibbon,
      contentSchema: PricingGoldRibbonSchema,
      owner: 'vasso',
      label: 'Taster + membership + pack (gold ribbon)',
      description: "Vasso's bespoke pricing — three cards with the featured plan highlighted by a gold ribbon.",
    },
    dafni_single_column_list: {
      component: PricingSingleColumnList,
      contentSchema: PricingSingleColumnListSchema,
      owner: 'dafni',
      label: 'Single-column list',
      description: "Dafni's bespoke pricing — single centred column with hand-drawn botanical squiggle dividers between offerings.",
    },
    sophia_inkwell_trio: {
      component: PricingInkwellTrio,
      contentSchema: PricingInkwellTrioSchema,
      owner: 'sophia',
      label: 'Inkwell three-up trio',
      description: "Sophia's bespoke pricing — three editorial cards side by side, membership plan lifted as a deep coral panel.",
    },
    mary_tea_party: {
      component: PricingTeaParty,
      contentSchema: PricingTeaPartySchema,
      owner: 'mary',
      label: 'Tea-party cards',
      description: "Mary's bespoke pricing — soft cottagecore cards with a honey ribbon on the featured plan and an inviting tea-party feel.",
    },
  },
  about_portrait: {
    vasso_testimonial_quote: {
      component: AboutTestimonialQuote,
      contentSchema: AboutTestimonialQuoteSchema,
      owner: 'vasso',
      label: 'Portrait + first-person quote',
      description: "Vasso's bespoke about — gold-ringed portrait next to a display-font blockquote.",
    },
    dafni_long_form_dropcap: {
      component: AboutLongFormDropcap,
      contentSchema: AboutLongFormDropcapSchema,
      owner: 'dafni',
      label: 'Long-form essay with drop cap',
      description: "Dafni's bespoke about — centred square portrait above an essay-style bio with a serif drop cap.",
    },
    sophia_essay_dropcap: {
      component: AboutEssayDropcap,
      contentSchema: AboutEssayDropcapSchema,
      owner: 'sophia',
      label: 'Essay with coral drop cap',
      description: "Sophia's bespoke about — centred circular portrait above a long-form essay with a large italic coral Playfair drop cap.",
    },
    mary_letter_box: {
      component: AboutLetterBox,
      contentSchema: AboutLetterBoxSchema,
      owner: 'mary',
      label: 'Letter-box bio',
      description: "Mary's bespoke about — centred circular portrait above a letter-styled bio with a blush DM Serif drop cap and a handwritten Caveat sign-off.",
    },
  },
  reviews_grid: {
    vasso_avatar_cards: {
      component: ReviewsAvatarCards,
      contentSchema: ReviewsAvatarCardsSchema,
      owner: 'vasso',
      label: 'Avatar testimonial grid',
      description: "Vasso's bespoke reviews — colour-cycled avatar cards in a responsive grid.",
    },
    dafni_quiet_quotes: {
      component: ReviewsQuietQuotes,
      contentSchema: ReviewsQuietQuotesSchema,
      owner: 'dafni',
      label: 'Quiet italic quotes',
      description: "Dafni's bespoke reviews — single column of large italic Fraunces quotes with subtle sage opening marks.",
    },
    sophia_inkwell_quotes: {
      component: ReviewsInkwellQuotes,
      contentSchema: ReviewsInkwellQuotesSchema,
      owner: 'sophia',
      label: 'Inkwell italic quotes',
      description: "Sophia's bespoke reviews — single column of large italic Playfair quotes with giant coral opening quote-marks and coral left-rules.",
    },
    mary_scrapbook: {
      component: ReviewsScrapbook,
      contentSchema: ReviewsScrapbookSchema,
      owner: 'mary',
      label: 'Scrapbook grid',
      description: "Mary's bespoke reviews — a grid of gently tilted scrapbook cards with washi-tape headers and italic DM Serif quotes.",
    },
  },
  newsletter_signup: {
    public_card: {
      component: NewsletterSignup,
      contentSchema: NewsletterSignupVariantSchema,
      owner: 'public',
      label: 'Newsletter signup card',
      description: 'Email-signup CTA. Headline + pitch come from the tutor\'s newsletter preferences.',
    },
  },
};

export function getVariant(sectionType, variantKey) {
  return VARIANT_REGISTRY[sectionType]?.[variantKey] || null;
}

export function listSectionTypes() {
  return Object.keys(VARIANT_REGISTRY);
}

// `owner` filter so the admin theme editor only shows variants the
// currently-editing customer owns. Pass `'public'` (or `null`) to
// show every variant. Without filtering, variants from other
// customers' bespoke packs would appear in the dropdown for editors
// they don't belong to.
export function listVariantsFor(sectionType, owner = null) {
  const map = VARIANT_REGISTRY[sectionType] || {};
  return Object.entries(map)
    .filter(([, def]) => !owner || def.owner === owner || def.owner === 'public')
    .map(([key, def]) => ({
      key,
      label: def.label,
      description: def.description,
      owner: def.owner,
    }));
}
