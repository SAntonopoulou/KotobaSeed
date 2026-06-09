import React from 'react';

// Single avatar primitive. Replaces the ~10 inline copies of the
// `<img src={avatarUrl} onError={... ui-avatars.com ...}>` pattern.
//
// Usage:
//   <Avatar src={user.avatar_url} name={user.full_name} size={48} />
//
// The `name` prop drives both the fallback initials and the
// ui-avatars.com URL — so even when the network image fails the
// rendered avatar still feels personalised.
const Avatar = ({ src, name = '', size = 40, className = '', alt }) => {
  const safeName = (name || 'User').trim() || 'User';
  const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(
    safeName,
  )}&background=random`;
  const dimensions = { width: size, height: size };
  return (
    <img
      src={src || fallback}
      alt={alt ?? `${safeName} avatar`}
      style={dimensions}
      className={`rounded-full object-cover bg-kotoba-background/60 ${className}`}
      onError={(e) => {
        // First failure: try the deterministic ui-avatars fallback. We
        // null the handler before swapping the src so we don't loop if
        // that one also fails (network down).
        if (e.target.src !== fallback) {
          e.target.onerror = null;
          e.target.src = fallback;
        }
      }}
    />
  );
};

export default Avatar;
