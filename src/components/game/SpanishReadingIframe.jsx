import { useEffect } from 'react';
import { base44 } from '@/api/base44Client';

export default function SpanishReadingIframe({ studentNumber, className, onBack }) {
  // Listen for session save messages from the HTML iframe
  useEffect(() => {
    const handler = async (event) => {
      if (!event.data || event.data.type !== 'saveSpanishSession') return;
      const data = event.data.data;
      try {
        await base44.entities.SpanishReadingSession.create(data);
        console.log('[SpanishReadingIframe] session saved', data);
      } catch (err) {
        console.warn('[SpanishReadingIframe] failed to save session', err);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const src = `/spanish-reading/index.html?number=${studentNumber || 0}&class=${encodeURIComponent(className || '')}`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <div className="flex items-center gap-3 px-4 py-2 bg-gray-100 border-b shrink-0">
        <button
          onClick={onBack}
          className="text-sm font-bold text-gray-600 hover:text-gray-900"
        >
          ← Back to Modes
        </button>
        <span className="text-sm font-semibold text-gray-700">📖 Spanish Reading</span>
      </div>
      <iframe
        src={src}
        className="flex-1 w-full border-0"
        title="Spanish Reading Game"
        allow="microphone"
      />
    </div>
  );
}