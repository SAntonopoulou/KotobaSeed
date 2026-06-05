import React, { useEffect, useState } from 'react';
import client from '../api/client';

// Single-toggle widget: should this tutor show up in the apex /library
// directory? Default is on. Tutors who only want direct-link traffic to
// their own subdomain can opt out here.

const MarketplaceListingToggle = () => {
  const [listed, setListed] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await client.get('/tutor/me');
        setListed(Boolean(res.data?.list_in_marketplace));
      } catch (err) {
        setError(err?.response?.data?.detail || 'Could not load your listing setting.');
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
      const res = await client.patch('/tutor/me', { list_in_marketplace: next });
      setListed(Boolean(res.data?.list_in_marketplace));
      setInfo(next ? 'You\'re listed on the directory.' : 'Removed from the directory.');
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  if (loading || listed === null) {
    return (
      <section className="bg-white rounded-2xl shadow-sm p-6">
        <h2 className="text-lg font-bold text-kotoba-primary mb-2">Marketplace listing</h2>
        <p className="text-sm text-kotoba-text/70">Loading…</p>
      </section>
    );
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-grow">
          <h2 className="text-lg font-bold text-kotoba-primary">Marketplace listing</h2>
          <p className="text-sm text-kotoba-text/70 mt-1">
            When this is on, you appear on the Kotobaseed <code className="font-mono text-xs">/library</code> directory so students discovering the platform can find you. Off means students only reach you through direct links to your site.
          </p>
        </div>
        <label className="inline-flex items-center gap-2 text-sm font-medium text-kotoba-text">
          <input
            type="checkbox"
            checked={listed}
            onChange={handleToggle}
            disabled={saving}
            className="h-4 w-4 text-kotoba-primary border-kotoba-text/30 rounded focus:ring-kotoba-primary"
          />
          {listed ? 'Listed' : 'Hidden'}
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

export default MarketplaceListingToggle;
