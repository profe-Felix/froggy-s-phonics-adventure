import { useLayoutEffect, useRef } from 'react';

// Shrinks the font size until each name line fits its container width without
// clipping. Used by table tags / labels so long names auto-fit.
export default function AutofitName({ first, last, maxFontSize = 20, minFontSize = 7, className = '' }) {
  const firstRef = useRef(null);
  const lastRef = useRef(null);

  useLayoutEffect(() => {
    const fit = (el) => {
      if (!el) return;
      let size = maxFontSize;
      el.style.fontSize = `${size}pt`;
      while (size > minFontSize && el.scrollWidth > el.clientWidth) {
        size -= 1;
        el.style.fontSize = `${size}pt`;
      }
    };
    fit(firstRef.current);
    fit(lastRef.current);
  }, [first, last, maxFontSize, minFontSize]);

  return (
    <div className={`flex flex-col items-center justify-center leading-tight w-full ${className}`}>
      <div ref={firstRef} className="font-bold text-black text-center whitespace-nowrap w-full">{first}</div>
      {last && <div ref={lastRef} className="font-bold text-black text-center whitespace-nowrap w-full">{last}</div>}
    </div>
  );
}