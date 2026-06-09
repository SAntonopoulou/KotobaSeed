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
    <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <div className="bg-white rounded-3xl shadow-soft p-6 sm:p-8">
        {title && (
          <>
            <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-kotoba-secondary-dark">
              Watch
            </p>
            <h2 className="mt-2 font-display text-2xl sm:text-3xl font-bold text-kotoba-primary leading-tight tracking-[-0.015em] mb-6">
              {title}
            </h2>
          </>
        )}
        <div className="aspect-video w-full rounded-2xl overflow-hidden bg-kotoba-text/5 shadow-soft">
          <iframe
            src={embed}
            title={title || 'Tutor video'}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="w-full h-full"
          />
        </div>
      </div>
    </section>
  );
};

export default VideoEmbed;
