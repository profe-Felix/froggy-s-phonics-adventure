import { useRef, useState, useEffect } from 'react';

// Draggable + resizable image overlay (like a PowerPoint slide).
// Drag the image to reposition; drag the bottom-right handle to resize.
// Works with mouse and touch.
export default function MovableImage({ src, alt }) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [width, setWidth] = useState(400);
  const [ratio, setRatio] = useState(1);
  const dragRef = useRef(null);

  useEffect(() => {
    const im = new Image();
    im.onload = () => setRatio(im.naturalWidth / im.naturalHeight || 1);
    im.src = src;
  }, [src]);

  const startDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const p = e.touches ? e.touches[0] : e;
    dragRef.current = { mode: 'drag', px: p.clientX, py: p.clientY, ox: pos.x, oy: pos.y };
  };

  const startResize = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const p = e.touches ? e.touches[0] : e;
    dragRef.current = { mode: 'resize', px: p.clientX, pw: width };
  };

  useEffect(() => {
    const move = (e) => {
      if (!dragRef.current) return;
      e.preventDefault();
      const p = e.touches ? e.touches[0] : e;
      if (dragRef.current.mode === 'drag') {
        setPos({
          x: dragRef.current.ox + (p.clientX - dragRef.current.px),
          y: dragRef.current.oy + (p.clientY - dragRef.current.py),
        });
      } else {
        setWidth(Math.max(100, dragRef.current.pw + (p.clientX - dragRef.current.px)));
      }
    };
    const end = () => { dragRef.current = null; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', end);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', end);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', end);
    };
  }, []);

  return (
    <div
      className="absolute z-30 select-none"
      style={{
        left: `calc(50% + ${pos.x}px)`,
        top: `calc(50% + ${pos.y}px)`,
        transform: 'translate(-50%, -50%)',
        width,
        cursor: 'grab',
        touchAction: 'none',
      }}
      onMouseDown={startDrag}
      onTouchStart={startDrag}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="block w-full rounded-lg bg-white shadow-2xl"
        style={{ height: ratio ? width / ratio : 'auto' }}
      />
      <div
        className="absolute -bottom-1.5 -right-1.5 h-7 w-7 cursor-nwse-resize rounded-bl-lg rounded-tr-lg border-2 border-white bg-indigo-500 shadow-lg"
        onMouseDown={startResize}
        onTouchStart={startResize}
      />
    </div>
  );
}