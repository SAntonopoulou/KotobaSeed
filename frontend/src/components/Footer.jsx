import React from 'react';
// Single source of truth for the apex footer (and the BeeRanked /news
// plugin footer, kept in sync by scripts/sync_news_chrome.py). Edit
// only `apex_chrome.signed_out.html` — both renderers pick up the new
// markup with no JSX touch needed.
import chromeHtml from './apex_chrome.signed_out.html?raw';

// See Navbar.jsx for the rationale on stripping the absolute
// https://kotobaseed.net/ prefix at inject time — keeps the SPA's
// chrome on whatever host it's served from (apex vs demo) without
// breaking the BeeRanked /news/* contract, where the same template
// is served as static HTML with absolute URLs intact.
const SPA_CHROME_HTML = chromeHtml.replace(
  /https:\/\/kotobaseed\.net\//g,
  '/',
);

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
