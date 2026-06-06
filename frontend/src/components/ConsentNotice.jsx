import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

// Renamed from CookieBanner.jsx — the literal filename was matching ad-
// blocker rules and getting ERR_BLOCKED_BY_CLIENT in dev. Functionally
// unchanged: a one-time "OK got it" acknowledgement, not a "reject/accept"
// dialog, because we only store one first-party item (the auth token).
// not a "reject all / accept all" choice — there's nothing else to reject.
//
// Stored ack lives in localStorage under 'kotobaseed:cookie-ack=1'. We don't
// store cookies for the banner state itself (so EU rules around "no cookies
// without consent" don't trip on the banner mechanic).

const ACK_KEY = 'kotobaseed:cookie-ack';

const CookieBanner = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const ack = window.localStorage.getItem(ACK_KEY);
      if (!ack) setVisible(true);
    } catch {
      // localStorage disabled — banner stays hidden; nothing else to do.
    }
  }, []);

  const acknowledge = () => {
    try {
      window.localStorage.setItem(ACK_KEY, '1');
    } catch {
      /* no-op */
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie notice"
      className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:bottom-6 sm:max-w-md bg-white border border-kotoba-text/15 rounded-2xl shadow-xl p-5 z-50"
    >
      <p className="text-sm font-semibold text-kotoba-primary mb-2">Cookies, kept simple</p>
      <p className="text-sm text-kotoba-text leading-relaxed">
        We use a single first-party item to keep you logged in. No third-party trackers,
        no advertising cookies.{' '}
        <Link to="/privacy" className="underline text-kotoba-primary">Read the privacy policy</Link>.
      </p>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={acknowledge}
          className="px-4 py-2 rounded-md bg-kotoba-primary text-white font-medium hover:bg-kotoba-primary/90"
        >
          OK, got it
        </button>
      </div>
    </div>
  );
};

export default CookieBanner;
