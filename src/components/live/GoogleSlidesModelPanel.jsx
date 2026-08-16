import { useEffect } from 'react';

// Teacher's model panel for Google Slides during the "I do" phase. Embeds the
// presentation via its publish-to-web URL and broadcasts the URL to student
// mirrors so they see the same slides on their devices.
export default function GoogleSlidesModelPanel({ step, send }) {
  const url = step?.config?.slidesUrl || '';

  // Broadcast the slides URL so student mirrors load the same embed.
  useEffect(() => {
    if (url) send({ type: 'google_slides', url });
  }, [url, send]);

  if (!url) {
    return (
      <div className="h-full flex items-center justify-center text-slate-400 text-lg font-bold">
        No slides URL configured.
      </div>
    );
  }

  return (
    <div className="h-full p-4 flex flex-col overflow-hidden">
      <div className="text-xs font-bold text-indigo-400 uppercase tracking-wide mb-2 shrink-0">
        Google Slides · Modeling — students see your slides
      </div>
      <div className="flex-1 min-h-0">
        <iframe
          src={url}
          className="w-full h-full rounded-xl border-0"
          allowFullScreen
          title={step?.title || 'Google Slides'}
        />
      </div>
    </div>
  );
}