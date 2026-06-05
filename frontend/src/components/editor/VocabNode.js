// Custom Lexical node for inline vocabulary tooltips.
//
// Source markdown form (round-trippable):  :::vocab[term|gloss]
//   - term: the word in the target language (shown to readers)
//   - gloss: meaning/translation (shown on hover)
//
// Renders as a span with a dashed underline; hovering shows the gloss
// via the native `title` attribute. Lightweight tooltip — we can swap
// in a richer overlay later without changing the markdown form.

import { TextNode } from 'lexical';

export class VocabNode extends TextNode {
  static getType() {
    return 'vocab';
  }

  static clone(node) {
    return new VocabNode(node.__term, node.__gloss, node.__key);
  }

  constructor(term, gloss, key) {
    super(term, key);
    this.__term = term;
    this.__gloss = gloss;
  }

  getGloss() {
    return this.__gloss;
  }

  setGloss(gloss) {
    const self = this.getWritable();
    self.__gloss = gloss;
  }

  setTerm(term) {
    const self = this.getWritable();
    self.__term = term;
    self.setTextContent(term);
  }

  // Render: wrap the term in a span with the theme's vocab class and the
  // gloss as a title attribute (native tooltip).
  createDOM(config) {
    const dom = super.createDOM(config);
    dom.className = config.theme.vocab || '';
    dom.title = this.__gloss;
    dom.setAttribute('data-vocab-gloss', this.__gloss);
    return dom;
  }

  updateDOM(prevNode, dom, config) {
    const updated = super.updateDOM(prevNode, dom, config);
    if (prevNode.__gloss !== this.__gloss) {
      dom.title = this.__gloss;
      dom.setAttribute('data-vocab-gloss', this.__gloss);
    }
    return updated;
  }

  // Lexical JSON serialization — the editor state we save to the DB.
  exportJSON() {
    return {
      ...super.exportJSON(),
      type: 'vocab',
      term: this.__term,
      gloss: this.__gloss,
      version: 1,
    };
  }

  static importJSON(json) {
    return $createVocabNode(json.term ?? json.text ?? '', json.gloss ?? '');
  }

  // Round-trip back to markdown shortcode form when the editor serializes
  // out for body_markdown storage.
  exportMarkdown() {
    return `:::vocab[${this.__term}|${this.__gloss}]`;
  }
}

export function $createVocabNode(term, gloss) {
  return new VocabNode(term, gloss).setMode('token');
}

export function $isVocabNode(node) {
  return node instanceof VocabNode;
}
