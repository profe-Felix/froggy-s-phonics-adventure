import { useMemo } from 'react';
import { splinePathD, pointAtLength } from '@/components/tracing/strokeMath';
import { ACCENT_MAP } from '@/lib/accentLetters';

// Accent mark rendered as a font glyph (Andika) above the base letter, instead
// of tiny waypoint strokes that get lost above a cramped dictado line. Matches
// the "font accent above it" approach the teacher requested.
const ACCENT_GLYPH = {
  acute: '\u00B4',     // ´
  tilde: '\u02DC',    // ˜
  diaeresis: '\u00A8' // ¨
};

// Static, non-interactive rendering of the faint letter model (the correct
// formation) for a dictado trace row. Students see this as a guide and write
// their red corrections freehand over it on the AnnotationCanvas above it.
//
// `startX` offsets the letters past the left guide area (fence + backgrounds).
// `progress` (0..1) drives the scrubber LETTER BY LETTER: each letter's strokes
// draw in order, completing one letter before the next begins, so the student
// can follow along and trace properly. progress >= 1 shows the full model.
// `waypoints` is the merged waypoint set (built-in + DB overrides) from the
// parent, so corners flagged in the authoring tool stay sharp here too.
// During replay a contrasting pen-tip dot travels the active stroke so the
// student can see where the pen point is against the gray ink.

const MODEL = '#1e293b';
const PEN_TIP = '#f97316'; // contrasting orange pen point during replay

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

export default function DictadoModelGuide({ word, width, height, startX = 0, progress = 1, waypoints }) {
  const wp = waypoints || {};

  const { letters, layout, xScale, scaledStrokes } = useMemo(() => {
    const rawChars = (word || '').split('');
    const chars = rawChars.map(ch => {
      // If the character (including accented) has its own authored waypoints,
      // use them directly — the accent is part of the stroke data.
      if (wp[ch]) {
        return { ch, base: ch, strokes: wp[ch].strokes || [] };
      }
      // Fallback for accented chars without their own waypoints: base strokes
      // + a font-rendered accent glyph above the letter.
      const acc = ACCENT_MAP[ch];
      if (acc && wp[acc.base]) {
        return { ch, base: acc.base, accent: acc.accent, strokes: wp[acc.base].strokes || [] };
      }
      return null;
    }).filter(Boolean);
    const bounds = chars.map(c => {
      const baseStrokes = wp[c.base]?.strokes || [];
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
    // Scale each stroke into page px, PRESERVING the corner flag so splinePathD
    // keeps sharp turns (matches the tracing authoring tool's rendering).
    const scaleForLetter = (pt, li) => {
      const l = lay[li];
      if (!l) return { x: 0, y: 0 };
      return {
        x: l.offset + (pt.x - l.minX) * xs,
        y: (l.yOffset + pt.y * l.yScale) * height,
        corner: pt.corner,
      };
    };
    const scaled = chars.map((c, li) =>
      (c.strokes || []).map(st => st.map(p => scaleForLetter(p, li)))
    );
    return { letters: chars, layout: lay, xScale: xs, scaledStrokes: scaled };
  }, [word, width, height, startX, wp]);

  if (!letters.length) return null;

  const MODEL_W = Math.max(0.8, height * 0.007);
  const scrubbing = progress < 1 && letters.length > 0;
  const numLetters = letters.length;

  // Letter-by-letter: progress 0..1 spans all letters equally. Each letter
  // completes fully before the next begins; within a letter, strokes draw in
  // order based on the within-letter fraction.
  let activeLetter = 0;
  let withinFrac = 0;
  if (scrubbing && numLetters > 0) {
    activeLetter = Math.min(numLetters - 1, Math.floor(progress * numLetters));
    withinFrac = progress * numLetters - activeLetter;
  }

  // Contrasting pen-tip dot: travels along the active stroke of the active
  // letter so the student can see the pen point against the gray ink.
  let penTip = null;
  if (scrubbing && numLetters > 0) {
    const strokes = scaledStrokes[activeLetter] || [];
    const strokeCount = strokes.length;
    if (strokeCount > 0) {
      const si = Math.min(strokeCount - 1, Math.floor(withinFrac * strokeCount));
      const frac = Math.max(0, Math.min(1, withinFrac * strokeCount - si));
      if (frac > 0 && frac < 1 && strokes[si] && strokes[si].length >= 2) {
        const pt = pointAtLength(strokes[si], frac);
        penTip = { x: pt.x, y: pt.y };
      }
    }
  }
  const PEN_R = Math.max(3, height * 0.05);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: 'absolute', left: 0, top: 0, width: `${width}px`, height: `${height}px`, pointerEvents: 'none', zIndex: 2, overflow: 'visible' }}
    >
      {letters.map((l, li) => {
        const strokes = scaledStrokes[li] || [];
        const strokeCount = strokes.length || 1;
        let letterFrac;
        if (!scrubbing) letterFrac = 1;
        else if (li < activeLetter) letterFrac = 1;
        else if (li > activeLetter) letterFrac = 0;
        else letterFrac = withinFrac;
        return strokes.map((stroke, si) => {
          const frac = scrubbing
            ? Math.max(0, Math.min(1, letterFrac * strokeCount - si))
            : 1;
          // A single-point stroke is a dot (the tittle on i/j). splinePathD
          // returns '' for < 2 points, so render it as a filled circle.
          if (stroke.length === 1) {
            const p = stroke[0];
            const dotVisible = scrubbing ? frac > 0 : true;
            return (
              <circle
                key={`m-${li}-${si}`}
                cx={p.x} cy={p.y} r={Math.max(2, MODEL_W * 1.5)}
                fill={MODEL} opacity={dotVisible ? 0.28 : 0}
              />
            );
          }
          return (
            <path
              key={`m-${li}-${si}`}
              d={splinePathD(stroke)}
              fill="none" stroke={MODEL} strokeWidth={MODEL_W}
              strokeLinecap="round" strokeLinejoin="round" opacity={0.28}
              pathLength={1}
              strokeDasharray={scrubbing ? 1 : undefined}
              strokeDashoffset={scrubbing ? 1 - frac : undefined}
            />
          );
        });
      })}
      {penTip && (
        <circle
          cx={penTip.x} cy={penTip.y} r={PEN_R} fill={PEN_TIP}
          stroke="white" strokeWidth={1.5}
          style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
        />
      )}
      {/* Font-rendered accent marks above accented letters (í, ñ, ü, ...). */}
      {letters.map((l, li) => {
        if (!l.accent) return null;
        const b = layout[li];
        if (!b) return null;
        const glyph = ACCENT_GLYPH[l.accent];
        if (!glyph) return null;
        const cx = b.offset + (b.minX + (b.maxX - b.minX) / 2 - b.minX) * xScale;
        // Place the glyph just above the letter's top ink edge.
        const topY = b.minY * height;
        const accentSize = height * 0.5;
        return (
          <text
            key={`acc-${li}`}
            x={cx}
            y={topY - accentSize * 0.02}
            fontSize={accentSize}
            fill={MODEL}
            textAnchor="middle"
            dominantBaseline="alphabetic"
            opacity={0.28}
            fontFamily="'Andika', sans-serif"
            fontWeight="bold"
          >
            {glyph}
          </text>
        );
      })}
    </svg>
  );
}