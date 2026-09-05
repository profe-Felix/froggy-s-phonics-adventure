import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import {
  dist, buildDensePath, coverageComplete, computeWordLayout,
  COVERAGE_RADIUS, MIN_COVER_FRAC, GUIDE_COLORS,
} from '@/lib/tracingCore';
import { splinePathD } from '@/components/tracing/strokeMath';

// One row of a name — letters laid out horizontally using the same waypoint
// system as LetterTracingCanvas. Two modes:
//   guided   — colored spline pathways + numbered start dots + coverage validation
//   dot_only — just the start dots for each stroke, freehand drawing, ink threshold
// No sound. Calls onComplete(strokes?) when the row is finished.
// For dot_only, passes normalized strokes (0-1) for teacher review/saving.

const X_SCALE = 300;
const CANVAS_H = 375;
const LETTER_GAP = 18;
const PADDING = 30;
const MIN_INK_PX = 120;

export default function NameTracingCanvas({
  name,
  waypoints,
  mode = 'guided',
  renderWidth = 320,
  onComplete,
}) {
  const isDotOnly = mode === 'dot_only';
  const isGuided = mode === 'guided';

  // Layout: one repetition of the name (only traceable letters).
  const { layout, totalW } = useMemo(
    () => computeWordLayout(name, waypoints, X_SCALE, LETTER_GAP, PADDING, 1, 0),
    [name, waypoints]
  );

  // Build dense paths for every stroke of every letter (for coverage validation
  // + guide rendering). Each entry: { letterIndex, strokeIndex, dense, scaledPts }.
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
        const scaledPts = clean.map(scaleFn);
        const dense = clean.length ? buildDensePath(clean, scaleFn, 3) : [];
        out.push({ letterIndex: li, strokeIndex: si, dense, scaledPts, scaleFn });
      });
    });
    return out;
  }, [layout, waypoints]);

  const totalDenseLen = useMemo(
    () => allStrokes.reduce((sum, s) => sum + s.dense.length, 0),
    [allStrokes]
  );

  // SVG height proportional to width so the name fills the width.
  const renderH = totalW > 0 ? renderWidth * (CANVAS_H / totalW) : renderWidth * 1.25;

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
  const visitedRef = useRef(new Set());
  const [completed, setCompleted] = useState(false);
  const [enoughInk, setEnoughInk] = useState(false);
  const usingPointerRef = useRef(false);
  const usingTouchRef = useRef(false);

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
    if (isDotOnly) {
      const totalInk = inkLength(drawnPaths) + inkLength(currentPathRef.current.length ? [currentPathRef.current] : []);
      setEnoughInk(totalInk >= MIN_INK_PX);
      return;
    }
    if (totalDenseLen <= 1) { setCompleted(true); return; }
    const frac = visitedRef.current.size / totalDenseLen;
    if (frac >= MIN_COVER_FRAC && !completed) {
      setCompleted(true);
    }
  }, [isDotOnly, drawnPaths, inkLength, totalDenseLen, completed]);

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

    if (isGuided) {
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
    if (isGuided && !completed) {
      const frac = visitedRef.current.size / Math.max(1, totalDenseLen);
      if (frac >= MIN_COVER_FRAC) {
        setCompleted(true);
      }
    }
  };

  // Fire onComplete when completed
  useEffect(() => {
    if (completed && isGuided) {
      onComplete?.();
    }
  }, [completed, isGuided, onComplete]);

  const onPointerDown = (e) => {
    if (usingTouchRef.current) return;
    usingPointerRef.current = true;
    try { svgRef.current?.setPointerCapture(e.pointerId); } catch {}
    handleDown(e.clientX, e.clientY);
  };
  const onPointerMove = (e) => {
    if (!usingPointerRef.current) return;
    handleMove(e.clientX, e.clientY);
  };
  const onPointerUp = (e) => {
    if (!usingPointerRef.current) return;
    usingPointerRef.current = false;
    try { svgRef.current?.releasePointerCapture(e.pointerId); } catch {}
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

  const pathD = (pts) => pts.length < 2 ? '' :
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  // Normalize strokes to 0-1 for saving
  const normalizeStrokes = useCallback(() => {
    return drawnPaths.map((stroke) =>
      stroke.map((p) => ({ x: p.x / totalW, y: p.y / CANVAS_H }))
    );
  }, [drawnPaths, totalW]);

  const handleDone = () => {
    setCompleted(true);
    onComplete?.(normalizeStrokes());
  };

  return (
    <div className="flex flex-col items-center select-none" style={{ width: renderWidth }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${totalW} ${CANVAS_H}`}
        preserveAspectRatio="xMidYMid meet"
        className={`rounded-2xl border-4 shrink-0 ${completed ? 'border-green-400 bg-green-50' : 'border-slate-200 bg-white'}`}
        style={{
          display: 'block',
          width: renderWidth,
          height: renderH,
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

        {/* Guided mode: colored spline pathways for all strokes */}
        {isGuided && allStrokes.map((s, i) => {
          const color = GUIDE_COLORS[s.strokeIndex % GUIDE_COLORS.length];
          if (s.scaledPts.length < 2) {
            const p = s.scaledPts[0];
            return p ? <circle key={`path-${i}`} cx={p.x} cy={p.y} r="5" fill={color} opacity="0.55" pointerEvents="none" /> : null;
          }
          return (
            <path
              key={`path-${i}`}
              d={splinePathD(s.scaledPts)}
              fill="none"
              stroke={color}
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.55"
              pointerEvents="none"
            />
          );
        })}

        {/* Start dots — numbered in guided, plain in dot_only */}
        {allStrokes.map((s, i) => {
          const p = s.dense[0];
          if (!p) return null;
          const color = GUIDE_COLORS[s.strokeIndex % GUIDE_COLORS.length];
          return (
            <g key={`start-${i}`} pointerEvents="none">
              {isGuided && !completed && (
                <>
                  <circle cx={p.x} cy={p.y} r="14" fill={color} opacity="0.12">
                    <animate attributeName="r" values="10;16;10" dur="1s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.15;0.05;0.15" dur="1s" repeatCount="indefinite" />
                  </circle>
                  <circle cx={p.x} cy={p.y} r="8" fill={color} />
                  <text x={p.x} y={p.y + 3} textAnchor="middle" fontSize="9" fill="white" fontWeight="bold">{i + 1}</text>
                </>
              )}
              {isDotOnly && !completed && (
                <circle cx={p.x} cy={p.y} r="6" fill="#6366f1" opacity="0.35" />
              )}
            </g>
          );
        })}

        {/* Drawn paths */}
        {drawnPaths.map((pts, i) => (
          <path key={`d-${i}`} d={pathD(pts)} fill="none" stroke="#6366f1" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" pointerEvents="none" />
        ))}

        {/* Current drawing path */}
        {currentPath.length > 1 && (
          <path d={pathD(currentPath)} fill="none" stroke="#6366f1" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" pointerEvents="none" />
        )}

        {/* Completion check */}
        {completed && (
          <g pointerEvents="none">
            <circle cx={totalW - 25} cy={25} r="14" fill="#22c55e" />
            <path d="M -6 0 L -2 4 L 6 -5" transform={`translate(${totalW - 25} 25)`} stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        )}
      </svg>

      {/* Dot-only: Done button */}
      {isDotOnly && (
        <div className="h-9 shrink-0 flex items-center justify-center mt-1">
          {completed ? (
            <div className="bg-green-100 border border-green-400 rounded-full px-4 py-1 text-green-800 font-bold text-sm">🎉 Done!</div>
          ) : enoughInk ? (
            <button
              onClick={handleDone}
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