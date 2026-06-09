import React, { useRef, useState } from 'react';
import client from '../api/client';
import { getErrorMessage } from '../utils/errors';

/**
 * Profile photo uploader.
 *
 * Renders the current avatar (or a soft placeholder), click-to-pick OR
 * drag-and-drop, browser-side preview while the server is processing,
 * then swaps in the canonical URL the server returned.
 *
 *   <AvatarUploader
 *     currentUrl={user.avatar_url}
 *     onUpdated={(newUrl) => setUser({ ...user, avatar_url: newUrl })}
 *   />
 *
 * The backend does the heavy lifting — square-crop, resize to 400×400,
 * WebP re-encode, R2 upload. The browser only validates the basics so
 * we can fail fast without a round-trip.
 */
const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif';
const MAX_BYTES = 6 * 1024 * 1024;

const AvatarUploader = ({ currentUrl, onUpdated, size = 96 }) => {
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);

  const display = preview || currentUrl;

  const upload = async (file) => {
    if (!file) return;
    setError('');
    if (!ACCEPT.split(',').includes(file.type)) {
      setError('Please pick a JPEG, PNG, WebP, or HEIC image.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`Image is too large — keep it under ${MAX_BYTES / (1024 * 1024)} MB.`);
      return;
    }
    // Optimistic preview while the server processes.
    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await client.post('/users/me/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const newUrl = res.data?.avatar_url;
      if (onUpdated && newUrl) onUpdated(newUrl);
      // Drop the object URL once the canonical URL is in place.
      URL.revokeObjectURL(localUrl);
      setPreview(null);
    } catch (err) {
      setError(getErrorMessage(err, 'Upload failed. Try a smaller image.'));
      URL.revokeObjectURL(localUrl);
      setPreview(null);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    setError('');
    setUploading(true);
    try {
      await client.delete('/users/me/avatar');
      if (onUpdated) onUpdated(null);
      setPreview(null);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not remove the photo.'));
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) upload(file);
  };

  return (
    <div className="flex items-start gap-4">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        disabled={uploading}
        style={{ width: size, height: size }}
        className={`relative shrink-0 rounded-full overflow-hidden border-2 ${
          dragging
            ? 'border-kotoba-primary bg-kotoba-primary/5'
            : 'border-kotoba-text/15 bg-kotoba-background/60'
        } flex items-center justify-center disabled:opacity-60`}
        aria-label="Upload profile photo"
      >
        {display ? (
          <img src={display} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-xs text-kotoba-text/50 px-2 text-center">
            Tap to upload
          </span>
        )}
        {uploading && (
          <div className="absolute inset-0 bg-white/60 flex items-center justify-center text-xs font-semibold text-kotoba-primary">
            Uploading…
          </div>
        )}
      </button>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-kotoba-text">Profile photo</p>
        <p className="mt-0.5 text-xs text-kotoba-text/60">
          Square works best. JPEG, PNG, WebP, or HEIC — up to 6 MB.
          We'll resize and crop for you.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="px-3 py-1.5 rounded-md bg-kotoba-primary text-white text-sm font-medium hover:bg-kotoba-primary/90 disabled:opacity-60"
          >
            {currentUrl ? 'Change photo' : 'Upload photo'}
          </button>
          {currentUrl && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={uploading}
              className="px-3 py-1.5 rounded-md border border-kotoba-text/20 text-kotoba-text text-sm font-medium hover:bg-kotoba-background/60 disabled:opacity-60"
            >
              Remove
            </button>
          )}
        </div>
        {error && (
          <p className="mt-2 text-sm text-red-700">{error}</p>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => upload(e.target.files?.[0])}
      />
    </div>
  );
};

export default AvatarUploader;
