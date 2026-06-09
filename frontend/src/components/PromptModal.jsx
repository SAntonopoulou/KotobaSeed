import React, { useEffect, useRef, useState } from 'react';

// Styled multi-line prompt — replaces window.prompt() for admin notes
// on report resolution and verification reject. window.prompt freezes
// the JS thread, has no styling, no multi-line input, and looks like a
// browser dialog instead of a Kotobaseed surface.
//
// Usage:
//   const [open, setOpen] = useState(false);
//   <PromptModal
//     open={open}
//     title="Resolve report"
//     description="Optional note for the audit log."
//     submitLabel="Resolve"
//     onCancel={() => setOpen(false)}
//     onSubmit={(note) => { setOpen(false); resolve(note); }}
//   />
const PromptModal = ({
  open,
  title,
  description,
  placeholder = '',
  submitLabel = 'Submit',
  cancelLabel = 'Cancel',
  isDanger = false,
  onCancel,
  onSubmit,
  required = false,
}) => {
  const [value, setValue] = useState('');
  const textareaRef = useRef(null);

  useEffect(() => {
    if (open) {
      setValue('');
      // Defer focus until the modal is in the DOM.
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [open]);

  if (!open) return null;

  const submitDisabled = required && !value.trim();
  const submitClass = isDanger
    ? 'bg-red-600 hover:bg-red-700 text-white'
    : 'bg-kotoba-primary hover:bg-kotoba-primary/90 text-white';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
        <h3 className="text-lg font-bold text-kotoba-text">{title}</h3>
        {description && (
          <p className="text-sm text-kotoba-text/70">{description}</p>
        )}
        <textarea
          ref={textareaRef}
          rows="4"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          maxLength={1000}
          className="w-full border border-kotoba-text/20 rounded-md py-2 px-3 focus:outline-none focus:ring-kotoba-primary focus:border-kotoba-primary"
        />
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-md border border-kotoba-text/20 text-kotoba-text/80 hover:bg-kotoba-background/40"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => onSubmit(value.trim())}
            disabled={submitDisabled}
            className={`px-4 py-2 rounded-md disabled:opacity-50 ${submitClass}`}
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PromptModal;
