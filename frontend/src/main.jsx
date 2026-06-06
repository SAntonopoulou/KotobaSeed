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
  import('@sentry/react').then(({ init, browserTracingIntegration }) => {
    init({
      dsn: import.meta.env.VITE_SENTRY_DSN,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0.1,
      integrations: [browserTracingIntegration()],
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
