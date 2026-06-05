import React, { useEffect, useState } from 'react';
import client from '../api/client';

// Pro+ feature: point your own domain at the platform. Backend gates the
// PUT on user.is_pro_subscriber; this widget renders an upgrade nudge when
// the API returns 402 so the dashboard stays informative for Free/Plus.

const STATUS_LABEL = {
  not_set: 'Not set up',
  pending: 'Awaiting DNS verification',
  verified: 'Verified and live',
};

const CustomDomainSettings = () => {
  const [state, setState] = useState(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [upgradeNudge, setUpgradeNudge] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await client.get('/tutor/custom-domain');
      setState(res.data);
      setDraft(res.data.domain || '');
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not load custom domain settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async (e) => {
    e?.preventDefault();
    setError('');
    setInfo('');
    setUpgradeNudge(false);
    if (!draft.trim()) {
      setError('Enter a domain to save.');
      return;
    }
    setSaving(true);
    try {
      const res = await client.put('/tutor/custom-domain', { domain: draft.trim() });
      setState(res.data);
      setInfo('Domain saved. Add the DNS record below, then verify.');
    } catch (err) {
      const code = err?.response?.status;
      const detail = err?.response?.data?.detail;
      if (code === 402) {
        setUpgradeNudge(true);
        setError(detail || 'Custom domains are a Pro feature.');
      } else {
        setError(detail || 'Could not save your domain.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleVerify = async () => {
    setError('');
    setInfo('');
    setVerifying(true);
    try {
      const res = await client.post('/tutor/custom-domain/verify');
      setState(res.data);
      setInfo("Verified — your domain is live now. Visitors hitting it land on your tutor site.");
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not verify yet.');
    } finally {
      setVerifying(false);
    }
  };

  const handleRemove = async () => {
    if (!window.confirm('Remove your custom domain? Visitors will fall back to your Kotobaseed subdomain.')) {
      return;
    }
    setError('');
    setInfo('');
    setSaving(true);
    try {
      await client.delete('/tutor/custom-domain');
      await load();
      setInfo('Custom domain removed.');
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not remove.');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !state) {
    return (
      <section className="bg-white rounded-2xl shadow-sm p-6">
        <h2 className="text-lg font-bold text-kotoba-primary mb-2">Custom domain</h2>
        <p className="text-sm text-kotoba-text/70">Loading…</p>
      </section>
    );
  }

  const statusBadge = {
    not_set: 'bg-kotoba-text/10 text-kotoba-text/70',
    pending: 'bg-kotoba-secondary/30 text-kotoba-text',
    verified: 'bg-kotoba-primary/15 text-kotoba-primary',
  }[state.status];

  return (
    <section className="bg-white rounded-2xl shadow-sm p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h2 className="text-lg font-bold text-kotoba-primary">Custom domain</h2>
          <p className="text-sm text-kotoba-text/70 mt-1">
            Point your own domain at your tutor site (e.g. <code className="font-mono text-xs">mygreeksite.com</code>). Pro and Business plans only — your <code className="font-mono text-xs">.kotobaseed.net</code> subdomain stays live no matter what.
          </p>
        </div>
        <span className={`px-3 py-1 rounded-md text-xs font-medium ${statusBadge}`}>
          {STATUS_LABEL[state.status]}
        </span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md text-sm mb-3">
          {error}
        </div>
      )}
      {info && !error && (
        <div className="bg-kotoba-primary/10 text-kotoba-primary px-4 py-2 rounded-md text-sm mb-3">
          {info}
        </div>
      )}
      {upgradeNudge && (
        <div className="bg-kotoba-secondary/20 text-kotoba-text px-4 py-3 rounded-md text-sm mb-3">
          Upgrade to <strong>Pro</strong> or <strong>Business</strong> from your account settings to unlock custom domains.
        </div>
      )}

      <form onSubmit={handleSave} className="grid sm:grid-cols-[1fr_auto] gap-3 items-end mb-4">
        <div>
          <label className="block text-xs font-medium text-kotoba-text/70 mb-1" htmlFor="custom-domain">
            Your domain
          </label>
          <input
            id="custom-domain"
            name="domain"
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="mygreeksite.com"
            disabled={saving}
            className="w-full px-3 py-2 border border-kotoba-text/20 rounded focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2 rounded-md bg-kotoba-secondary text-kotoba-text font-semibold hover:bg-kotoba-secondary-dark disabled:opacity-60"
        >
          {saving ? 'Saving…' : state.status === 'not_set' ? 'Save' : 'Update'}
        </button>
      </form>

      {state.domain && (
        <div className="rounded-lg bg-kotoba-background/50 p-4 text-sm">
          <p className="font-semibold text-kotoba-text mb-2">DNS setup</p>
          <p className="text-kotoba-text/80 mb-3">
            Add this record at your domain registrar (Cloudflare, Namecheap, etc.):
          </p>
          <div className="font-mono text-xs bg-white border border-kotoba-text/10 rounded p-3 mb-3">
            <div><span className="text-kotoba-text/60">Type:</span> A</div>
            <div><span className="text-kotoba-text/60">Name:</span> {state.domain}</div>
            <div>
              <span className="text-kotoba-text/60">Value:</span>{' '}
              {state.target_ip ? state.target_ip : <em className="text-kotoba-text/60">Platform IP not configured yet — try again later</em>}
            </div>
            <div><span className="text-kotoba-text/60">TTL:</span> 300 (5 min)</div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleVerify}
              disabled={verifying || !state.target_ip}
              className="px-4 py-2 rounded-md border-2 border-kotoba-primary text-kotoba-primary font-medium hover:bg-kotoba-primary hover:text-white disabled:opacity-50 transition-colors"
            >
              {verifying ? 'Checking DNS…' : state.status === 'verified' ? 'Re-verify' : 'Verify now'}
            </button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={saving}
              className="px-4 py-2 rounded-md text-kotoba-text/60 hover:text-kotoba-text text-sm"
            >
              Remove domain
            </button>
          </div>
          <p className="mt-3 text-xs text-kotoba-text/60">
            DNS changes usually take a few minutes — if verification fails, wait 5 minutes and try again.
          </p>
        </div>
      )}
    </section>
  );
};

export default CustomDomainSettings;
