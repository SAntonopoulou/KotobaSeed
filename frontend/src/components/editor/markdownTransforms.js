// Custom markdown transformers for our `:::vocab` block. Lexical's
// @lexical/markdown ships with all the standard markdown↔node transforms
// (headings, bold, italic, lists, links, code, quote); we add a TEXT_MATCH
// transformer for the vocab shortcode.
//
// Source form:  :::vocab[term|gloss]
//   - matches `:::vocab[<anything until ]>]`
//   - splits on the first `|` between brackets
//
// Round-trips both ways:
//   markdown → Lexical: regexpStart matches, replace consumes the text
//   Lexical → markdown: export returns `:::vocab[term|gloss]`

import { TRANSFORMERS } from '@lexical/markdown';
import { $createVocabNode, $isVocabNode } from './VocabNode';

const VOCAB_TRANSFORMER = {
  dependencies: [],
  type: 'text-match',
  // Regex: ::: vocab [ term | gloss ]
  // The outer `[]` are literal; we capture the term + gloss greedily up
  // to the next `]`. Term + gloss themselves can contain anything except
  // the pipe and the closing bracket.
  regExp: /:::vocab\[([^|\]]+)\|([^\]]+)\]/,
  importRegExp: /:::vocab\[([^|\]]+)\|([^\]]+)\]/,
  replace: (textNode, match) => {
    const [, term, gloss] = match;
    const vocab = $createVocabNode(term.trim(), gloss.trim());
    textNode.replace(vocab);
  },
  export: (node) => {
    if (!$isVocabNode(node)) return null;
    return `:::vocab[${node.getTextContent()}|${node.getGloss()}]`;
  },
  trigger: ']',
};

// Compose with stock transformers. Custom one goes first so it has
// priority over plain-text matching in case of overlap.
export const ALL_TRANSFORMERS = [VOCAB_TRANSFORMER, ...TRANSFORMERS];
