import React, { useState, useEffect, useRef, useMemo } from 'react';
import { LETTER_WAYPOINTS } from '@/components/data/letterWaypoints';
import { splinePathD } from '@/components/tracing/strokeMath';

// Animated model sentence rendered with letter FORMATION PATHWAYS (waypoints).
// Word-by-word progression: only the active word's letters animate; previous
// words are fully drawn, future words show as faint outlines.
//
// Y-mapping matches WordTracingCanvas: `y: pt.y * CH` (no remapping).
// X-layout uses actual ink bounds + comfortable gap. Word spaces are ~the
// width of a capital letter so words are clearly separated.

const CH = 375;
const SKY = 0.10 * CH;
const GRASS = 0.633 * CH;
const DIRT = 0.90 * CH;
const BASE_X_SCALE = 260;
const LETTER_GAP = 24;    // comfortable gap between letters
const INK = '#0f766e';
const OUTLINE = '#64748b';
const INK_STROKE = 4.5;
const OUTLINE_STROKE = 3;
const ANIM_SPEED = 0.45;  // chars/sec — slow enough for students to follow and write along

// Compute a letter's ink bounds (minX, maxX)
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

// Word space width ≈ width of a capital 'E' (or fallback)
function computeSpaceWidth() {
  const wp = LETTER_WAYPOINTS['E'] || LETTER_WAYPOINTS['A'] || LETTER_WAYPOINTS['O'];
  if (wp && wp.strokes) {
    const b = letterBounds(wp.strokes);
    return (b.maxX - b.minX) * BASE_X_SCALE * 0.9; // slightly less than E
  }
  return 95;
}
const BASE_SPACE_W = computeSpaceWidth();

export default function SentenceModelAnimation({
  text, startX, maxX, lineIndex = 0, activeWordIndex = -1, replayKey = 0,
  scrub = null, onProgress = null,
}) {
  const lineOffset = lineIndex * CH;
  const skyY = SKY + lineOffset;
  const grassY = GRASS + lineOffset;
  const dirtY = DIRT + lineOffset;
  const availW = Math.max(40, maxX - startX);

  // Parse text into positioned chars + compute word ranges
  const { chars, wordRanges, xScale } = useMemo(() => {
    const parsed = [];
    const ranges = [];
    let totalW = 0;
    let wordStart = 0;

    for (let ci = 0; ci < text.length; ci++) {
      const ch = text[ci];
      if (ch === ' ') {
        parsed.push({ type: 'space', w: BASE_SPACE_W });
        totalW += BASE_SPACE_W;
        // Close current word range (wordStart..ci)
        if (ci > wordStart) ranges.push({ start: wordStart, end: ci });
        wordStart = ci + 1;
      } else {
        const wp = LETTER_WAYPOINTS[ch] || LETTER_WAYPOINTS[ch.toLowerCase()];
        if (wp && wp.strokes && wp.strokes.length) {
          const b = letterBounds(wp.strokes);
          const inkW = (b.maxX - b.minX) * BASE_X_SCALE;
          parsed.push({ type: 'letter', ch, strokes: wp.strokes, minX: b.minX, maxX: b.maxX, w: inkW });
          totalW += inkW + LETTER_GAP;
        } else {
          const w = BASE_X_SCALE * 0.2;
          parsed.push({ type: 'punct', ch, w });
          totalW += w + LETTER_GAP;
        }
      }
    }
    // Close last word
    if (wordStart < text.length) ranges.push({ start: wordStart, end: text.length });
    totalW -= LETTER_GAP;
    const fitScale = totalW > availW ? availW / totalW : 1;
    return { chars: parsed, wordRanges: ranges, xScale: fitScale };
  }, [text, availW]);

  const total = chars.length;

  // Compute x positions
  const positioned = useMemo(() => {
    let cursor = startX;
    return chars.map((c) => {
      const w = c.w * xScale;
      const x = cursor;
      cursor += w + (c.type === 'space' ? 0 : LETTER_GAP * xScale);
      return { ...c, x, w };
    });
  }, [chars, xScale, startX]);

  // Active word's char range
  const activeRange = activeWordIndex >= 0 && activeWordIndex < wordRanges.length
    ? wordRanges[activeWordIndex] : null;
  const animStart = activeRange ? activeRange.start : 0;
  const animEnd = activeRange ? activeRange.end : 0;

  const [internalProgress, setInternalProgress] = useState(animStart);
  const scrubRef = useRef(scrub);
  scrubRef.current = scrub;
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;

  // When scrubbing, use the scrubbed position; otherwise use internal animated progress
  const progress = scrub != null
    ? animStart + scrub * (animEnd - animStart)
    : internalProgress;

  // Sync internal progress to the scrubbed value so release continues from there
  useEffect(() => {
    if (scrub != null) {
      setInternalProgress(animStart + scrub * (animEnd - animStart));
    }
  }, [scrub, animStart, animEnd]);

  // Reset progress when word/replay changes
  useEffect(() => {
    setInternalProgress(activeWordIndex >= 0 ? animStart : -1);
  }, [activeWordIndex, replayKey, animStart]); // eslint-disable-line

  // Animate within the active word's range only (pauses while scrubbing)
  useEffect(() => {
    if (activeWordIndex < 0 || !activeRange) return;
    let last = performance.now();
    const tick = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      if (scrubRef.current == null) {
        setInternalProgress((p) => {
          const np = p + dt * ANIM_SPEED;
          return np >= animEnd ? animEnd : np;
        });
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [activeWordIndex, replayKey, animStart, animEnd]); // eslint-disable-line

  // Report normalized progress (0-1) for the scrub bar
  useEffect(() => {
    if (!activeRange) return;
    const norm = animEnd > animStart ? (progress - animStart) / (animEnd - animStart) : 0;
    onProgressRef.current?.(Math.max(0, Math.min(1, norm)));
  }, [progress, animStart, animEnd, activeRange]); // eslint-disable-line

  const rafRef = useRef();

  if (!text || total === 0) return null;

  const mapPoint = (pt, c) => ({
    x: c.x + (pt.x - c.minX) * BASE_X_SCALE * xScale,
    y: pt.y * CH + lineOffset,
    // Preserve the authored sharp-corner flag so splinePathD produces a crisp
    // turn at flagged waypoints (e.g. the elbow of L, K, E) instead of a smooth
    // Catmull-Rom bulge.
    ...(pt.corner ? { corner: true } : {}),
  });

  // Per-char completion: 0 = outline only, 1 = fully drawn
  const charProgress = (i) => {
    if (activeWordIndex < 0) return 0;
    if (i < animStart) return 1;           // previous word — fully drawn
    if (i >= animEnd) return 0;            // future word — outline only
    return Math.max(0, Math.min(1, progress - i)); // active word — animate
  };

  return (
    <g>
      {/* Faint outlines of all letters + punctuation (writing guide).
          Punctuation has no waypoints, so it's drawn with a font (Andika)
          instead of a spline path. */}
      {positioned.map((c, i) => {
        if (c.type === 'punct') {
          return (
            <text key={`o-${i}`} x={c.x + c.w / 2} y={grassY}
              fontSize={120} fill={OUTLINE} textAnchor="middle" opacity="0.75"
              fontFamily="'Andika', sans-serif" fontWeight="bold">
              {c.ch}
            </text>
          );
        }
        if (c.type !== 'letter') return null;
        return c.strokes.map((stroke, si) => {
          if (stroke.length === 1) {
            const p = mapPoint(stroke[0], c);
            return <circle key={`o-${i}-${si}`} cx={p.x} cy={p.y} r={3} fill={OUTLINE} opacity="0.75" vectorEffect="non-scaling-stroke" />;
          }
          const pts = stroke.map((pt) => mapPoint(pt, c));
          return (
            <path key={`o-${i}-${si}`} d={splinePathD(pts)} fill="none"
              stroke={OUTLINE} strokeWidth={OUTLINE_STROKE} strokeLinecap="round" strokeLinejoin="round"
              opacity="0.75" vectorEffect="non-scaling-stroke" />
          );
        });
      })}

      {/* Animated ink + space markers + punctuation */}
      {positioned.map((c, i) => {
        const cp = charProgress(i);

        if (c.type === 'space') {
          // Show space marker only if the word before it has been started
          const visible = activeWordIndex >= 0 && i < animEnd;
          if (!visible) return null;
          const cx = c.x + c.w / 2;
          return (
            <g key={`sp-${i}`}>
              <line x1={cx} y1={skyY} x2={cx} y2={dirtY}
                stroke="#f59e0b" strokeWidth="2" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
              <text x={cx} y={skyY - 4} fontSize={14} textAnchor="middle">👆</text>
            </g>
          );
        }
        if (c.type === 'punct') {
          if (cp <= 0) return null;
          return (
            <text key={`pu-${i}`} x={c.x + c.w / 2} y={grassY}
              fontSize={120} fill={INK} textAnchor="middle" opacity={cp}
              fontFamily="'Andika', sans-serif" fontWeight="bold">
              {c.ch}
            </text>
          );
        }
        // letter
        if (cp <= 0) return null;
        const numStrokes = c.strokes.length;
        return c.strokes.map((stroke, si) => {
          const sp = Math.max(0, Math.min(1, cp * numStrokes - si));
          if (sp <= 0) return null;
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