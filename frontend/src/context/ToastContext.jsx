import React, { createContext, useState, useContext, useCallback, useRef, useEffect } from 'react';

const ToastContext = createContext();

export const useToast = () => useContext(ToastContext);

const TONES = {
  info: 'bg-kotoba-primary',
  success: 'bg-green-600',
  error: 'bg-red-600',
};

// Toast model: { id, message, type, undo: { label, onUndo } | null, timeout }
// `addToast(message, type)` keeps the original short-form API. Pass an
// object instead to get the full surface:
//   addToast({ message, type: 'success', undo: { onUndo, label?, timeout? } })
// `onUndo` is called only if the user clicks the undo button before the
// toast auto-dismisses. We deliberately don't expose dismissal — once
// the toast fades, the action is committed.

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  // Track active dismiss timers so an undo click can cancel them.
  const timers = useRef(new Map());

  const removeToast = useCallback((id) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback((messageOrOptions, type = 'info') => {
    const opts =
      typeof messageOrOptions === 'string'
        ? { message: messageOrOptions, type }
        : messageOrOptions;
    const id = Date.now() + Math.random();
    const timeout = opts.timeout ?? (opts.undo ? 8000 : 3000);
    const entry = {
      id,
      message: opts.message,
      type: opts.type || 'info',
      undo: opts.undo
        ? {
            label: opts.undo.label || 'Undo',
            onUndo: opts.undo.onUndo,
          }
        : null,
    };
    setToasts((prev) => [...prev, entry]);
    const t = setTimeout(() => removeToast(id), timeout);
    timers.current.set(id, t);
    return id;
  }, [removeToast]);

  useEffect(() => {
    return () => {
      // Clean up any in-flight timers on unmount.
      timers.current.forEach((t) => clearTimeout(t));
      timers.current.clear();
    };
  }, []);

  const handleUndo = (toast) => {
    if (toast.undo?.onUndo) {
      try {
        toast.undo.onUndo();
      } catch (err) {
        // The caller's undo is best-effort — surface the failure but
        // don't hold the toast open since the original timer may have
        // already fired.
        console.error('undo handler failed', err);
      }
    }
    removeToast(toast.id);
  };

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="fixed top-4 right-4 z-[55] flex flex-col space-y-2 max-w-sm">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`px-4 py-3 rounded shadow-lg text-white flex items-center justify-between gap-3 transition-all duration-300 ${
              TONES[toast.type] || TONES.info
            }`}
          >
            <span className="flex-1">{toast.message}</span>
            {toast.undo && (
              <button
                type="button"
                onClick={() => handleUndo(toast)}
                className="px-3 py-1 rounded bg-white/20 hover:bg-white/30 text-white text-sm font-semibold"
              >
                {toast.undo.label}
              </button>
            )}
            <button
              onClick={() => removeToast(toast.id)}
              aria-label="Dismiss"
              className="text-white/80 hover:text-white focus:outline-none"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
