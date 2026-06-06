import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import { useToast } from '../../context/ToastContext';

// Admin-only platform settings — social media URLs, support email, footer
// tagline. Keys here must match the curated set in backend
// services/platform_settings.py.

const SOCIAL_FIELDS = [
  { key: 'social.instagram', label: 'Instagram URL', placeholder: 'https://instagram.com/kotobaseed' },
  { key: 'social.tiktok', label: 'TikTok URL', placeholder: 'https://tiktok.com/@kotobaseed' },
  { key: 'social.x', label: 'X (Twitter) URL', placeholder: 'https://x.com/kotobaseed' },
  { key: 'social.bluesky', label: 'Bluesky URL', placeholder: 'https://bsky.app/profile/kotobaseed.bsky.social' },
  { key: 'social.facebook', label: 'Facebook URL', placeholder: 'https://facebook.com/kotobaseed' },
  { key: 'social.youtube', label: 'YouTube URL', placeholder: 'https://youtube.com/@kotobaseed' },
  { key: 'social.linkedin', label: 'LinkedIn URL', placeholder: 'https://linkedin.com/company/kotobaseed' },
];

const BRAND_FIELDS = [
  { key: 'platform.support_email', label: 'Public support email', placeholder: 'hello@kotobaseed.net' },
  { key: 'platform.support_staff_inbox', label: 'Staff inbox (new ticket notifications)', placeholder: 'support-team@kotobaseed.net' },
  { key: 'platform.footer_tagline', label: 'Footer tagline', placeholder: 'Made with care for language learners and teachers.' },
];

const ALL_FIELDS = [...SOCIAL_FIELDS, ...BRAND_FIELDS];

const AdminSettings = () => {
  const { addToast } = useToast();
  const [values, setValues] = useState({});
  const [dirtyKeys, setDirtyKeys] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await client.get('/admin/settings');
        if (cancelled) return;
        const map = {};
        for (const row of res.data || []) {
          map[row.key] = typeof row.value === 'string' ? row.value : (row.value ?? '');
        }
        setValues(map);
      } catch {
        addToast('Could not load settings.', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [addToast]);

  const setValue = (key, value) => {
    setValues((v) => ({ ...v, [key]: value }));
    setDirtyKeys((s) => {
      const next = new Set(s);
      next.add(key);
      return next;
    });
  };

  const saveOne = async (key) => {
    setSavingKey(key);
    try {
      // Empty string saves as null so the footer can cleanly omit the row.
      const raw = (values[key] ?? '').trim();
      await client.put(`/admin/settings/${encodeURIComponent(key)}`, {
        value: raw === '' ? null : raw,
      });
      setDirtyKeys((s) => {
        const next = new Set(s);
        next.delete(key);
        return next;
      });
      addToast('Saved.', 'success');
    } catch (err) {
      addToast(err?.response?.data?.detail || 'Could not save.', 'error');
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) {
    return <div className="p-10 text-center">Loading settings…</div>;
  }

  const Field = ({ field }) => (
    <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end mb-3">
      <div>
        <label className="block text-xs font-medium text-kotoba-text/70 mb-1">
          {field.label}
        </label>
        <input
          type="text"
          value={values[field.key] ?? ''}
          onChange={(e) => setValue(field.key, e.target.value)}
          placeholder={field.placeholder}
          className="w-full px-3 py-2 border border-kotoba-text/20 rounded text-sm focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
        />
      </div>
      <button
        type="button"
        onClick={() => saveOne(field.key)}
        disabled={savingKey === field.key || !dirtyKeys.has(field.key)}
        className="px-4 py-2 rounded-md bg-kotoba-primary text-white text-sm font-medium hover:bg-kotoba-primary/90 disabled:opacity-40"
      >
        {savingKey === field.key ? 'Saving…' : 'Save'}
      </button>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-kotoba-primary">Platform settings</h1>
          <p className="text-sm text-kotoba-text/70 mt-1">
            Branded links shown in the public footer. Saves go live immediately and are logged in the audit log.
          </p>
        </div>
        <Link
          to="/admin/dashboard"
          className="text-sm text-kotoba-text/70 hover:text-kotoba-primary"
        >
          ← Back to dashboard
        </Link>
      </div>

      <section className="bg-white rounded-2xl shadow-sm p-6">
        <h2 className="text-lg font-bold text-kotoba-primary mb-1">Social networks</h2>
        <p className="text-sm text-kotoba-text/70 mb-4">
          Leave blank to hide an icon from the footer. Full URLs only.
        </p>
        {SOCIAL_FIELDS.map((f) => (
          <Field key={f.key} field={f} />
        ))}
      </section>

      <section className="bg-white rounded-2xl shadow-sm p-6">
        <h2 className="text-lg font-bold text-kotoba-primary mb-1">Brand + contact</h2>
        <p className="text-sm text-kotoba-text/70 mb-4">
          Support email is the address users see in the footer. The tagline appears just above the copyright line.
        </p>
        {BRAND_FIELDS.map((f) => (
          <Field key={f.key} field={f} />
        ))}
      </section>
    </div>
  );
};

export default AdminSettings;
