import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import { useToast } from '../../context/ToastContext';

const STATUS_TONE = {
  pending: 'bg-kotoba-secondary/30 text-kotoba-text',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
};

const formatWhen = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

const AdminAffiliates = () => {
  const { addToast } = useToast();
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState(null);
  const [notes, setNotes] = useState({});

  const load = async () => {
    setLoading(true);
    try {
      const res = await client.get('/admin/affiliates/applications');
      setApps(res.data || []);
    } catch (err) {
      addToast(err?.response?.data?.detail || 'Could not load applications.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const review = async (app, decision) => {
    setActingId(app.id);
    try {
      await client.post(
        `/admin/affiliates/applications/${app.id}/${decision}`,
        { admin_notes: notes[app.id] || null }
      );
      addToast(decision === 'approve' ? 'Approved.' : 'Rejected.', 'success');
      await load();
    } catch (err) {
      addToast(err?.response?.data?.detail || 'Action failed.', 'error');
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-kotoba-primary">Affiliate applications</h1>
          <p className="text-sm text-kotoba-text/70 mt-1">
            Approve or reject applications to the affiliate program. Approval issues an AFFILIATE referral code automatically.
          </p>
        </div>
        <Link to="/admin/dashboard" className="text-sm text-kotoba-primary hover:underline">
          ← Back to dashboard
        </Link>
      </div>

      {loading ? (
        <p className="text-kotoba-text/70">Loading…</p>
      ) : apps.length === 0 ? (
        <p className="text-kotoba-text/70 italic">No applications yet.</p>
      ) : (
        <div className="space-y-4">
          {apps.map((a) => (
            <div key={a.id} className="bg-white rounded-2xl shadow-sm p-6">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-grow">
                  <p className="font-semibold text-kotoba-primary">{a.user_email || `User #${a.user_id}`}</p>
                  <p className="text-xs text-kotoba-text/60 mt-0.5">
                    Submitted {formatWhen(a.created_at)}
                  </p>
                  <p className="mt-2 text-sm">
                    <a
                      href={a.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-kotoba-primary underline break-all"
                    >
                      {a.website_url}
                    </a>
                  </p>
                  <p className="mt-3 text-sm text-kotoba-text whitespace-pre-wrap">
                    {a.audience_description}
                  </p>
                  {a.admin_notes && (
                    <p className="mt-3 text-xs text-kotoba-text/60 italic">
                      Admin notes: {a.admin_notes}
                    </p>
                  )}
                </div>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_TONE[a.status]}`}>
                  {a.status}
                </span>
              </div>

              {a.status === 'pending' && (
                <div className="mt-4 border-t border-kotoba-text/10 pt-3 space-y-2">
                  <textarea
                    placeholder="Notes (optional — saved with the decision)"
                    value={notes[a.id] || ''}
                    onChange={(e) =>
                      setNotes((n) => ({ ...n, [a.id]: e.target.value }))
                    }
                    rows={2}
                    className="w-full px-3 py-2 border border-kotoba-text/20 rounded text-sm focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      disabled={actingId === a.id}
                      onClick={() => review(a, 'reject')}
                      className="px-4 py-1.5 rounded-md border border-red-300 text-red-700 text-sm font-medium hover:bg-red-50 disabled:opacity-50"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      disabled={actingId === a.id}
                      onClick={() => review(a, 'approve')}
                      className="px-4 py-1.5 rounded-md bg-kotoba-primary text-white text-sm font-medium hover:bg-kotoba-primary/90 disabled:opacity-50"
                    >
                      Approve
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminAffiliates;
