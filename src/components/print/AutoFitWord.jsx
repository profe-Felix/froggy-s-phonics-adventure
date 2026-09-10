import React, { useRef, useLayoutEffect } from 'react';

// AutoFitWord — binary-searches the largest font size that fits the card's
// width AND height, then sets it directly on the DOM (no state, no re-render
// loop). Used for text-only HFW / sight-word cards so each word fills its card
// instead of sitting at a fixed 0.5in with huge side margins.
//
// Units: all sizes are in CSS inches (1in = 96px). clientWidth/Height return
// pre-transform layout px, so the measurement is correct regardless of the
// sheet's zoom transform and matches physical inches in print.
export default function AutoFitWord({
  text,
  maxFontIn = 1.2,
  minFontIn = 0.15,
  paddingIn = 0.08,
}) {
  const containerRef = useRef(null);
  const textRef = useRef(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const textEl = textRef.current;
    if (!container || !textEl) return;

    const fit = () => {
      const targetW = container.clientWidth - paddingIn * 96;
      const targetH = container.clientHeight - paddingIn * 96;
      let lo = minFontIn * 96;
      let hi = maxFontIn * 96;
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        textEl.style.fontSize = mid + 'px';
        if (textEl.offsetWidth <= targetW && textEl.offsetHeight <= targetH) {
          lo = mid;
        } else {
          hi = mid;
        }
      }
      textEl.style.fontSize = lo + 'px';
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(container);
    return () => ro.disconnect();
  }, [text, maxFontIn, minFontIn, paddingIn]);

  return (
    <div ref={containerRef} className="w-full h-full flex items-center justify-center" style={{ overflow: 'hidden' }}>
      <span
        ref={textRef}
        style={{
          fontWeight: 700,
          fontFamily: "'Teachers', system-ui, sans-serif",
          fontFeatureSettings: "'ss10'",
          color: '#1e293b',
          lineHeight: 1.05,
          whiteSpace: 'nowrap',
        }}
      >
        {text}
      </span>
    </div>
  );
}