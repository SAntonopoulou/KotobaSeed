import React, { useCallback, useEffect, useState } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

// Platform-wide announcement banners. Renders at the top of every authed
// page. For severity=policy_change (driven by the EU P2B Article 8
// 15-day-notice mechanism) the dismiss is also the legal proof-of-notice
// — the backend records it in announcement_dismissal.

const SEVERITY_STYLES = {
  info: {
    bg: 'bg-sky-50 border-sky-200 text-sky-900',
    badge: 'bg-sky-100 text-sky-900',
    badgeLabel: 'Update',
  },
  policy_change: {
    bg: 'bg-amber-50 border-amber-200 text-amber-900',
    badge: 'bg-amber-100 text-amber-900',
    badgeLabel: 'Policy change',
  },
  security: {
    bg: 'bg-red-50 border-red-200 text-red-900',
    badge: 'bg-red-100 text-red-900',
    badgeLabel: 'Security',
  },
};

const formatEffective = (iso) => {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return null;
  }
};

const AnnouncementBanner = () => {
  const { currentUser } = useAuth();
  const [announcements, setAnnouncements] = useState([]);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    if (!currentUser) return;
    try {
      const res = await client.get('/platform/announcements/active');
      // Hide ones the user already dismissed unless severity=policy_change
      // is still before its effective_at deadline (we want it loudly
      // present until the deadline passes).
      const now = new Date();
      const visible = (res.data || []).filter((a) => {
        if (!a.dismissed) return true;
        if (
          a.severity === 'policy_change'
          && a.effective_at
          && new Date(a.effective_at) > now
        ) {
          return true;
        }
        return false;
      });
      setAnnouncements(visible);
    } catch {
      // Silent failure — banners are a nice-to-have, not load-blocking.
    }
  }, [currentUser]);

  useEffect(() => {
    load();
  }, [load]);

  const dismiss = async (id) => {
    setBusyId(id);
    try {
      await client.post(`/platform/announcements/${id}/dismiss`);
      setAnnouncements((prev) => prev.filter((a) => a.id !== id));
    } catch {
      // No-op — leave it on screen if the dismiss failed.
    } finally {
      setBusyId(null);
    }
  };

  if (!currentUser || announcements.length === 0) return null;

  return (
    <div className="space-y-2 px-3 sm:px-6 pt-3" data-testid="announcement-banner">
      {announcements.map((a) => {
        const style = SEVERITY_STYLES[a.severity] || SEVERITY_STYLES.info;
        const effective = formatEffective(a.effective_at);
        return (
          <div
            key={a.id}
            className={`rounded-2xl border px-4 py-3 ${style.bg}`}
          >
            <div className="flex flex-wrap items-start gap-3">
              <span
                className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded ${style.badge}`}
              >
                {style.badgeLabel}
              </span>
              <div className="flex-1 min-w-[200px]">
                <p className="font-semibold text-sm">{a.title}</p>
                <p className="text-sm mt-1 whitespace-pre-wrap">
                  {a.body_md}
                </p>
                {effective && (
                  <p className="text-xs mt-2 opacity-80">
                    Takes effect: {effective}
                  </p>
                )}
                {a.cta_label && a.cta_url && (
                  <a
                    href={a.cta_url}
                    target={a.cta_url.startsWith('http') ? '_blank' : undefined}
                    rel="noreferrer"
                    className="inline-block mt-2 text-sm font-medium underline"
                  >
                    {a.cta_label}
                  </a>
                )}
              </div>
              {a.dismissible && (
                <button
                  type="button"
                  onClick={() => dismiss(a.id)}
                  disabled={busyId === a.id}
                  className="text-xs font-semibold underline whitespace-nowrap disabled:opacity-60"
                >
                  {a.severity === 'policy_change'
                    ? "I've read this"
                    : 'Dismiss'}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default AnnouncementBanner;
