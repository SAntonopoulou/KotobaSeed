import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
// Initialise i18n before the app renders. Import-for-side-effects pattern —
// the bootstrap inside ./i18n calls i18n.init() at module load.
import './i18n'

// Sentry — only initialises if VITE_SENTRY_DSN is set. Otherwise the SDK
// is imported but never sends, so we don't add network noise locally.
if (import.meta.env.VITE_SENTRY_DSN) {
  import('@sentry/react').then(
    ({ init, browserTracingIntegration, replayIntegration }) => {
      init({
        dsn: import.meta.env.VITE_SENTRY_DSN,
        // SENTRY_ENVIRONMENT is the stable label across both prod +
        // staging builds. import.meta.env.MODE is "production" for both
        // and would erase the distinction in Sentry. Falls back to
        // MODE when the explicit env var is missing.
        environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE,
        // Release identifier — CI writes the git SHA into this env var
        // at build time and the matching sentry-cli call associates
        // source maps with the same release.
        release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
        tracesSampleRate: 0.1,
        // Session replay on error only — captures the last 30 seconds
        // before an exception so we can see what the user did. No
        // recording on healthy sessions (zero performance / privacy
        // cost when nothing breaks).
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 1.0,
        integrations: [
          browserTracingIntegration(),
          replayIntegration({
            // Mask user-entered text + media so we don't leak chat
            // content or photos in replays.
            maskAllText: true,
            blockAllMedia: true,
          }),
        ],
      });
    },
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
