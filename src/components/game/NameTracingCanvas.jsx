import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import {
  dist, buildDensePath, coverageComplete, computeWordLayout,
  COVERAGE_RADIUS, MIN_COVER_FRAC, GUIDE_COLORS,
} from '@/lib/tracingCore';
import { splinePathD } from '@/components/tracing/strokeMath';

// One row of a name — letters laid out horizontally using the same waypoint
// system as LetterTracingCanvas. Three modes with decreasing support:
//   guided   — dot-to-dot guide path + coverage validation
//   trace    — faded outline of the letters + coverage validation
//   freehand — a single start dot, no validation (ink threshold + Done button)
// No sound. Calls onComplete when the row is finished.

const X_SCALE = 300;
const CANVAS_H = 375;
const LETTER_GAP = 18;
const PADDING = 30;
const DOT_STEP = 11; // spacing between guide dots (guided mode)
const MIN_INK_PX = 120; // freehand: minimum total ink length to allow "Done"

export default function NameTracingCanvas({
  name,
  waypoints,
  mode = 'guided', // 'guided' | 'trace' | 'freehand'
  renderWidth = 320,
  rowHeight = 360,
  onComplete,
}) {
  const isFreehand = mode === 'freehand';
  const isGuided = mode === 'guided';

  // Layout: one repetition of the name.
  const { layout, totalW } = useMemo(
    () => computeWordLayout(name, waypoints, X_SCALE, LETTER_GAP, PADDING, 1, 0),
    [name, waypoints]
  );

  // Build dense paths for every stroke of every letter (for coverage validation
  // + guide-dot rendering). Each entry: { letterIndex, strokeIndex, dense }.
  const allStrokes = useMemo(() => {
    const out = [];
    layout.forEach((lay, li) => {
      const strokes = waypoints[lay.ch]?.strokes || [];
      const scaleFn = (pt) => ({
        x: lay.offset + (pt.x - lay.minX) * X_SCALE,
        y: pt.y * CANVAS_H,
      });
      strokes.forEach((stroke, si) => {
        const clean = Array.isArray(stroke)
          ? stroke.filter((p) => p && p.x != null && p.y != null)
          : [];
        const dense = clean.length ? buildDensePath(clean, scaleFn, 3) : [];
        out.push({ letterIndex: li, strokeIndex: si, dense, scaleFn });
      });
    });
    return out;
  }, [layout, waypoints]);

  const totalDenseLen = useMemo(
    () => allStrokes.reduce((sum, s) => sum + s.dense.length, 0),
    [allStrokes]
  );

  // SVG coordinate conversion
  const svgRef = useRef(null);
  const toSvg = useCallback((clientX, clientY) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const inv = ctm.inverse();
    const p = pt.matrixTransform(inv);
    return { x: p.x, y: p.y };
  }, []);

  const [drawing, setDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState([]);
  const currentPathRef = useRef([]);
  const [drawnPaths, setDrawnPaths] = useState([]);
  const visitedRef = useRef(new Set()); // dense indices visited (all strokes)
  const [completed, setCompleted] = useState(false);
  const [enoughInk, setEnoughInk] = useState(false);
  const usingPointerRef = useRef(false);
  const usingTouchRef = useRef(false);

  // Reset when name/mode changes
  useEffect(() => {
    setDrawing(false);
    setCurrentPath([]);
    currentPathRef.current = [];
    setDrawnPaths([]);
    visitedRef.current = new Set();
    setCompleted(false);
    setEnoughInk(false);
  }, [name, mode]);

  const inkLength = useCallback((paths) => {
    let len = 0;
    for (const pts of paths) {
      for (let i = 1; i < pts.length; i++) len += dist(pts[i], pts[i - 1]);
    }
    return len;
  }, []);

  const checkComplete = useCallback(() => {
    if (isFreehand) {
      const totalInk = inkLength(drawnPaths) + inkLength(currentPathRef.current.length ? [currentPathRef.current] : []);
      setEnoughInk(totalInk >= MIN_INK_PX);
      return;
    }
    // guided/trace: coverage across all strokes collectively
    if (totalDenseLen <= 1) { setCompleted(true); return; }
    const frac = visitedRef.current.size / totalDenseLen;
    if (frac >= MIN_COVER_FRAC && !completed) {
      setCompleted(true);
    }
  }, [isFreehand, drawnPaths, inkLength, totalDenseLen, completed]);

  const handleDown = (clientX, clientY) => {
    if (completed) return;
    const p = toSvg(clientX, clientY);
    if (!p) return;
    setDrawing(true);
    setCurrentPath([p]);
    currentPathRef.current = [p];
  };

  const handleMove = (clientX, clientY) => {
    if (!drawing || completed) return;
    const p = toSvg(clientX, clientY);
    if (!p) return;
    const last = currentPathRef.current[currentPathRef.current.length - 1];
    if (last && dist(p, last) < 2) return;
    currentPathRef.current = [...currentPathRef.current, p];
    setCurrentPath(currentPathRef.current);

    // Coverage: mark dense points near the pen
    if (!isFreehand) {
      for (const s of allStrokes) {
        for (let i = 0; i < s.dense.length; i++) {
          if (visitedRef.current.has(s.letterIndex * 100000 + s.strokeIndex * 10000 + i)) continue;
          if (dist(p, s.dense[i]) <= COVERAGE_RADIUS) {
            visitedRef.current.add(s.letterIndex * 100000 + s.strokeIndex * 10000 + i);
          }
        }
      }
    }
    checkComplete();
  };

  const handleUp = () => {
    if (!drawing) return;
    setDrawing(false);
    if (currentPathRef.current.length > 1) {
      setDrawnPaths((prev) => [...prev, currentPathRef.current]);
    }
    currentPathRef.current = [];
    setCurrentPath([]);
    checkComplete();
    // Auto-complete on lift if coverage met
    if (!isFreehand && !completed) {
      const frac = visitedRef.current.size / Math.max(1, totalDenseLen);
      if (frac >= MIN_COVER_FRAC) {
        setCompleted(true);
      }
    }
  };

  // Fire onComplete when completed (guided/trace) or Done pressed (freehand)
  useEffect(() => {
    if (completed && !isFreehand) {
      onComplete?.();
    }
  }, [completed, isFreehand, onComplete]);

  const onPointerDown = (e) => {
    if (usingTouchRef.current) return;
    usingPointerRef.current = true;
    handleDown(e.clientX, e.clientY);
  };
  const onPointerMove = (e) => {
    if (!usingPointerRef.current) return;
    handleMove(e.clientX, e.clientY);
  };
  const onPointerUp = () => {
    if (!usingPointerRef.current) return;
    usingPointerRef.current = false;
    handleUp();
  };
  const onTouchStart = (e) => {
    if (usingPointerRef.current) return;
    usingTouchRef.current = true;
    const t = e.touches[0];
    if (t) handleDown(t.clientX, t.clientY);
  };
  const onTouchMove = (e) => {
    if (!usingTouchRef.current) return;
    e.preventDefault();
    const t = e.touches[0];
    if (t) handleMove(t.clientX, t.clientY);
  };
  const onTouchEnd = () => {
    if (!usingTouchRef.current) return;
    usingTouchRef.current = false;
    handleUp();
  };

  const pathD = (pts) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  // Start dot position (first letter, first stroke, first point)
  const startDot = useMemo(() => {
    if (!allStrokes.length) return null;
    const s = allStrokes[0];
    return s.dense[0] || null;
  }, [allStrokes]);

  return (
    <div className="flex flex-col items-center select-none" style={{ width: renderWidth }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${totalW} ${CANVAS_H}`}
        className="rounded-2xl border-4 border-slate-200 bg-white shrink-0"
        style={{
          display: 'block',
          width: renderWidth,
          height: rowHeight,
          cursor: 'crosshair',
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
        }}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        {/* Guide lines — same as LetterTracingCanvas */}
        <line x1="0" y1={0.10 * CANVAS_H} x2={totalW} y2={0.10 * CANVAS_H} stroke="#93c5fd" strokeWidth="2.5" opacity="0.8" vectorEffect="non-scaling-stroke" />
        <line x1="0" y1={0.367 * CANVAS_H} x2={totalW} y2={0.367 * CANVAS_H} stroke="#000" strokeWidth="2" strokeDasharray="8 6" opacity="0.8" vectorEffect="non-scaling-stroke" />
        <line x1="0" y1={0.633 * CANVAS_H} x2={totalW} y2={0.633 * CANVAS_H} stroke="#16a34a" strokeWidth="2.5" opacity="0.8" vectorEffect="non-scaling-stroke" />
        <line x1="0" y1={0.90 * CANVAS_H} x2={totalW} y2={0.90 * CANVAS_H} stroke="#fca5a5" strokeWidth="2.5" strokeDasharray="6 6" opacity="0.85" vectorEffect="non-scaling-stroke" />

        {/* Guide rendering */}
        {isGuided && allStrokes.map((s) => {
          // Render dot-to-dot guides along the dense path
          const dots = [];
          for (let i = 0; i < s.dense.length; i += Math.max(1, Math.round(DOT_STEP / 3))) {
            dots.push(s.dense[i]);
          }
          if (s.dense.length && dots[dots.length - 1] !== s.dense[s.dense.length - 1]) {
            dots.push(s.dense[s.dense.length - 1]);
          }
          const color = GUIDE_COLORS[s.strokeIndex % GUIDE_COLORS.length];
          return dots.map((p, di) => (
            <circle key={`g-${s.letterIndex}-${s.strokeIndex}-${di}`} cx={p.x} cy={p.y} r="3.5" fill={color} opacity="0.55" pointerEvents="none" />
          ));
        })}

        {mode === 'trace' && allStrokes.map((s) => {
          if (s.dense.length < 2) {
            const p = s.dense[0];
            return p ? <circle key={`t-${s.letterIndex}-${s.strokeIndex}`} cx={p.x} cy={p.y} r="4" fill="#94a3b8" opacity="0.3" pointerEvents="none" /> : null;
          }
          return (
            <path
              key={`t-${s.letterIndex}-${s.strokeIndex}`}
              d={splinePathD(s.dense)}
              fill="none"
              stroke="#94a3b8"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.3"
              pointerEvents="none"
            />
          );
        })}

        {/* Start dot — shown in guided (numbered) and freehand (just the dot) */}
        {startDot && !completed && (
          <>
            {isGuided && (
              <circle cx={startDot.x} cy={startDot.y} r="16" fill={GUIDE_COLORS[0]} opacity="0.15">
                <animate attributeName="r" values="12;20;12" dur="1s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.2;0.05;0.2" dur="1s" repeatCount="indefinite" />
              </circle>
            )}
            <circle cx={startDot.x} cy={startDot.y} r={isGuided ? 8 : 7} fill={isGuided ? GUIDE_COLORS[0] : '#6366f1'} opacity={isFreehand ? 0.5 : 1} pointerEvents="none" />
            {isGuided && (
              <text x={startDot.x} y={startDot.y + 4} textAnchor="middle" fontSize="9" fill="white" fontWeight="bold" pointerEvents="none">1</text>
            )}
          </>
        )}

        {/* Drawn paths (completed strokes) */}
        {drawnPaths.map((pts, i) => (
          <path key={`d-${i}`} d={pathD(pts)} fill="none" stroke="#6366f1" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" pointerEvents="none" />
        ))}

        {/* Current drawing path */}
        {currentPath.length > 1 && (
          <path d={pathD(currentPath)} fill="none" stroke="#6366f1" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" pointerEvents="none" />
        )}

        {/* Completion check */}
        {completed && !isFreehand && (
          <g pointerEvents="none">
            <circle cx={totalW - 30} cy={30} r="16" fill="#22c55e" />
            <path d="M -7 0 L -2 5 L 7 -5" transform={`translate(${totalW - 30} 30)`} stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        )}
      </svg>

      {/* Freehand: Done button */}
      {isFreehand && (
        <div className="h-9 shrink-0 flex items-center justify-center mt-1">
          {completed ? (
            <div className="bg-green-100 border border-green-400 rounded-full px-4 py-1 text-green-800 font-bold text-sm">🎉 Done!</div>
          ) : enoughInk ? (
            <button
              onClick={() => { setCompleted(true); onComplete?.(); }}
              className="bg-green-500 hover:bg-green-600 text-white font-bold text-sm px-5 py-1.5 rounded-full shadow-md"
            >
              ✓ Done
            </button>
          ) : (
            <div className="text-amber-700 text-xs font-bold">✏️ Write your whole name…</div>
          )}
        </div>
      )}
    </div>
  );
}