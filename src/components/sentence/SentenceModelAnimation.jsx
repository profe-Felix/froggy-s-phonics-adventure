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

const CH = 375; // matches SentenceWritingLines CANVAS_H (one line set)
const SKY = 0.10 * CH;
const GRASS = 0.633 * CH;
const DIRT = 0.90 * CH;
const WP_TOP = 0.10, WP_DIRT = 0.92;
const WP_BASE_FRAC = (0.72 - WP_TOP) / (WP_DIRT - WP_TOP); // 0.756
const BASE_CELL_H = 0.705 * CH; // cap-top lands on sky, baseline lands on grass
const BASE_CELL_W = 0.52 * BASE_CELL_H;
const SPACE_W = 0.50 * BASE_CELL_W;
const INK = '#0f766e'; // teal-700 — matches the app's ink-fill color
const OUTLINE = '#cbd5e1'; // slate-300

function mapPoint(wx, wy, cellX, cellTop, cellW, cellH) {
  return {
    x: cellX + wx * cellW,
    y: cellTop + ((wy - WP_TOP) / (WP_DIRT - WP_TOP)) * cellH,
  };
}

export default function SentenceModelAnimation({
  text, startX, maxX, lineIndex = 0, playing = true, replayKey = 0,
}) {
  const lineOffset = lineIndex * CH;
  const skyY = SKY + lineOffset;
  const grassY = GRASS + lineOffset;
  const dirtY = DIRT + lineOffset;
  const availW = Math.max(40, maxX - startX);

  // Parse + layout (auto-fit so the whole sentence fits the available width)
  const { chars, scale } = useMemo(() => {
    const parsed = [];
    let tw = 0;
    for (const ch of text) {
      if (ch === ' ') {
        parsed.push({ type: 'space', w: SPACE_W });
        tw += SPACE_W;
      } else {
        const wp = LETTER_WAYPOINTS[ch] || LETTER_WAYPOINTS[ch.toLowerCase()];
        if (wp && wp.strokes && wp.strokes.length) {
          parsed.push({ type: 'letter', ch, strokes: wp.strokes, w: BASE_CELL_W });
          tw += BASE_CELL_W;
        } else {
          // punctuation / unknown — narrow slot, rendered as a glyph
          parsed.push({ type: 'punct', ch, w: BASE_CELL_W * 0.35 });
          tw += BASE_CELL_W * 0.35;
        }
      }
    }
    return { chars: parsed, scale: tw > availW ? availW / tw : 1 };
  }, [text, availW]);

  const total = chars.length;
  const cellH = BASE_CELL_H * scale;
  const cellW = BASE_CELL_W * scale;
  const cellTop = grassY - WP_BASE_FRAC * cellH;

  // x positions
  const positioned = useMemo(() => {
    let cursor = startX;
    return chars.map((c) => {
      const x = cursor;
      cursor += c.w * scale;
      return { ...c, x, w: c.w * scale };
    });
  }, [chars, scale, startX]);

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
        const np = p + dt * 3; // ~3 chars/sec
        return np >= total ? total : np;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, total, replayKey, text]);

  if (!text || total === 0) return null;

  return (
    <g>
      {/* Faint outlines of all letters (always visible as a writing guide) */}
      {positioned.map((c, i) => {
        if (c.type !== 'letter') return null;
        return c.strokes.map((stroke, si) => {
          if (stroke.length === 1) {
            const p = mapPoint(stroke[0].x, stroke[0].y, c.x, cellTop, c.w, cellH);
            return <circle key={`o-${i}-${si}`} cx={p.x} cy={p.y} r={c.w * 0.07} fill={OUTLINE} opacity="0.5" />;
          }
          const pts = stroke.map((pt) => mapPoint(pt.x, pt.y, c.x, cellTop, c.w, cellH));
          return (
            <path key={`o-${i}-${si}`} d={splinePathD(pts)} fill="none"
              stroke={OUTLINE} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
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
                stroke="#f59e0b" strokeWidth="2.5" strokeDasharray="5 5" />
              <text x={cx} y={skyY - 6} fontSize={cellH * 0.22} textAnchor="middle">👆</text>
            </g>
          );
        }
        if (c.type === 'punct') {
          return (
            <text key={`pu-${i}`} x={c.x + c.w / 2} y={grassY}
              fontSize={cellH * 0.45} fill={INK} textAnchor="middle" opacity={cp}>
              {c.ch}
            </text>
          );
        }
        // letter
        const numStrokes = c.strokes.length;
        return c.strokes.map((stroke, si) => {
          const sp = Math.max(0, Math.min(1, cp * numStrokes - si));
          if (stroke.length === 1) {
            const p = mapPoint(stroke[0].x, stroke[0].y, c.x, cellTop, c.w, cellH);
            return <circle key={`i-${i}-${si}`} cx={p.x} cy={p.y} r={c.w * 0.07} fill={INK} opacity={sp} />;
          }
          const pts = stroke.map((pt) => mapPoint(pt.x, pt.y, c.x, cellTop, c.w, cellH));
          return (
            <path key={`i-${i}-${si}`} d={splinePathD(pts)} fill="none"
              stroke={INK} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"
              pathLength={1} strokeDasharray="1" strokeDashoffset={1 - sp} />
          );
        });
      })}
    </g>
  );
}