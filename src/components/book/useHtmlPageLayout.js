import { useCallback, useEffect, useState } from 'react';
import { getHtmlWordHighlights } from '@/components/book/htmlBookDocument';

export default function useHtmlPageLayout(containerRef, iframeRef, sourceDocument, highlightWords) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [loaded, setLoaded] = useState(false);
  const [highlights, setHighlights] = useState([]);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize(previous => previous.width === width && previous.height === height ? previous : { width, height });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef]);
  const handleLoad = useCallback(async () => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body) return;
    await doc.fonts?.ready;
    if (iframeRef.current?.contentDocument !== doc) return;
    setLoaded(true);
    setHighlights(getHtmlWordHighlights(doc, sourceDocument.width, sourceDocument.height, highlightWords));
  }, [iframeRef, sourceDocument, highlightWords]);
  useEffect(() => {
    if (loaded) setHighlights(getHtmlWordHighlights(iframeRef.current?.contentDocument, sourceDocument.width, sourceDocument.height, highlightWords));
  }, [loaded, highlightWords, iframeRef, sourceDocument]);
  const scale = size.width > 0 && size.height > 0
    ? Math.min(size.width / sourceDocument.width, size.height / sourceDocument.height)
    : 0;
  return { handleLoad, loaded, highlights, scale, width: sourceDocument.width * scale, height: sourceDocument.height * scale };
}