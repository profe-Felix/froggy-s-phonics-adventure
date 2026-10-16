import { useMemo } from 'react';
import { splinePathD } from '@/components/tracing/strokeMath';
import { LETTER_WAYPOINTS } from '@/components/data/letterWaypoints';
import { ACCENT_MAP, buildAccentStrokes } from '@/lib/accentLetters';

// Static, non-interactive rendering of the faint letter model (the correct
// formation) for a dictado trace row. Students see this as a guide and write
// their red corrections freehand over it on the AnnotationCanvas above it.
//
// `startX` offsets the letters past the left guide area (fence + backgrounds).
// `progress` (0..1) drives the scrubber: strokes are drawn in order up to that
// fraction of the total, using stroke-dashoffset so the student can follow
// along and trace properly. progress >= 1 shows the full model.

const MODEL = '#1e293b';

function letterBounds(strokes) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity;
  for (const s of strokes) {
    if (!Array.isArray(s)) continue;
    for (const p of s) {
      if (p && p.x != null) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y != null && p.y < minY) minY = p.y;
      }
    }
  }
  if (!isFinite(minX)) { minX = 0; maxX = 0.5; }
  if (!isFinite(minY)) minY = 0;
  return { minX, maxX, minY, inkW: maxX - minX };
}

export default function DictadoModelGuide({ word, width, height, startX = 0, progress = 1 }) {
  const { letters, layout, xScale, flatIndexByLetter, totalStrokes } = useMemo(() => {
    const rawChars = (word || '').split('');
    const chars = rawChars.map(ch => {
      const acc = ACCENT_MAP[ch];
      if (acc && LETTER_WAYPOINTS[acc.base]) {
        const baseStrokes = LETTER_WAYPOINTS[acc.base].strokes || [];
        const b = letterBounds(baseStrokes);
        const accentStrokes = buildAccentStrokes(acc.accent, b);
        return { ch, base: acc.base, strokes: [...baseStrokes, ...accentStrokes] };
      }
      if (LETTER_WAYPOINTS[ch]) {
        return { ch, base: ch, strokes: LETTER_WAYPOINTS[ch].strokes || [] };
      }
      return null;
    }).filter(Boolean);
    const bounds = chars.map(c => {
      const baseStrokes = LETTER_WAYPOINTS[c.base]?.strokes || [];
      return { ...c, ...letterBounds(baseStrokes) };
    });
    const yFit = height;
    const gapPx = height * 0.08;
    const padPx = height * 0.08;
    const sumInk = bounds.reduce((s, b) => s + b.inkW, 0) || 0.001;
    const fitX = (width - startX - 2 * padPx - Math.max(0, bounds.length - 1) * gapPx) / sumInk;
    const xs = Math.min(yFit, Math.max(yFit * 0.35, fitX));
    let cursor = startX + padPx;
    const lay = bounds.map(b => {
      const offset = cursor;
      const inkW = b.inkW * xs;
      cursor += inkW + gapPx;
      return { ...b, offset, yScale: 1.0, yOffset: 0.0 };
    });
    // Flatten stroke indices in order for the scrubber.
    let flatCounter = 0;
    const flatIdx = chars.map(c =>
      (c.strokes || []).map(() => flatCounter++)
    );
    return { letters: chars, layout: lay, xScale: xs, flatIndexByLetter: flatIdx, totalStrokes: flatCounter };
  }, [word, width, height, startX]);

  const scaleForLetter = (pt, li) => {
    const lay = layout[li];
    if (!lay) return { x: 0, y: 0 };
    return {
      x: lay.offset + (pt.x - lay.minX) * xScale,
      y: (lay.yOffset + pt.y * lay.yScale) * height,
    };
  };

  if (!letters.length) return null;

  const MODEL_W = Math.max(2, height * 0.016);
  const scrubbing = progress < 1 && totalStrokes > 0;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: 'absolute', left: 0, top: 0, width: `${width}px`, height: `${height}px`, pointerEvents: 'none', zIndex: 2, overflow: 'visible' }}
    >
      {letters.map((l, li) =>
        (l.strokes || []).map((stroke, si) => {
          const flatIdx = flatIndexByLetter[li]?.[si] ?? 0;
          const frac = scrubbing
            ? Math.max(0, Math.min(1, progress * totalStrokes - flatIdx))
            : 1;
          return (
            <path
              key={`m-${li}-${si}`}
              d={splinePathD(stroke.map(p => scaleForLetter(p, li)))}
              fill="none" stroke={MODEL} strokeWidth={MODEL_W}
              strokeLinecap="round" strokeLinejoin="round" opacity={0.28}
              pathLength={1}
              strokeDasharray={scrubbing ? 1 : undefined}
              strokeDashoffset={scrubbing ? 1 - frac : undefined}
            />
          );
        })
      )}
    </svg>
  );
}