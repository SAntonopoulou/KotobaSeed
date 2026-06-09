import React from 'react';

const VideoPlayer = ({ url }) => {
  let embedUrl = '';

  if (!url) {
    return <div className="max-w-md mx-auto aspect-w-1 aspect-h-1 bg-kotoba-text/10 flex items-center justify-center rounded-lg"><p className="text-kotoba-text/60">Video not available</p></div>;
  }

  if (url.includes("youtube.com") || url.includes("youtu.be")) {
    const videoId = url.split('v=')[1]?.split('&')[0] || url.split('/').pop();
    embedUrl = `https://www.youtube.com/embed/${videoId}`;
  } else if (url.includes("vimeo.com")) {
    const videoId = url.split('/').pop();
    embedUrl = `https://player.vimeo.com/video/${videoId}`;
  }

  if (!embedUrl) {
    return <div className="max-w-md mx-auto aspect-w-1 aspect-h-1 bg-kotoba-text/10 flex items-center justify-center rounded-lg"><p className="text-kotoba-text/60">Unsupported video URL</p></div>;
  }

  return (
    <div className="max-w-md mx-auto aspect-w-1 aspect-h-1">
      <iframe
        src={embedUrl}
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="w-full h-full rounded-lg shadow-md"
      ></iframe>
    </div>
  );
};

export default VideoPlayer;
