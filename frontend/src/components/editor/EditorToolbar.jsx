import React, { useCallback, useEffect, useState } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  SELECTION_CHANGE_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
} from 'lexical';
import { $setBlocksType } from '@lexical/selection';
import { $createHeadingNode, $createQuoteNode } from '@lexical/rich-text';
import { $createParagraphNode } from 'lexical';
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
} from '@lexical/list';
import { TOGGLE_LINK_COMMAND } from '@lexical/link';
import { $createVocabNode } from './VocabNode';

const Btn = ({ active, onClick, title, children, disabled }) => (
  <button
    type="button"
    onMouseDown={(e) => e.preventDefault()}
    onClick={onClick}
    title={title}
    disabled={disabled}
    className={`px-2 py-1 rounded text-sm font-medium transition-colors ${
      active
        ? 'bg-kotoba-primary text-white'
        : 'text-kotoba-text hover:bg-kotoba-background'
    } disabled:opacity-40`}
  >
    {children}
  </button>
);

const Sep = () => <span className="w-px h-5 bg-kotoba-text/15 mx-1" />;

const EditorToolbar = () => {
  const [editor] = useLexicalComposerContext();
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);

  // Watch selection so the format buttons reflect what's at the caret.
  const $updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      setIsBold(selection.hasFormat('bold'));
      setIsItalic(selection.hasFormat('italic'));
      setIsUnderline(selection.hasFormat('underline'));
    }
  }, []);

  useEffect(() => {
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        editor.getEditorState().read($updateToolbar);
        return false;
      },
      1,
    );
  }, [editor, $updateToolbar]);

  const setBlock = (creator) => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        $setBlocksType(selection, creator);
      }
    });
  };

  const setParagraph = () => setBlock(() => $createParagraphNode());
  const setHeading = (tag) => setBlock(() => $createHeadingNode(tag));
  const setQuote = () => setBlock(() => $createQuoteNode());

  const formatText = (fmt) =>
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, fmt);

  const insertLink = () => {
    const url = window.prompt('Link URL:');
    if (!url) return;
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, url);
  };

  const insertVocab = () => {
    const term = window.prompt('Word in the target language:');
    if (!term) return;
    const gloss = window.prompt('Meaning / translation (shown on hover):');
    if (!gloss) return;
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        selection.insertNodes([$createVocabNode(term.trim(), gloss.trim())]);
      }
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5 p-2 bg-white border-b border-kotoba-text/10 sticky top-0 z-10">
      <Btn onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)} title="Undo">↶</Btn>
      <Btn onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)} title="Redo">↷</Btn>
      <Sep />
      <Btn onClick={setParagraph} title="Paragraph">P</Btn>
      <Btn onClick={() => setHeading('h1')} title="Heading 1">H1</Btn>
      <Btn onClick={() => setHeading('h2')} title="Heading 2">H2</Btn>
      <Btn onClick={() => setHeading('h3')} title="Heading 3">H3</Btn>
      <Sep />
      <Btn active={isBold} onClick={() => formatText('bold')} title="Bold">B</Btn>
      <Btn active={isItalic} onClick={() => formatText('italic')} title="Italic">I</Btn>
      <Btn active={isUnderline} onClick={() => formatText('underline')} title="Underline">U</Btn>
      <Sep />
      <Btn onClick={() => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)} title="Bulleted list">•</Btn>
      <Btn onClick={() => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)} title="Numbered list">1.</Btn>
      <Btn onClick={setQuote} title="Quote">❝</Btn>
      <Sep />
      <Btn onClick={insertLink} title="Insert link">🔗</Btn>
      <Btn onClick={insertVocab} title="Insert vocab tooltip">📖 Vocab</Btn>
    </div>
  );
};

export default EditorToolbar;
