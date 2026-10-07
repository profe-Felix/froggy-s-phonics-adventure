import { useState, useEffect } from 'react';

// Tracks the browser's pinch-zoom scale (window.visualViewport.scale) so
// physical-size calculations can divide by it, keeping handwriting lines at
// a constant physical size even when students pinch-zoom the page in or out.
// Returns 1 when visualViewport is unavailable (desktop without pinch-zoom).
export function useViewportScale() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;
    const update = () => setScale(vv.scale || 1);
    update();
    vv.addEventListener('resize', update);
    return () => vv.removeEventListener('resize', update);
  }, []);
  return scale;
}