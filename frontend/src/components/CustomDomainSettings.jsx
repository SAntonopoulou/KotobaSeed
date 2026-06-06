import React, { useEffect, useState } from 'react';
import client from '../api/client';
import { useConfirm } from '../context/ModalContext';
import { SkeletonCard } from './Skeleton';

// Pro+ feature: point your own domain at the platform. Backend gates the
// PUT on user.is_pro_subscriber; this widget renders an upgrade nudge when
// the API returns 402 so the dashboard stays informative for Free/Plus.

const formatVerifiedAt = (iso) => {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

// Big top-level status banner. Always visible so tutors can see at a glance
// where they are in the setup process.
const StatusBanner = ({ state }) => {
  if (state.status === 'verified') {
    return (
      <div className="rounded-lg bg-kotoba-primary/10 border border-kotoba-primary/30 px-4 py-3 mb-4 flex items-start gap-3">
        <span className="text-kotoba-primary text-2xl leading-none mt-0.5">✓</span>
        <div className="flex-grow">
          <p className="font-semibold text-kotoba-primary">
            {state.domain} is verified and live
          </p>
          <p className="text-xs text-kotoba-text/70 mt-1">
            Verified {formatVerifiedAt(state.verified_at)}. Visitors hitting your domain land on your tutor site.
          </p>
        </div>
      </div>
    );
  }
  if (state.status === 'pending') {
    return (
      <div className="rounded-lg bg-kotoba-secondary/20 border border-kotoba-secondary/50 px-4 py-3 mb-4 flex items-start gap-3">
        <span className="text-kotoba-secondary-dark text-2xl leading-none mt-0.5">○</span>
        <div className="flex-grow">
          <p className="font-semibold text-kotoba-text">
            {state.domain} — awaiting DNS verification
          </p>
          <p className="text-xs text-kotoba-text/70 mt-1">
            Add the A record below at your registrar, then click "Verify now".
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-lg bg-kotoba-text/5 border border-kotoba-text/15 px-4 py-3 mb-4 flex items-start gap-3">
      <span className="text-kotoba-text/40 text-2xl leading-none mt-0.5">○</span>
      <div className="flex-grow">
        <p className="font-semibold text-kotoba-text">No custom domain set up</p>
        <p className="text-xs text-kotoba-text/70 mt-1">
          Enter a domain below to get started — you'll add a DNS record and verify it in a moment.
        </p>
      </div>
    </div>
  );
};

// Diagnostic panel rendered after every verify attempt. Shows exactly what
// we saw on the network so tutors can fix DNS themselves rather than guess.
const VerifyResult = ({ result }) => {
  if (!result) return null;
  const bg = result.success
    ? 'bg-kotoba-primary/10 border-kotoba-primary/30 text-kotoba-text'
    : 'bg-red-50 border-red-200 text-red-800';
  return (
    <div className={`mt-3 rounded-md border px-4 py-3 text-sm ${bg}`}>
      <p className={`font-semibold ${result.success ? 'text-kotoba-primary' : 'text-red-800'} mb-1`}>
        {result.success ? 'DNS check passed' : 'DNS check failed'}
      </p>
      <p className="leading-relaxed">{result.message}</p>
      {(result.expected_ip || result.resolved_ip) && (
        <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs font-mono">
          <dt className="text-kotoba-text/60">Expected IP:</dt>
          <dd>{result.expected_ip || '— not configured —'}</dd>
          <dt className="text-kotoba-text/60">Resolved IP:</dt>
          <dd>{result.resolved_ip || '— no answer —'}</dd>
        </dl>
      )}
    </div>
  );
};

const CustomDomainSettings = () => {
  const confirm = useConfirm();
  const [state, setState] = useState(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [upgradeNudge, setUpgradeNudge] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);

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
    setVerifyResult(null);
    if (!draft.trim()) {
      setError('Enter a domain to save.');
      return;
    }
    setSaving(true);
    try {
      const res = await client.put('/tutor/custom-domain', { domain: draft.trim() });
      setState(res.data);
      setInfo('Domain saved. Add the DNS record below, then click "Verify now".');
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
    setVerifyResult(null);
    setVerifying(true);
    try {
      const res = await client.post('/tutor/custom-domain/verify');
      setState(res.data);
      // Backend now returns last_check whether it succeeded or failed —
      // both cases land here. Status changes drive the top banner; the
      // VerifyResult panel gives the gory details.
      setVerifyResult(res.data.last_check);
    } catch (err) {
      // Genuine error (e.g. 400 "Save your domain first") rather than a
      // soft DNS-mismatch result.
      setError(err?.response?.data?.detail || 'Verify request failed. Try again.');
    } finally {
      setVerifying(false);
    }
  };

  const handleRemove = async () => {
    if (!(await confirm({
      title: 'Remove custom domain',
      message: 'Remove your custom domain? Visitors will fall back to your Kotobaseed subdomain.',
      confirmText: 'Remove',
      destructive: true,
    }))) {
      return;
    }
    setError('');
    setInfo('');
    setVerifyResult(null);
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
    return <SkeletonCard />;
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm p-6">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-kotoba-primary">Custom domain</h2>
        <p className="text-sm text-kotoba-text/70 mt-1">
          Point your own domain at your tutor site (e.g. <code className="font-mono text-xs">mygreeksite.com</code>). Pro and Business plans only — your <code className="font-mono text-xs">.kotobaseed.net</code> subdomain stays live no matter what.
        </p>
      </div>

      <StatusBanner state={state} />

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
              {state.target_ip || <em className="text-kotoba-text/60">— platform IP not configured —</em>}
            </div>
            <div><span className="text-kotoba-text/60">TTL:</span> 300 (5 min)</div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleVerify}
              disabled={verifying}
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
          <VerifyResult result={verifyResult} />
          <p className="mt-3 text-xs text-kotoba-text/60">
            DNS changes usually take a few minutes — if verification fails, wait 5 minutes and try again.
          </p>
        </div>
      )}
    </section>
  );
};

export default CustomDomainSettings;
