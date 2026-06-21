import React from 'react';
// Single source of truth for the apex footer (and the BeeRanked /news
// plugin footer, kept in sync by scripts/sync_news_chrome.py). Edit
// only `apex_chrome.signed_out.html` — both renderers pick up the new
// markup with no JSX touch needed.
import chromeHtml from './apex_chrome.signed_out.html?raw';
import { rewriteSpaChrome } from '../hooks/useTenant';

// See rewriteSpaChrome() for rationale. The footer has no /login or
// /register CTAs of its own, so the demo retarget pass is a no-op
// here — keeping the shared helper still gives us the apex-strip in
// one place.
const SPA_CHROME_HTML = rewriteSpaChrome(chromeHtml);

const FOOTER_HTML =
  SPA_CHROME_HTML.match(/<footer class="bg-white[\s\S]*?<\/footer>/)?.[0] || '';

const Footer = () => (
  // The template already contains the <footer> wrapper, so we render it
  // bare. The inline <script> inside the template fills in the © year
  // on mount; React DOES NOT re-execute scripts in dangerouslySetInnerHTML,
  // so we set the year imperatively just below.
  <div
    dangerouslySetInnerHTML={{ __html: FOOTER_HTML }}
    ref={(node) => {
      if (!node) return;
      const year = new Date().getFullYear();
      node.querySelectorAll('.kb-year').forEach((el) => {
        el.textContent = String(year);
      });
    }}
  />
);

export default Footer;
