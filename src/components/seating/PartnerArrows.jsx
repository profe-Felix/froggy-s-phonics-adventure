import { useEffect, useState, useRef } from 'react';

/**
 * Renders geometric shape markers between partnered students,
 * overlaid on the carpet grid (no extra row spacing needed).
 *
 * - Pairs: white square straddling the border between the two cells
 * - Trios: white triangle straddling the border, pointing toward the solo side
 *
 * Blue border = permanent partner, orange border = temporary (solo reassigned).
 */
export default function PartnerArrows({ seats, partnerMap, containerRef }) {
  const [markers, setMarkers] = useState({ pairs: [], trios: [] });
  const rafRef = useRef(null);

  useEffect(() => {
    const measure = () => {
      const container = containerRef.current;
      if (!container || !seats || !partnerMap) {
        setMarkers({ pairs: [], trios: [] });
        return;
      }
      const containerRect = container.getBoundingClientRect();
      const centers = {};
      const cellEls = container.querySelectorAll('[data-student-id]');
      for (const el of cellEls) {
        const sid = el.getAttribute('data-student-id');
        if (!sid) continue;
        const r = el.getBoundingClientRect();
        centers[sid] = {
          x: r.left - containerRect.left + r.width / 2,
          y: r.top - containerRect.top + r.height / 2,
          top: r.top - containerRect.top,
          bottom: r.bottom - containerRect.top,
        };
      }

      const processed = new Set();
      const pairs = [];
      const trios = [];

      for (const seat of seats) {
        const sid = seat.student_id;
        if (!sid || processed.has(sid)) continue;
        const info = partnerMap[sid];
        if (!info || !info.partnerIds || info.partnerIds.length === 0) continue;

        if (info.partnerIds.length >= 2) {
          // Trio — L-shape: find the corner student (same column as one partner,
          // same row as the other). Right angle at the corner, short legs to each
          // partner, hypotenuse between the two partners (midpoint at grid corner).
          const trioIds = [sid, ...info.partnerIds];
          for (const tid of trioIds) processed.add(tid);
          const tc = trioIds.map(id => centers[id]).filter(Boolean);
          if (tc.length < 3) continue;
          let corner = null, arms = [];
          for (let i = 0; i < 3; i++) {
            const c = tc[i];
            const others = tc.filter((_, j) => j !== i);
            const sameCol = others.some(o => Math.abs(o.x - c.x) < 5);
            const sameRow = others.some(o => Math.abs(o.y - c.y) < 5);
            if (sameCol && sameRow) {
              corner = c;
              arms = others;
              break;
            }
          }
          if (!corner) continue;
          // Grid corner = midpoint of the two arms (hypotenuse midpoint anchor,
          // falls at the 4-square intersection).
          const gx = (arms[0].x + arms[1].x) / 2;
          const gy = (arms[0].y + arms[1].y) / 2;
          // Unit directions from corner toward each arm
          const d1x = arms[0].x - corner.x, d1y = arms[0].y - corner.y;
          const d1l = Math.hypot(d1x, d1y) || 1;
          const d2x = arms[1].x - corner.x, d2y = arms[1].y - corner.y;
          const d2l = Math.hypot(d2x, d2y) || 1;
          const u1x = d1x / d1l, u1y = d1y / d1l;
          const u2x = d2x / d2l, u2y = d2y / d2l;
          // Small triangle: legs of length L (= pair square width),
          // hypotenuse midpoint pinned at the grid corner.
          const L = 26, h = L / 2;
          trios.push({
            cx: gx - h * (u1x + u2x), cy: gy - h * (u1y + u2y),
            a1x: gx + h * (u1x - u2x), a1y: gy + h * (u1y - u2y),
            a2x: gx + h * (u2x - u1x), a2y: gy + h * (u2y - u1y),
            temporary: info.isTemporary,
          });
        } else if (info.partnerIds.length === 1) {
          // Pair
          const pid = info.partnerIds[0];
          processed.add(sid);
          processed.add(pid);
          if (!centers[sid] || !centers[pid]) continue;
          const a = centers[sid];
          const b = centers[pid];
          const upper = a.top < b.top ? a : b;
          const lower = a.top < b.top ? b : a;
          pairs.push({
            midX: (upper.x + lower.x) / 2,
            midY: (upper.bottom + lower.top) / 2,
            temporary: info.isTemporary,
          });
        }
      }

      setMarkers({ pairs, trios });
    };

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

  if (markers.pairs.length === 0 && markers.trios.length === 0) return null;

  const PERM = '#228BE6';
  const TEMP = '#f97316';
  const SQ_HALF = 13; // square half-size

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 15 }}>
      {markers.trios.map((t, i) => (
        <polygon
          key={`trio-${i}`}
          points={`${t.cx},${t.cy} ${t.a1x},${t.a1y} ${t.a2x},${t.a2y}`}
          fill="white"
          stroke={t.temporary ? TEMP : PERM}
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
      ))}
      {markers.pairs.map((p, i) => (
        <rect
          key={`pair-${i}`}
          x={p.midX - SQ_HALF}
          y={p.midY - SQ_HALF}
          width={SQ_HALF * 2}
          height={SQ_HALF * 2}
          rx="5"
          fill="white"
          stroke={p.temporary ? TEMP : PERM}
          strokeWidth="2.5"
        />
      ))}
    </svg>
  );
}