import React from 'react';

const YOUTUBE_RE = /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/;
const VIMEO_RE = /vimeo\.com\/(\d+)/;

const toEmbedUrl = (url) => {
  if (!url) return null;
  const yt = url.match(YOUTUBE_RE);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vi = url.match(VIMEO_RE);
  if (vi) return `https://player.vimeo.com/video/${vi[1]}`;
  return null;
};

const VideoEmbed = ({ content }) => {
  const title = content?.title?.trim() || null;
  const embed = toEmbedUrl(content?.url);
  if (!embed) return null;

  return (
    <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 bg-white rounded-2xl shadow-sm mx-4 sm:mx-auto mb-8">
      {title && (
        <h2 className="text-2xl font-bold text-kotoba-primary mb-4">{title}</h2>
      )}
      <div className="aspect-video w-full rounded-lg overflow-hidden bg-kotoba-text/5">
        <iframe
          src={embed}
          title={title || 'Tutor video'}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="w-full h-full"
        />
      </div>
    </section>
  );
};

export default VideoEmbed;
