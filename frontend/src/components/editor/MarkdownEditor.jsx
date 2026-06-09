import React, { useEffect, useRef } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListNode, ListItemNode } from '@lexical/list';
import { LinkNode } from '@lexical/link';
import { CodeNode } from '@lexical/code';
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
} from '@lexical/markdown';
import editorTheme from './editorTheme';
import EditorToolbar from './EditorToolbar';
import { VocabNode } from './VocabNode';
import { ALL_TRANSFORMERS } from './markdownTransforms';

// Plugin that loads the initial Lexical JSON (or falls back to markdown
// when only markdown is available — e.g. a fresh article being edited
// before the editor was upgraded).
const InitialContentPlugin = ({ initialLexicalJson, initialMarkdown }) => {
  const [editor] = useLexicalComposerContext();
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    if (initialLexicalJson) {
      try {
        const state = editor.parseEditorState(initialLexicalJson);
        editor.setEditorState(state);
        return;
      } catch (err) {
        console.warn('Could not parse Lexical JSON, falling back to markdown', err);
      }
    }
    if (initialMarkdown) {
      editor.update(() => {
        $convertFromMarkdownString(initialMarkdown, ALL_TRANSFORMERS);
      });
    }
  }, [editor, initialLexicalJson, initialMarkdown]);

  return null;
};

const Placeholder = ({ text }) => (
  <div className="absolute top-0 left-0 px-4 py-3 text-kotoba-text/40 pointer-events-none select-none">
    {text}
  </div>
);

// Main editor. `onChange` fires with both serialized forms so the parent
// can save body_markdown + lexical_json together.
const MarkdownEditor = ({
  initialMarkdown = '',
  initialLexicalJson = null,
  onChange,
  enableVocab = true,
  minHeight = 400,
  placeholder = 'Write something…',
}) => {
  const handleChange = (editorState, editor) => {
    if (!onChange) return;
    editorState.read(() => {
      const markdown = $convertToMarkdownString(ALL_TRANSFORMERS);
      const lexicalJson = JSON.stringify(editorState.toJSON());
      onChange({ markdown, lexicalJson });
    });
  };

  const initialConfig = {
    namespace: 'kotobaseed-article',
    theme: editorTheme,
    nodes: [
      HeadingNode,
      QuoteNode,
      ListNode,
      ListItemNode,
      LinkNode,
      CodeNode,
      VocabNode,
    ],
    onError: (error) => {
      console.error('Lexical error', error);
    },
  };

  return (
    <div className="border border-kotoba-text/15 rounded-lg overflow-hidden bg-white">
      <LexicalComposer initialConfig={initialConfig}>
        <EditorToolbar enableVocab={enableVocab} />
        <div className="relative">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                className="px-4 py-3 outline-none prose prose-sm max-w-none focus:outline-none"
                style={{ minHeight }}
              />
            }
            placeholder={<Placeholder text={placeholder} />}
            ErrorBoundary={LexicalErrorBoundary}
          />
        </div>
        <HistoryPlugin />
        <ListPlugin />
        <LinkPlugin />
        {/* Live markdown shortcuts — typing `# `, `**`, `> `, etc. */}
        <MarkdownShortcutPlugin transformers={ALL_TRANSFORMERS} />
        <InitialContentPlugin
          initialLexicalJson={initialLexicalJson}
          initialMarkdown={initialMarkdown}
        />
        <OnChangePlugin onChange={handleChange} />
      </LexicalComposer>
    </div>
  );
};

export default MarkdownEditor;
