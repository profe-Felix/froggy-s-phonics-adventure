import { useEffect, useRef, useState } from 'react';

export default function VocabularyContextPage({ hit }) {
  const container = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) => setSize(entry.contentRect));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const scale = hit ? Math.min(size.width / hit.width, size.height / hit.height) : 0;
  return <div ref={container} className="flex h-full min-h-0 w-full items-center justify-center overflow-hidden bg-slate-100" data-testid="vocabulary-context-page">
    {hit && scale > 0 && <div className="relative shrink-0 bg-white shadow-sm" style={{ width: hit.width * scale, height: hit.height * scale }}>
      {hit.html ? <iframe title={`${hit.bookTitle}, page ${hit.pageNumber}`}
        sandbox="allow-same-origin" referrerPolicy="no-referrer" srcDoc={hit.html}
        tabIndex={-1} className="absolute left-0 top-0 origin-top-left border-0 pointer-events-none"
        style={{ width: hit.width, height: hit.height, transform: `scale(${scale})` }} />
        : <img src={hit.image} alt={`${hit.bookTitle}, page ${hit.pageNumber}`} className="block h-full w-full object-contain" />}
      {hit.rects.map((rect, index) => <mark key={index} aria-label={`Highlighted ${hit.matchedWord}`}
        className="pointer-events-none absolute rounded-sm border border-amber-600 bg-yellow-300/50 mix-blend-multiply"
        style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }} />)}
    </div>}
  </div>;
}
