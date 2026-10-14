import { useEffect, useRef, useState } from 'react';
import { normalizeSpanish } from '@/lib/literacy/lessonProgression';

/**
 * Renders one HTML book page: the extracted page image with an overlay of
 * yellow highlight rects for known sight words. Uses the same highlightWords
 * Set (from useKnownSightWords) as PdfPageRenderer — no separate sight-word
 * system.
 *
 * Word positions are stored normalized 0-1 relative to the page image; they
 * are scaled to the image's displayed rect (which may differ from the
 * container when object-fit: contain letterboxes the image).
 */
export default function HtmlPageRenderer({ page, highlightWords, alignSelf = 'center' }) {
  const containerRef = useRef(null);
  const imgRef = useRef(null);
  const [imgRect, setImgRect] = useState(null);
  const [highlights, setHighlights] = useState([]);

  useEffect(() => {
    const update = () => {
      if (!imgRef.current || !containerRef.current) return;
      const cRect = containerRef.current.getBoundingClientRect();
      const iRect = imgRef.current.getBoundingClientRect();
      setImgRect({
        left: iRect.left - cRect.left,
        top: iRect.top - cRect.top,
        width: iRect.width,
        height: iRect.height,
      });
    };

    update();
    const obs = new ResizeObserver(update);
    if (containerRef.current) obs.observe(containerRef.current);
    const img = imgRef.current;
    if (img) {
      img.addEventListener('load', update);
      if (img.complete) update();
    }
    return () => {
      obs.disconnect();
      if (img) img.removeEventListener('load', update);
    };
  }, [page?.image_url]);

  useEffect(() => {
    if (!imgRect || !highlightWords || highlightWords.size === 0 || !page?.words?.length) {
      setHighlights([]);
      return;
    }

    const rects = page.words
      .filter((w) => w.text && highlightWords.has(normalizeSpanish(w.text)))
      .map((w) => ({
        left: imgRect.left + w.x * imgRect.width,
        top: imgRect.top + w.y * imgRect.height,
        width: w.w * imgRect.width,
        height: w.h * imgRect.height,
      }));

    setHighlights(rects);
  }, [imgRect, highlightWords, page]);

  const justifyContent =
    alignSelf === 'flex-start'
      ? 'flex-start'
      : alignSelf === 'flex-end'
        ? 'flex-end'
        : 'center';

  if (!page?.image_url) {
    return (
      <div className="flex items-center justify-center w-full h-full text-gray-400">
        No page image
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent,
        overflow: 'hidden',
        background: '#fff',
      }}
    >
      <img
        ref={imgRef}
        src={page.image_url}
        alt={`Page ${page.page_number}`}
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain',
          display: 'block',
        }}
      />
      {highlights.length > 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 5,
          }}
        >
          {highlights.map((r, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: r.left,
                top: r.top,
                width: r.width,
                height: r.height,
                background: 'rgba(250, 204, 21, 0.35)',
                borderRadius: '2px',
                mixBlendMode: 'multiply',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}