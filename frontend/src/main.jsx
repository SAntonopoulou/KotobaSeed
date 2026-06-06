import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
// Initialise i18n before the app renders. Import-for-side-effects pattern —
// the bootstrap inside ./i18n calls i18n.init() at module load.
import './i18n'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
