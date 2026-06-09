import React, { useEffect, useState } from 'react';
import client from '../../api/client';
import AvatarUploader from '../AvatarUploader';

const ProfileEditor = ({ tutor, onSaved }) => {
  const [form, setForm] = useState({
    display_name: tutor.display_name || '',
    bio: tutor.bio || '',
    languages_taught: tutor.languages_taught || '',
    languages_spoken: tutor.languages_spoken || '',
    public_reply_email: tutor.public_reply_email || '',
  });
  const [photoUrl, setPhotoUrl] = useState(tutor.photo_url || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState(null);

  useEffect(() => {
    setForm({
      display_name: tutor.display_name || '',
      bio: tutor.bio || '',
      languages_taught: tutor.languages_taught || '',
      languages_spoken: tutor.languages_spoken || '',
      public_reply_email: tutor.public_reply_email || '',
    });
    setPhotoUrl(tutor.photo_url || '');
  }, [tutor]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const payload = Object.fromEntries(
        Object.entries(form).filter(([, v]) => v !== '')
      );
      const res = await client.patch('/tutor/me', payload);
      setSavedAt(new Date());
      onSaved?.(res.data);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="bg-white rounded-2xl shadow-sm p-6">
      <h2 className="text-lg font-bold text-kotoba-primary mb-4">Your profile</h2>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
          {error}
        </div>
      )}
      {savedAt && !error && (
        <div className="mb-4 bg-kotoba-primary/10 text-kotoba-primary px-4 py-3 rounded-md text-sm">
          Saved at {savedAt.toLocaleTimeString()}.
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-kotoba-text mb-1" htmlFor="display_name">
            Display name
          </label>
          <input
            id="display_name"
            name="display_name"
            type="text"
            value={form.display_name}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-kotoba-text/20 rounded-md focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-kotoba-text mb-1" htmlFor="bio">
            Bio
          </label>
          <textarea
            id="bio"
            name="bio"
            value={form.bio}
            onChange={handleChange}
            rows={5}
            className="w-full px-3 py-2 border border-kotoba-text/20 rounded-md focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
          />
          <p className="mt-1 text-xs text-kotoba-text/60">
            Appears on your public site. Line breaks are preserved.
          </p>
        </div>

        <AvatarUploader
          currentUrl={photoUrl}
          size={96}
          onUpdated={(newUrl) => {
            setPhotoUrl(newUrl || '');
            onSaved?.({ ...tutor, photo_url: newUrl || null });
          }}
        />

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-kotoba-text mb-1" htmlFor="languages_taught">
              Languages you teach
            </label>
            <input
              id="languages_taught"
              name="languages_taught"
              type="text"
              value={form.languages_taught}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-kotoba-text/20 rounded-md focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-kotoba-text mb-1" htmlFor="languages_spoken">
              Languages you speak
            </label>
            <input
              id="languages_spoken"
              name="languages_spoken"
              type="text"
              value={form.languages_spoken}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-kotoba-text/20 rounded-md focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-kotoba-text mb-1" htmlFor="public_reply_email">
            Reply-to email (optional)
          </label>
          <input
            id="public_reply_email"
            name="public_reply_email"
            type="email"
            value={form.public_reply_email}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-kotoba-text/20 rounded-md focus:outline-none focus:ring-2 focus:ring-kotoba-primary"
          />
          <p className="mt-1 text-xs text-kotoba-text/60">
            If set, students replying to your transactional emails reach this address instead of Kotobaseed support.
          </p>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 rounded-lg bg-kotoba-secondary text-kotoba-text font-semibold hover:bg-kotoba-secondary-dark disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </section>
  );
};

export default ProfileEditor;
