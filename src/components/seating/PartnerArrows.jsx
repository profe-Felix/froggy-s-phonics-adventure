import { useEffect, useState, useRef } from 'react';

/**
 * Renders prominent double-sided arrows between partnered students,
 * overlaid on the carpet grid. Arrows sit in the gap between adjacent
 * rows so they don't obscure the photos.
 *
 * Uses DOM measurement to find each cell's center, so it works regardless
 * of row sizes or temporary (solo-reassignment) pairings that cross columns.
 */
export default function PartnerArrows({ seats, partnerMap, containerRef }) {
  const [arrows, setArrows] = useState([]);
  const rafRef = useRef(null);

  useEffect(() => {
    const measure = () => {
      const container = containerRef.current;
      if (!container || !seats || !partnerMap) {
        setArrows([]);
        return;
      }
      const containerRect = container.getBoundingClientRect();

      // Build a map of student_id → edge points (relative to container)
      const centers = {};
      const cellEls = container.querySelectorAll('[data-student-id]');
      for (const el of cellEls) {
        const sid = el.getAttribute('data-student-id');
        if (!sid) continue;
        const r = el.getBoundingClientRect();
        centers[sid] = {
          x: r.left - containerRect.left + r.width / 2,
          top: r.top - containerRect.top,
          bottom: r.bottom - containerRect.top,
        };
      }

      // Build unique pairs (each pair drawn once)
      const seen = new Set();
      const pairs = [];
      for (const seat of seats) {
        const sid = seat.student_id;
        if (!sid) continue;
        const info = partnerMap[sid];
        if (!info || !info.partnerIds || info.partnerIds.length === 0) continue;
        for (const pid of info.partnerIds) {
          const key = [sid, pid].sort().join('::');
          if (seen.has(key)) continue;
          seen.add(key);
          if (!centers[sid] || !centers[pid]) continue;
          pairs.push({
            a: centers[sid],
            b: centers[pid],
            temporary: info.isTemporary,
          });
        }
      }
      setArrows(pairs);
    };

    // Defer to next frame so layout is settled after the gap-6 class applies
    rafRef.current = requestAnimationFrame(measure);

    const ro = new ResizeObserver(() => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(measure);
    });
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [seats, partnerMap, containerRef]);

  if (arrows.length === 0) return null;

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 15 }}
    >
      <defs>
        <marker
          id="partner-arrow-head"
          markerWidth="7"
          markerHeight="7"
          refX="6"
          refY="3.5"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L7,3.5 L0,7 Z" fill="#228BE6" />
        </marker>
        <marker
          id="partner-arrow-head-temp"
          markerWidth="7"
          markerHeight="7"
          refX="6"
          refY="3.5"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L7,3.5 L0,7 Z" fill="#f97316" />
        </marker>
      </defs>
      {arrows.map((p, i) => {
        // Draw from bottom of the upper cell to top of the lower cell
        const aTop = p.a.top < p.b.top ? p.a : p.b;
        const aBot = p.a.top < p.b.top ? p.b : p.a;
        const y1 = aTop.bottom;
        const y2 = aBot.top;
        const x1 = aTop.x;
        const x2 = aBot.x;
        const color = p.temporary ? '#f97316' : '#228BE6';
        const marker = p.temporary ? 'url(#partner-arrow-head-temp)' : 'url(#partner-arrow-head)';
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={color}
            strokeWidth="4"
            strokeLinecap="round"
            markerStart={marker}
            markerEnd={marker}
          />
        );
      })}
    </svg>
  );
}