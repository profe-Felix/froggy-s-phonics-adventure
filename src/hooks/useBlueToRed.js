import { useState, useEffect } from 'react';
import { replaceBlueWithRed } from '@/lib/blueToRed';

// Returns a version of the image URL where blue-dominant pixels (the baked-in
// blue card frame) have been replaced with red. Falls back to the original
// URL if canvas processing fails (e.g. CORS).
export function useBlueToRed(imageUrl) {
  const [processedUrl, setProcessedUrl] = useState(imageUrl);

  useEffect(() => {
    let cancelled = false;
    if (!imageUrl) return;
    replaceBlueWithRed(imageUrl).then((url) => {
      if (!cancelled) setProcessedUrl(url);
    });
    return () => { cancelled = true; };
  }, [imageUrl]);

  return processedUrl;
}