import { useEffect, useRef } from 'react';

export default function SpanishReadingGame({ onBack }) {
  const iframeRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (e.data === 'go-back') onBack();
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onBack]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'white' }}>
      <iframe
        ref={iframeRef}
        src="/spanish-reading-game.html"
        style={{ width: '100%', height: '100%', border: 'none' }}
        allow="microphone"
      />
    </div>
  );
}