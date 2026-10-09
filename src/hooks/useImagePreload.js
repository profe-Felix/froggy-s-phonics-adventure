import { useEffect, useRef } from 'react';

// Preloads the next N unique image URLs without blocking the current view.
// Uses `new Image()` to trigger the browser's download pipeline at low
// priority. Deduplicates by URL and avoids restarting preloads on unrelated
// re-renders via a ref-based "already preloaded" set.
//
// Usage:
//   const urls = ['url1', 'url2', ...];  // ordered, current first
//   useImagePreload(urls, { count: 2 }); // preload next 2 after current
//
// The currently-visible URL (index 0) is NOT preloaded here — it's rendered
// in the DOM already. Only subsequent unique URLs are preloaded.

export function useImagePreload(urls, { count = 2 } = {}) {
  const preloadedRef = useRef(new Set());

  useEffect(() => {
    if (!urls || urls.length <= 1) return;

    // Collect up to `count` unique URLs after the first (current) one.
    const toPreload = [];
    const seen = new Set();
    for (let i = 1; i < urls.length && toPreload.length < count; i++) {
      const url = urls[i];
      if (!url || seen.has(url) || preloadedRef.current.has(url)) continue;
      seen.add(url);
      toPreload.push(url);
    }

    if (toPreload.length === 0) return;

    // Mark as preloaded immediately to prevent duplicate work on re-render.
    for (const url of toPreload) preloadedRef.current.add(url);

    // Use requestIdleCallback if available (non-blocking), else setTimeout.
    const schedule = window.requestIdleCallback || ((cb) => setTimeout(cb, 1));
    const cleanupFns = [];

    schedule(() => {
      for (const url of toPreload) {
        const img = new Image();
        img.src = url;
        // Don't need to wait — just trigger the download.
      }
    });

    return () => {
      // Nothing to clean up — images are cached by the browser once fetched.
    };
  }, [urls?.join(','), count]); // eslint-disable-line react-hooks/exhaustive-deps
}