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
          // Trio
          const trioIds = [sid, ...info.partnerIds];
          for (const tid of trioIds) processed.add(tid);
          const tc = trioIds.map(id => centers[id]).filter(Boolean);
          if (tc.length < 3) continue;
          const sorted = [...tc].sort((a, b) => a.top - b.top);
          const twoAbove = Math.abs(sorted[0].top - sorted[1].top) < Math.abs(sorted[1].top - sorted[2].top);
          const upperStudents = twoAbove ? [sorted[0], sorted[1]] : [sorted[0]];
          const lowerStudents = twoAbove ? [sorted[2]] : [sorted[1], sorted[2]];
          const upperBottom = Math.max(...upperStudents.map(c => c.bottom));
          const lowerTop = Math.min(...lowerStudents.map(c => c.top));
          const pairStudents = twoAbove ? upperStudents : lowerStudents;
          const extraStudent = twoAbove ? lowerStudents[0] : upperStudents[0];
          trios.push({
            midX: (pairStudents[0].x + pairStudents[1].x) / 2,
            extraX: extraStudent.x,
            extraBelow: twoAbove,
            cy: (upperBottom + lowerTop) / 2,
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
  const TRI_LEG = 18; // right-triangle leg length

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 15 }}>
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
      {markers.trios.map((t, i) => {
        const dx = t.extraX >= t.midX ? 1 : -1;
        const dy = t.extraBelow ? 1 : -1;
        const pts = `${t.midX},${t.cy} ${t.midX + dx * TRI_LEG},${t.cy} ${t.midX},${t.cy + dy * TRI_LEG}`;
        return (
          <polygon
            key={`trio-${i}`}
            points={pts}
            fill="white"
            stroke={t.temporary ? TEMP : PERM}
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
        );
      })}
    </svg>
  );
}