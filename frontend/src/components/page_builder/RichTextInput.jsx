import React, { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';

// Rich text input for the page builder's prose-heavy fields (hero deck,
// about body, FAQ answers, CTA copy). Renders TipTap with a minimal,
// magazine-ready toolbar — bold, italic, link, bulleted list, heading
// (h2, since blocks already render h1 themselves). The value flows as
// HTML so the public block renderers can drop it through
// dangerouslySetInnerHTML without round-tripping markdown.
//
// Why HTML instead of TipTap's JSON: the section renderers in
// components/tutor_sections/* are static and theme-aware; they expect
// strings they can dangerouslySetInnerHTML or render as text. HTML keeps
// the rendering surface unchanged. If we ever want JSON for richer
// rendering (callouts, embeds), we can swap later — the editor abstracts
// it out.

const TOOLBAR_BTN =
  'px-2 py-1 text-xs rounded text-kotoba-text/70 hover:text-kotoba-text hover:bg-kotoba-background/80 disabled:opacity-30';

const TOOLBAR_BTN_ACTIVE =
  'px-2 py-1 text-xs rounded text-kotoba-primary bg-kotoba-primary/10';

const RichTextInput = ({
  label,
  value,
  onChange,
  placeholder = 'Write something…',
  minHeight = '8rem',
}) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        // The blocks have their own surrounding card design; let TipTap
        // worry about the inline + flow content, not the chrome.
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: {
          rel: 'noopener noreferrer',
          target: '_blank',
        },
      }),
      Placeholder.configure({
        placeholder,
        showOnlyWhenEditable: true,
      }),
    ],
    content: value || '',
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      // Empty paragraph normalised back to empty string so callers can
      // distinguish "I cleared it" from "I never typed".
      onChange(html === '<p></p>' ? '' : html);
    },
    editorProps: {
      attributes: {
        class:
          'prose prose-sm max-w-none focus:outline-none px-3 py-2.5 leading-relaxed',
      },
    },
  });

  // External value changes (e.g. switching sections, resetting to default)
  // need to flow into the editor without triggering an extra onUpdate.
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (current === value) return;
    if (!value && current === '<p></p>') return;
    editor.commands.setContent(value || '', { emitUpdate: false });
  }, [value, editor]);

  if (!editor) {
    return (
      <div>
        {label && (
          <label className="block text-xs font-medium text-kotoba-text/70 mb-1">
            {label}
          </label>
        )}
        <div
          className="border border-kotoba-text/20 rounded text-sm bg-kotoba-background/30 animate-pulse"
          style={{ minHeight }}
        />
      </div>
    );
  }

  const openLink = () => {
    const prev = editor.getAttributes('link').href;
    const url = window.prompt('Link URL', prev || 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <div>
      {label && (
        <label className="block text-xs font-medium text-kotoba-text/70 mb-1">
          {label}
        </label>
      )}
      <div className="border border-kotoba-text/20 rounded focus-within:ring-2 focus-within:ring-kotoba-primary">
        <div
          className="flex flex-wrap items-center gap-1 px-2 py-1.5 border-b border-kotoba-text/10 bg-kotoba-background/30"
          role="toolbar"
          aria-label="Formatting toolbar"
        >
          <ToolbarButton
            label="B"
            title="Bold"
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
            className="font-bold"
          />
          <ToolbarButton
            label="I"
            title="Italic"
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className="italic"
          />
          <ToolbarSep />
          <ToolbarButton
            label="H2"
            title="Heading"
            active={editor.isActive('heading', { level: 2 })}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
          />
          <ToolbarButton
            label="• List"
            title="Bulleted list"
            active={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          />
          <ToolbarButton
            label="Quote"
            title="Blockquote"
            active={editor.isActive('blockquote')}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          />
          <ToolbarSep />
          <ToolbarButton
            label="Link"
            title="Add or remove link"
            active={editor.isActive('link')}
            onClick={openLink}
          />
          <ToolbarSep />
          <ToolbarButton
            label="↺"
            title="Undo"
            active={false}
            disabled={!editor.can().undo()}
            onClick={() => editor.chain().focus().undo().run()}
          />
          <ToolbarButton
            label="↻"
            title="Redo"
            active={false}
            disabled={!editor.can().redo()}
            onClick={() => editor.chain().focus().redo().run()}
          />
        </div>
        <div className="bg-white" style={{ minHeight }}>
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
};

const ToolbarButton = ({
  label,
  title,
  active,
  disabled,
  onClick,
  className = '',
}) => (
  <button
    type="button"
    title={title}
    onMouseDown={(e) => {
      // Prevent the editor losing focus when clicking the toolbar.
      e.preventDefault();
    }}
    onClick={onClick}
    disabled={disabled}
    className={`${active ? TOOLBAR_BTN_ACTIVE : TOOLBAR_BTN} ${className}`}
  >
    {label}
  </button>
);

const ToolbarSep = () => (
  <span aria-hidden className="w-px h-4 bg-kotoba-text/15 mx-1" />
);

export default RichTextInput;
