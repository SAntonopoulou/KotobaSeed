import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FaInstagram,
  FaTiktok,
  FaFacebook,
  FaYoutube,
  FaLinkedin,
} from 'react-icons/fa';
import { FaXTwitter, FaBluesky } from 'react-icons/fa6';
import client from '../api/client';

// Single map of network key → icon component + accessible label. New
// networks: add an entry here AND the matching backend SOCIAL_KEYS entry
// in services/platform_settings.py.
const SOCIAL_ICONS = {
  instagram: { Icon: FaInstagram, label: 'Instagram' },
  tiktok: { Icon: FaTiktok, label: 'TikTok' },
  x: { Icon: FaXTwitter, label: 'X (Twitter)' },
  bluesky: { Icon: FaBluesky, label: 'Bluesky' },
  facebook: { Icon: FaFacebook, label: 'Facebook' },
  youtube: { Icon: FaYoutube, label: 'YouTube' },
  linkedin: { Icon: FaLinkedin, label: 'LinkedIn' },
};

const Footer = () => {
  const [config, setConfig] = useState({ social_links: {}, support_email: null, tagline: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await client.get('/platform/footer');
        if (!cancelled) setConfig(res.data || { social_links: {} });
      } catch {
        // Footer reads are optional — if the platform endpoint is down we
        // still render a static brand line without socials.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const socials = config.social_links || {};
  const visibleSocials = Object.entries(socials).filter(([key, url]) => SOCIAL_ICONS[key] && url);

  return (
    <footer className="bg-white border-t border-kotoba-text/10 mt-auto">
      <div className="max-w-7xl mx-auto py-10 px-4 sm:px-6 lg:px-8">
        {visibleSocials.length > 0 && (
          <div className="flex justify-center gap-6 mb-6">
            {visibleSocials.map(([key, url]) => {
              const { Icon, label } = SOCIAL_ICONS[key];
              return (
                <a
                  key={key}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-kotoba-text/50 hover:text-kotoba-primary transition-colors"
                  aria-label={label}
                  title={label}
                >
                  <Icon className="h-6 w-6" />
                </a>
              );
            })}
          </div>
        )}

        <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-kotoba-text/70 mb-3">
          <Link to="/privacy" className="hover:text-kotoba-primary">Privacy</Link>
          <Link to="/terms" className="hover:text-kotoba-primary">Terms</Link>
          <Link to="/legal/tutor-agreement" className="hover:text-kotoba-primary">Tutor agreement</Link>
          <Link to="/legal/acceptable-use" className="hover:text-kotoba-primary">Acceptable use</Link>
          <Link to="/legal/cookies" className="hover:text-kotoba-primary">Cookies</Link>
          <Link to="/refunds" className="hover:text-kotoba-primary">Refunds</Link>
          <Link to="/pricing" className="hover:text-kotoba-primary">Pricing</Link>
          {/* /news/ is served by Caddy (BeeRanked-synced static), not a
              React route — must be a plain <a> so the browser does a
              full navigation. */}
          <a href="/news" className="hover:text-kotoba-primary">News</a>
          <Link to="/help" className="hover:text-kotoba-primary">Help</Link>
          <Link to="/status" className="hover:text-kotoba-primary">Status</Link>
          {config.support_email && (
            <a
              href={`mailto:${config.support_email}`}
              className="hover:text-kotoba-primary"
            >
              Support
            </a>
          )}
        </nav>

        <nav className="flex flex-wrap justify-center gap-x-6 gap-y-1 text-xs text-kotoba-text/55 mb-4">
          <a href="mailto:dpo@kotobaseed.net" className="hover:text-kotoba-primary">
            Data protection (DPO): dpo@kotobaseed.net
          </a>
          <Link to="/legal/report-content" className="hover:text-kotoba-primary">
            Report illegal content
          </Link>
        </nav>

        {config.tagline && (
          <p className="text-center text-sm text-kotoba-text/60 mb-2">{config.tagline}</p>
        )}
        <p className="text-center text-sm text-kotoba-text/50">
          © {new Date().getFullYear()} Kotobaseed. All rights reserved.
        </p>
      </div>
    </footer>
  );
};

export default Footer;
