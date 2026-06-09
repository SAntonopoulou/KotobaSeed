import React, { useEffect, useState } from 'react';
import client from '../api/client';
import { getErrorMessage } from '../utils/errors';

// KotobaseedCrossLinkToggle — when on, the tutor's tenant site shows
// a small "Browse Kotobaseed" link in the header + footer so a curious
// visitor can wander into the wider marketplace. Tutors with their own
// captive audience can opt out so the cross-promo never appears on
// their site.

const KotobaseedCrossLinkToggle = () => {
  const [enabled, setEnabled] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await client.get('/tutor/me');
        // Default to true if the field is missing (old backends shouldn't
        // surface this component but defend against it just in case).
        const v = res.data?.show_kotobaseed_link;
        setEnabled(v === undefined ? true : Boolean(v));
      } catch (err) {
        setError(getErrorMessage(err, 'Could not load your cross-promo setting.'));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleToggle = async (e) => {
    const next = e.target.checked;
    setSaving(true);
    setError('');
    setInfo('');
    try {
      const res = await client.patch('/tutor/me', {
        show_kotobaseed_link: next,
      });
      const v = res.data?.show_kotobaseed_link;
      setEnabled(v === undefined ? next : Boolean(v));
      setInfo(
        next
          ? 'Cross-promo link will show on your site.'
          : 'Cross-promo link hidden from your site.',
      );
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading || enabled === null) {
    return (
      <section className="bg-white rounded-2xl shadow-sm p-6">
        <h2 className="text-lg font-bold text-kotoba-primary mb-2">Kotobaseed cross-promo</h2>
        <p className="text-sm text-kotoba-text/70">Loading…</p>
      </section>
    );
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-grow">
          <h2 className="text-lg font-bold text-kotoba-primary">Kotobaseed cross-promo</h2>
          <p className="text-sm text-kotoba-text/70 mt-1">
            When this is on, your tenant site shows a small <em>Browse Kotobaseed</em> link in the footer so curious visitors can wander into the wider marketplace. Off means the link never appears — your site stays entirely yours.
          </p>
        </div>
        <label className="inline-flex items-center gap-2 text-sm font-medium text-kotoba-text">
          <input
            type="checkbox"
            checked={enabled}
            onChange={handleToggle}
            disabled={saving}
            className="h-4 w-4 text-kotoba-primary border-kotoba-text/30 rounded focus:ring-kotoba-primary"
          />
          {enabled ? 'Shown' : 'Hidden'}
        </label>
      </div>

      {error && (
        <div className="mt-3 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md text-sm">
          {error}
        </div>
      )}
      {info && !error && (
        <div className="mt-3 bg-kotoba-primary/10 text-kotoba-primary px-4 py-2 rounded-md text-sm">
          {info}
        </div>
      )}
    </section>
  );
};

export default KotobaseedCrossLinkToggle;
