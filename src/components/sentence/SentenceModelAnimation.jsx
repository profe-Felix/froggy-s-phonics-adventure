import React, { useState, useEffect, useRef, useMemo } from 'react';
import { LETTER_WAYPOINTS } from '@/components/data/letterWaypoints';
import { splinePathD } from '@/components/tracing/strokeMath';

// Animated model sentence rendered with letter FORMATION PATHWAYS (waypoints)
// instead of a font. Each letter's strokes draw in sequence (stroke-dashoffset
// "scrub") so students see how to form the letter, then the next, left-to-right.
// A vertical dashed amber line + 👆 finger emoji marks each word space.
//
// Only the active row animates; inactive rows show the fully-drawn sentence.
// `replayKey` changes → animation restarts from the first letter.
//
// Y-mapping matches WordTracingCanvas: `y: pt.y * CH` (no remapping —
// waypoints are authored to align with guide lines at 0.10, 0.367, 0.633, 0.90).
// X-layout uses actual ink bounds + tight gap (like computeWordLayout) so
// letters sit naturally close together instead of in fixed-width cells.

const CH = 375; // matches SentenceWritingLines CANVAS_H (one line set)
const SKY = 0.10 * CH;
const GRASS = 0.633 * CH;
const DIRT = 0.90 * CH;
const BASE_X_SCALE = 260; // x scale for waypoints — slightly narrower than tall
const LETTER_GAP = 10;   // gap between letters in viewBox units
const SPACE_W = 35;       // space width in viewBox units
const INK = '#0f766e';    // teal-700 — matches the app's ink-fill color
const OUTLINE = '#cbd5e1'; // slate-300
const INK_STROKE = 4.5;   // screen px (non-scaling)
const OUTLINE_STROKE = 3; // screen px (non-scaling)

// Compute a letter's ink bounds (minX, maxX) across all its strokes
function letterBounds(strokes) {
  let minX = Infinity, maxX = -Infinity;
  for (const stroke of strokes) {
    if (!Array.isArray(stroke)) continue;
    for (const p of stroke) {
      if (p && p.x != null) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
      }
    }
  }
  if (!isFinite(minX)) { minX = 0; maxX = 0.5; }
  return { minX, maxX };
}

export default function SentenceModelAnimation({
  text, startX, maxX, lineIndex = 0, playing = true, replayKey = 0,
}) {
  const lineOffset = lineIndex * CH;
  const skyY = SKY + lineOffset;
  const grassY = GRASS + lineOffset;
  const dirtY = DIRT + lineOffset;
  const availW = Math.max(40, maxX - startX);

  // Parse + layout using actual ink widths (like WordTracingCanvas computeWordLayout)
  const { chars, xScale } = useMemo(() => {
    const parsed = [];
    let totalW = 0;
    for (const ch of text) {
      if (ch === ' ') {
        parsed.push({ type: 'space', w: SPACE_W });
        totalW += SPACE_W;
      } else {
        const wp = LETTER_WAYPOINTS[ch] || LETTER_WAYPOINTS[ch.toLowerCase()];
        if (wp && wp.strokes && wp.strokes.length) {
          const b = letterBounds(wp.strokes);
          const inkW = (b.maxX - b.minX) * BASE_X_SCALE;
          parsed.push({ type: 'letter', ch, strokes: wp.strokes, minX: b.minX, maxX: b.maxX, w: inkW });
          totalW += inkW + LETTER_GAP;
        } else {
          // punctuation / unknown — narrow slot
          const w = BASE_X_SCALE * 0.2;
          parsed.push({ type: 'punct', ch, w });
          totalW += w + LETTER_GAP;
        }
      }
    }
    // Remove trailing gap
    totalW -= LETTER_GAP;
    // Auto-fit: scale x down if the sentence is wider than available space
    const fitScale = totalW > availW ? availW / totalW : 1;
    return { chars: parsed, xScale: fitScale };
  }, [text, availW]);

  const total = chars.length;

  // Compute x positions for each char
  const positioned = useMemo(() => {
    let cursor = startX;
    return chars.map((c) => {
      const w = c.w * xScale;
      const x = cursor;
      cursor += w + (c.type === 'space' ? 0 : LETTER_GAP * xScale);
      return { ...c, x, w };
    });
  }, [chars, xScale, startX]);

  // Animation progress (0 → total chars)
  const [progress, setProgress] = useState(playing ? 0 : total);
  const rafRef = useRef();

  // Reset on text / playing / replay changes
  useEffect(() => {
    setProgress(playing ? 0 : total);
  }, [playing, replayKey, text]); // eslint-disable-line

  useEffect(() => {
    if (!playing || total === 0) return;
    let last = performance.now();
    const tick = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      setProgress((p) => {
        const np = p + dt * 1.2; // ~1.2 chars/sec — slow enough to follow
        return np >= total ? total : np;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, total, replayKey, text]);

  if (!text || total === 0) return null;

  // Map a waypoint point to SVG coords for a given letter
  const mapPoint = (pt, c) => ({
    x: c.x + (pt.x - c.minX) * BASE_X_SCALE * xScale,
    y: pt.y * CH + lineOffset, // direct y mapping — same as WordTracingCanvas
  });

  return (
    <g>
      {/* Faint outlines of all letters (always visible as a writing guide) */}
      {positioned.map((c, i) => {
        if (c.type !== 'letter') return null;
        return c.strokes.map((stroke, si) => {
          if (stroke.length === 1) {
            const p = mapPoint(stroke[0], c);
            return <circle key={`o-${i}-${si}`} cx={p.x} cy={p.y} r={3} fill={OUTLINE} opacity="0.45" vectorEffect="non-scaling-stroke" />;
          }
          const pts = stroke.map((pt) => mapPoint(pt, c));
          return (
            <path key={`o-${i}-${si}`} d={splinePathD(pts)} fill="none"
              stroke={OUTLINE} strokeWidth={OUTLINE_STROKE} strokeLinecap="round" strokeLinejoin="round"
              opacity="0.45" vectorEffect="non-scaling-stroke" />
          );
        });
      })}

      {/* Animated ink + space markers + punctuation */}
      {positioned.map((c, i) => {
        const cp = Math.max(0, Math.min(1, progress - i));

        if (c.type === 'space') {
          const cx = c.x + c.w / 2;
          return (
            <g key={`sp-${i}`} opacity={cp}>
              <line x1={cx} y1={skyY} x2={cx} y2={dirtY}
                stroke="#f59e0b" strokeWidth="2" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
              <text x={cx} y={skyY - 4} fontSize={14} textAnchor="middle">👆</text>
            </g>
          );
        }
        if (c.type === 'punct') {
          return (
            <text key={`pu-${i}`} x={c.x + c.w / 2} y={grassY}
              fontSize={18} fill={INK} textAnchor="middle" opacity={cp}>
              {c.ch}
            </text>
          );
        }
        // letter
        const numStrokes = c.strokes.length;
        return c.strokes.map((stroke, si) => {
          const sp = Math.max(0, Math.min(1, cp * numStrokes - si));
          if (stroke.length === 1) {
            const p = mapPoint(stroke[0], c);
            return <circle key={`i-${i}-${si}`} cx={p.x} cy={p.y} r={3} fill={INK} opacity={sp} vectorEffect="non-scaling-stroke" />;
          }
          const pts = stroke.map((pt) => mapPoint(pt, c));
          return (
            <path key={`i-${i}-${si}`} d={splinePathD(pts)} fill="none"
              stroke={INK} strokeWidth={INK_STROKE} strokeLinecap="round" strokeLinejoin="round"
              pathLength={1} strokeDasharray="1" strokeDashoffset={1 - sp}
              vectorEffect="non-scaling-stroke" />
          );
        });
      })}
    </g>
  );
}