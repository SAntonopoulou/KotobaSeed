// Chrome-only mount used by /news pages.
//
// /news pages are static HTML rendered by the BeeRanked agent and
// post-processed by `scripts/news_chrome_rewriter.py`. The rewriter
// wraps the chrome blocks in `<div id="kb-navbar-root">` and
// `<div id="kb-footer-root">`, and loads the apex JS bundle. When
// main.jsx detects those placeholders, it calls `mountChrome` here
// instead of rendering the full App.
//
// The result: /news literally renders the same React `Navbar` and
// `Footer` components as the apex SPA, with the same provider stack
// (so AuthContext is live and signed-in users see the rich nav with
// avatar, Notifications, Inbox, More dropdown — not a static
// approximation). Editing Navbar.jsx OR Footer.jsx updates both
// surfaces with no /news-specific code path.

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { DemoProvider } from './context/DemoContext';
import { ToastProvider } from './context/ToastContext';
import { InboxProvider } from './context/InboxContext';
import { MaintenanceProvider } from './context/MaintenanceContext';
import { ModalProvider } from './context/ModalContext';
import Navbar from './components/Navbar';
import Footer from './components/Footer';

const Providers = ({ children }) => (
  <ToastProvider>
    <ModalProvider>
      <AuthProvider>
        <DemoProvider>
          <InboxProvider>
            <MaintenanceProvider>
              <BrowserRouter>{children}</BrowserRouter>
            </MaintenanceProvider>
          </InboxProvider>
        </DemoProvider>
      </AuthProvider>
    </ModalProvider>
  </ToastProvider>
);

// React Router's <Link> uses history.pushState for client-side nav.
// On /news those URLs aren't react-router routes — pushing would change
// the URL without loading anything, leaving the user stranded. Force
// every pushState that targets a different URL to be a real browser
// navigation so clicks from the chrome land on the apex SPA properly.
function forceHardNavigation() {
  const origPush = window.history.pushState;
  window.history.pushState = function (state, title, url) {
    if (url && url !== window.location.pathname + window.location.search) {
      window.location.assign(url);
      return;
    }
    return origPush.apply(window.history, arguments);
  };
}

export function mountChrome(navRoot, footerRoot) {
  forceHardNavigation();
  if (navRoot) {
    ReactDOM.createRoot(navRoot).render(
      <React.StrictMode>
        <Providers>
          <Navbar />
        </Providers>
      </React.StrictMode>,
    );
  }
  if (footerRoot) {
    ReactDOM.createRoot(footerRoot).render(
      <React.StrictMode>
        <Providers>
          <Footer />
        </Providers>
      </React.StrictMode>,
    );
  }
}
