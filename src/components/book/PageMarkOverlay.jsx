import { useEffect, useRef, useState } from 'react';
import MarkShape from './MarkShape';

// Sits inside a page wrapper in the reader and lines up with the rendered page
// (canvas or img), which is contain-fit and may not fill the wrapper.
export default function PageMarkOverlay({ mark }) {
  const ref = useRef(null);
  const [box, setBox] = useState(null);

  useEffect(() => {
    const measure = () => {
      const parent = ref.current?.parentElement;
      const page = parent?.querySelector('canvas, img');
      if (!parent || !page) return;
      const p = parent.getBoundingClientRect();
      const r = page.getBoundingClientRect();
      setBox({ left: r.left - p.left, top: r.top - p.top, width: r.width, height: r.height });
    };
    measure();
    const t = setInterval(measure, 400);
    return () => clearInterval(t);
  }, []);

  return (
    <div ref={ref} style={{ position: 'absolute', pointerEvents: 'none', zIndex: 5, ...(box || { display: 'none' }) }}>
      <MarkShape mark={mark} />
    </div>
  );
}