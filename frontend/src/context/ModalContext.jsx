import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

// Imperative replacement for window.confirm / window.prompt / window.alert.
// Every component just calls `const ok = await confirm({ message })` and
// gets a promise. One modal slot is mounted by the provider — only one
// dialog can be open at a time (matching native browser behaviour).
//
// Why a context: hooks need React state; native confirm() blocks the
// event loop and that's specifically the behaviour we don't want.

const ModalContext = createContext(null);

export function useModal() {
  const ctx = useContext(ModalContext);
  if (!ctx) {
    throw new Error('useModal must be used inside <ModalProvider>');
  }
  return ctx;
}

// Convenience hooks — match the window.* shape so refactors stay tidy.
export function useConfirm() {
  return useModal().confirm;
}

export function usePrompt() {
  return useModal().prompt;
}

export function useAlertDialog() {
  return useModal().alert;
}

const ModalShell = ({ open, onDismiss, children }) => {
  // ESC to dismiss + focus trap basics. We keep the trap shallow — the
  // primary action button is auto-focused on mount so keyboard-only users
  // can confirm/cancel without touching the mouse.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onDismiss();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onDismiss]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onDismiss}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
};

const ConfirmDialog = ({ data, onResolve }) => {
  const { title, message, confirmText, cancelText, destructive } = data;
  return (
    <ModalShell open={!!data} onDismiss={() => onResolve(false)}>
      {title && (
        <h2 className="text-lg font-bold text-kotoba-primary mb-2">{title}</h2>
      )}
      <p className="text-kotoba-text whitespace-pre-line leading-relaxed">{message}</p>
      <div className="mt-6 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => onResolve(false)}
          className="px-4 py-2 rounded-md text-kotoba-text/70 hover:text-kotoba-text"
        >
          {cancelText}
        </button>
        <button
          type="button"
          autoFocus
          onClick={() => onResolve(true)}
          className={`px-5 py-2 rounded-md font-semibold text-white ${
            destructive
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-kotoba-primary hover:bg-kotoba-primary/90'
          }`}
        >
          {confirmText}
        </button>
      </div>
    </ModalShell>
  );
};

const PromptDialog = ({ data, onResolve }) => {
  const { title, message, placeholder, confirmText, cancelText, multiline, defaultValue } = data;
  const [value, setValue] = useState(defaultValue || '');
  const Input = multiline ? 'textarea' : 'input';
  return (
    <ModalShell open={!!data} onDismiss={() => onResolve(null)}>
      {title && (
        <h2 className="text-lg font-bold text-kotoba-primary mb-2">{title}</h2>
      )}
      {message && <p className="text-kotoba-text leading-relaxed mb-3 whitespace-pre-line">{message}</p>}
      <Input
        type={multiline ? undefined : 'text'}
        rows={multiline ? 5 : undefined}
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder || ''}
        onKeyDown={(e) => {
          if (!multiline && e.key === 'Enter') {
            e.preventDefault();
            onResolve(value);
          }
        }}
        className="w-full px-3 py-2 border border-kotoba-text/20 rounded text-sm focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
      />
      <div className="mt-6 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => onResolve(null)}
          className="px-4 py-2 rounded-md text-kotoba-text/70 hover:text-kotoba-text"
        >
          {cancelText}
        </button>
        <button
          type="button"
          onClick={() => onResolve(value)}
          className="px-5 py-2 rounded-md font-semibold text-white bg-kotoba-primary hover:bg-kotoba-primary/90"
        >
          {confirmText}
        </button>
      </div>
    </ModalShell>
  );
};

const AlertDialog = ({ data, onResolve }) => {
  const { title, message, confirmText } = data;
  return (
    <ModalShell open={!!data} onDismiss={() => onResolve()}>
      {title && (
        <h2 className="text-lg font-bold text-kotoba-primary mb-2">{title}</h2>
      )}
      <p className="text-kotoba-text whitespace-pre-line leading-relaxed">{message}</p>
      <div className="mt-6 flex justify-end">
        <button
          type="button"
          autoFocus
          onClick={() => onResolve()}
          className="px-5 py-2 rounded-md font-semibold text-white bg-kotoba-primary hover:bg-kotoba-primary/90"
        >
          {confirmText}
        </button>
      </div>
    </ModalShell>
  );
};

export const ModalProvider = ({ children }) => {
  // Active modal lives here. Only one can be open at a time — callers
  // await the previous one before opening another.
  const [confirmState, setConfirmState] = useState(null);
  const [promptState, setPromptState] = useState(null);
  const [alertState, setAlertState] = useState(null);

  const confirm = useCallback((opts) => {
    return new Promise((resolve) => {
      setConfirmState({
        title: opts?.title,
        message: typeof opts === 'string' ? opts : opts.message,
        confirmText: opts?.confirmText || 'Confirm',
        cancelText: opts?.cancelText || 'Cancel',
        destructive: opts?.destructive ?? false,
        resolve,
      });
    });
  }, []);

  const prompt = useCallback((opts) => {
    return new Promise((resolve) => {
      setPromptState({
        title: opts?.title,
        message: typeof opts === 'string' ? opts : opts.message,
        placeholder: opts?.placeholder,
        defaultValue: opts?.defaultValue,
        confirmText: opts?.confirmText || 'OK',
        cancelText: opts?.cancelText || 'Cancel',
        multiline: opts?.multiline ?? false,
        resolve,
      });
    });
  }, []);

  const alert = useCallback((opts) => {
    return new Promise((resolve) => {
      setAlertState({
        title: opts?.title,
        message: typeof opts === 'string' ? opts : opts.message,
        confirmText: opts?.confirmText || 'OK',
        resolve,
      });
    });
  }, []);

  return (
    <ModalContext.Provider value={{ confirm, prompt, alert }}>
      {children}
      {confirmState && (
        <ConfirmDialog
          data={confirmState}
          onResolve={(result) => {
            const { resolve } = confirmState;
            setConfirmState(null);
            resolve(result);
          }}
        />
      )}
      {promptState && (
        <PromptDialog
          data={promptState}
          onResolve={(result) => {
            const { resolve } = promptState;
            setPromptState(null);
            resolve(result);
          }}
        />
      )}
      {alertState && (
        <AlertDialog
          data={alertState}
          onResolve={() => {
            const { resolve } = alertState;
            setAlertState(null);
            resolve();
          }}
        />
      )}
    </ModalContext.Provider>
  );
};

export default ModalProvider;
