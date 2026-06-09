import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { getErrorMessage } from '../utils/errors';
import { formatDateShort } from '../utils/dates';

const KIND_LABEL = {
  tutor_peer: 'Tutor referral',
  student_peer: 'Student referral',
  affiliate: 'Affiliate',
};

const KIND_DESC = {
  tutor_peer:
    'Refer fellow tutors to Kotobaseed. You earn milestone bonuses — €5 when they teach their first paid lesson, then €25 / €75 / €200 as their revenue grows. Cap €305 per referral.',
  student_peer:
    'Share with friends learning a language. They get €5 off their first lesson, you get a €10 lesson credit when they complete it.',
  affiliate:
    'Approved affiliate code. €50 for every qualifying tutor you refer, €10 for every qualifying student.',
};

const formatPrice = (cents, currency = 'eur') => {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: (currency || 'eur').toUpperCase(),
    }).format(cents / 100);
  } catch {
    return `€${(cents / 100).toFixed(2)}`;
  }
};

const formatDate = (iso) => {
  if (!iso) return '';
  try {
    return formatDateShort(iso);
  } catch {
    return iso;
  }
};

const CodeCard = ({ code }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code.share_url || code.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="rounded-lg border border-kotoba-text/15 p-4 bg-kotoba-background/30">
      <p className="font-semibold text-kotoba-primary">{KIND_LABEL[code.kind] || code.kind}</p>
      <p className="text-xs text-kotoba-text/60 mt-1">{KIND_DESC[code.kind]}</p>
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <code className="px-2 py-1 rounded bg-white border border-kotoba-text/15 font-mono text-sm">
          {code.code}
        </code>
        <button
          type="button"
          onClick={copy}
          className="text-sm text-kotoba-primary hover:underline"
        >
          {copied ? 'Copied!' : 'Copy share link'}
        </button>
      </div>
      {code.share_url && (
        <p className="mt-2 text-xs text-kotoba-text/50 break-all">{code.share_url}</p>
      )}
    </div>
  );
};

const Referrals = () => {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await client.get('/referrals/me');
        if (!cancelled) setSummary(res.data);
      } catch (err) {
        if (!cancelled) {
          setError(getErrorMessage(err, 'Could not load your referrals.'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <p className="text-kotoba-text/70">Loading…</p>
      </main>
    );
  }

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-kotoba-primary">Referrals</h1>
        <p className="text-sm text-kotoba-text/70 mt-1">
          Share Kotobaseed, earn rewards. Anyone who signs up with your code is attributed to you — rewards land when they complete their first qualifying lesson.
        </p>
      </header>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
          {error}
        </div>
      )}

      {summary && (
        <>
          <section className="bg-white rounded-2xl shadow-sm p-6 grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-kotoba-text/60 uppercase tracking-wider">Total earned</p>
              <p className="text-3xl font-extrabold text-kotoba-primary">
                {formatPrice(summary.total_paid_cents + summary.total_pending_cents)}
              </p>
              <p className="text-xs text-kotoba-text/60 mt-1">
                {formatPrice(summary.total_paid_cents)} paid · {formatPrice(summary.total_pending_cents)} pending
              </p>
            </div>
            <div>
              <p className="text-xs text-kotoba-text/60 uppercase tracking-wider">People referred</p>
              <p className="text-3xl font-extrabold text-kotoba-primary">
                {summary.attributions.length}
              </p>
              <p className="text-xs text-kotoba-text/60 mt-1">
                {summary.attributions.filter((a) => a.first_qualified_at).length} qualified
              </p>
            </div>
          </section>

          <section className="bg-white rounded-2xl shadow-sm p-6 space-y-3">
            <h2 className="text-lg font-bold text-kotoba-primary">Your codes</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {summary.codes.map((c) => (
                <CodeCard key={c.code} code={c} />
              ))}
              {!summary.codes.some((c) => c.kind === 'affiliate') && (
                <div className="rounded-lg border border-dashed border-kotoba-text/20 p-4">
                  <p className="font-semibold text-kotoba-primary">Become an affiliate</p>
                  <p className="text-xs text-kotoba-text/60 mt-1">
                    Run a blog or channel? Apply for the affiliate program — flat bonuses instead of milestones.
                  </p>
                  <Link
                    to="/affiliates/apply"
                    className="inline-block mt-3 px-4 py-1.5 rounded-md border-2 border-kotoba-primary text-kotoba-primary text-sm font-medium hover:bg-kotoba-primary hover:text-white"
                  >
                    Apply →
                  </Link>
                </div>
              )}
            </div>
          </section>

          {summary.attributions.length > 0 && (
            <section className="bg-white rounded-2xl shadow-sm p-6 space-y-3">
              <h2 className="text-lg font-bold text-kotoba-primary">People you've referred</h2>
              <ul className="divide-y divide-kotoba-text/10 border border-kotoba-text/10 rounded-md">
                {summary.attributions.map((a) => (
                  <li key={a.id} className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-grow">
                      <p className="font-medium text-kotoba-text">
                        {a.referred_user_email || `User #${a.id}`}
                      </p>
                      <p className="text-xs text-kotoba-text/60 mt-0.5">
                        {KIND_LABEL[a.kind]} · joined {formatDate(a.created_at)}
                      </p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      a.first_qualified_at
                        ? 'bg-green-100 text-green-800'
                        : 'bg-kotoba-text/10 text-kotoba-text/60'
                    }`}>
                      {a.first_qualified_at ? 'Qualified' : 'Waiting for first lesson'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {summary.rewards.length > 0 && (
            <section className="bg-white rounded-2xl shadow-sm p-6 space-y-3">
              <h2 className="text-lg font-bold text-kotoba-primary">Rewards earned</h2>
              <ul className="divide-y divide-kotoba-text/10 border border-kotoba-text/10 rounded-md">
                {summary.rewards.map((r) => (
                  <li key={r.id} className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-grow">
                      <p className="font-medium text-kotoba-text">
                        {formatPrice(r.amount_cents, r.currency)} · {r.kind.replace(/_/g, ' ')}
                      </p>
                      <p className="text-xs text-kotoba-text/60 mt-0.5">
                        Earned {formatDate(r.earned_at)}
                        {r.milestone_key && ` · milestone: ${r.milestone_key}`}
                      </p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      r.status === 'paid'
                        ? 'bg-green-100 text-green-800'
                        : r.status === 'void'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-kotoba-secondary/30 text-kotoba-text'
                    }`}>
                      {r.status}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
};

export default Referrals;
