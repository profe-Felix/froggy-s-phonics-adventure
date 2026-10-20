import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { normalizePoint, strokePath } from '@/components/book/teacherInk';

// Finds the box of the actually rendered page (canvas / img / iframe) inside
// the page cell so strokes align with the page, not the letterbox.
function measurePageBox(cell) {
  const cellRect = cell.getBoundingClientRect();
  let best = null;
  for (const el of cell.querySelectorAll('canvas, img, iframe')) {
    if (el.closest('[data-ink-layer]')) continue;
    let r = el.getBoundingClientRect();
    // A width:100%/height:100% object-contain image includes letterboxing in
    // its element box. Anchor ink to the actual image pixels instead.
    if (el.tagName === 'IMG' && el.naturalWidth && el.naturalHeight
      && getComputedStyle(el).objectFit === 'contain') {
      const scale = Math.min(r.width / el.naturalWidth, r.height / el.naturalHeight);
      const width = el.naturalWidth * scale, height = el.naturalHeight * scale;
      const left = r.left + (r.width - width) / 2, top = r.top + (r.height - height) / 2;
      r = { left, top, right: left + width, bottom: top + height, width, height };
    }
    const area = r.width * r.height;
    if (area > 400 && (!best || area > best.area)) best = { r, area };
  }
  const r = best?.r || cellRect;
  const left = Math.max(r.left, cellRect.left), top = Math.max(r.top, cellRect.top);
  const right = Math.min(r.right, cellRect.right), bottom = Math.min(r.bottom, cellRect.bottom);
  return { left: left - cellRect.left, top: top - cellRect.top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

// Teacher-only overlay for one page. When no tool is active it is
// pointer-events:none so page controls and existing overlays stay usable.
export default function TeacherInkLayer({ ink, pageKey }) {
  const hostRef = useRef(null);
  const svgRef = useRef(null);
  const [box, setBox] = useState(null);
  const [draft, setDraft] = useState(null);
  const drawingRef = useRef(null);
  const drawing = !!ink.tool;

  useLayoutEffect(() => {
    const cell = hostRef.current?.parentElement;
    if (!cell) return;
    let raf = 0;
    const recalc = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setBox((prev) => {
        const b = measurePageBox(cell);
        return prev && prev.left === b.left && prev.top === b.top && prev.width === b.width && prev.height === b.height ? prev : b;
      }));
    };
    recalc();
    const ro = new ResizeObserver(recalc);
    ro.observe(cell);
    const mo = new MutationObserver(recalc);
    mo.observe(cell, { subtree: true, childList: true, attributes: true, attributeFilter: ['width', 'height', 'style', 'src', 'class'] });
    cell.addEventListener('load', recalc, true);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); mo.disconnect(); cell.removeEventListener('load', recalc, true); };
  }, [pageKey]);

  // Block native touch scrolling/swipes while a tool is active (needs a
  // non-passive listener; React touch handlers are passive).
  useEffect(() => {
    const el = svgRef.current;
    if (!el || !drawing) return;
    const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
    el.addEventListener('touchstart', stop, { passive: false });
    el.addEventListener('touchmove', stop, { passive: false });
    return () => { el.removeEventListener('touchstart', stop); el.removeEventListener('touchmove', stop); };
  }, [drawing, box]);

  useEffect(() => { drawingRef.current = null; setDraft(null); }, [pageKey, ink.tool]);

  const point = (e) => normalizePoint(e.clientX, e.clientY, svgRef.current?.getBoundingClientRect());

  const onDown = (e) => {
    if (!drawing || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault(); e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = point(e);
    if (!p) return;
    if (ink.tool === 'erase') { drawingRef.current = { erase: true, id: e.pointerId }; ink.erase(pageKey, p); return; }
    drawingRef.current = { id: e.pointerId, tool: ink.tool, color: ink.color, points: [p] };
    setDraft(drawingRef.current);
  };
  const onMove = (e) => {
    const d = drawingRef.current;
    if (!d || d.id !== e.pointerId) return;
    e.preventDefault(); e.stopPropagation();
    const events = e.nativeEvent.getCoalescedEvents?.() || [e];
    if (d.erase) { for (const ev of events) { const p = point(ev); if (p) ink.erase(pageKey, p); } return; }
    const pts = d.points.slice();
    for (const ev of events) {
      const p = point(ev);
      const last = pts[pts.length - 1];
      if (p && (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.002)) pts.push(p);
    }
    drawingRef.current = { ...d, points: pts };
    setDraft(drawingRef.current);
  };
  const onUp = (e) => {
    const d = drawingRef.current;
    if (!d || d.id !== e.pointerId) return;
    e.stopPropagation();
    drawingRef.current = null;
    setDraft(null);
    if (!d.erase) ink.add(pageKey, { tool: d.tool, color: d.color, points: d.points.map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)]) });
  };

  const strokes = ink.strokes[pageKey] || [];
  const all = draft ? [...strokes, draft] : strokes;
  const w = box?.width || 0, h = box?.height || 0;
  const scale = Math.max(1, Math.min(w, h) / 600);

  return (
    <div ref={hostRef} data-ink-layer="" data-testid={`layer-teacher-ink-${pageKey}`} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 35 }}>
      {box && w > 0 && (
        <svg
          ref={svgRef}
          width={w}
          height={h}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onClick={(e) => drawing && e.stopPropagation()}
          style={{
            position: 'absolute', left: box.left, top: box.top,
            pointerEvents: drawing ? 'auto' : 'none',
            touchAction: drawing ? 'none' : 'auto',
            cursor: drawing ? (ink.tool === 'erase' ? 'cell' : 'crosshair') : 'default',
            outline: drawing ? '2px dashed rgba(245, 158, 11, 0.55)' : 'none',
            outlineOffset: -2,
          }}
        >
          {all.map((s, i) => {
            const hl = s.tool === 'highlight';
            if (s.points.length === 1) {
              return <circle key={i} cx={s.points[0][0] * w} cy={s.points[0][1] * h} r={(hl ? 11 : 3.5) * scale} fill={s.color} opacity={hl ? 0.35 : 0.95} />;
            }
            return (
              <path key={i} d={strokePath(s.points, w, h)} fill="none" stroke={s.color}
                strokeWidth={(hl ? 22 : 6) * scale} strokeLinecap={hl ? 'butt' : 'round'} strokeLinejoin="round"
                opacity={hl ? 0.35 : 0.95} style={hl ? { mixBlendMode: 'multiply' } : undefined} />
            );
          })}
        </svg>
      )}
    </div>
  );
}
