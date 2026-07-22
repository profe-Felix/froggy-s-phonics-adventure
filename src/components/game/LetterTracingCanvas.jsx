import { useRef, useState, useEffect, useCallback, useMemo } from 'react';

const CANVAS_W = 300;
const CANVAS_H = 375; // matches calibration 400×500 (4:5) aspect ratio
const HIT_RADIUS = 10; // pixels to count as hitting a waypoint
const WOBBLE_RADIUS = 20; // px — max deviation from the ideal path; beyond this = wobble, restart stroke

function scale(pt) {
  return { x: pt.x * CANVAS_W, y: pt.y * CANVAS_H };
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Densely sample the ideal path for a stroke by interpolating between its
// waypoints at a fixed pixel step. Used for wobble detection (distance from
// each drawn point to the nearest ideal point) and for the replay hint.
function buildDensePath(waypoints, step = 3) {
  const pts = waypoints.map(scale);
  if (pts.length === 1) return [pts[0]];
  const dense = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const segLen = dist(a, b);
    const n = Math.max(1, Math.round(segLen / step));
    for (let j = 0; j < n; j++) {
      const t = j / n;
      dense.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  dense.push(pts[pts.length - 1]);
  return dense;
}

// Score a finished stroke 0–100: each drawn point's closeness to the nearest
// ideal point is averaged. A point on the ideal path scores 100; one `penalty`
// px away scores 0.
function strokeAccuracy(drawnPts, idealDense, penalty = 30) {
  if (!drawnPts.length || !idealDense.length) return 100;
  let sum = 0;
  for (const p of drawnPts) {
    let minD = Infinity;
    for (const q of idealDense) {
      const d = dist(p, q);
      if (d < minD) minD = d;
    }
    sum += Math.max(0, 100 * (1 - minD / penalty));
  }
  return Math.round(sum / drawnPts.length);
}

export default function LetterTracingCanvas({ letter, strokes, onComplete, onReset, onAccuracy }) {
  const [strokeIndex, setStrokeIndex] = useState(0);
  const [waypointIndex, setWaypointIndex] = useState(0);
  const [drawing, setDrawing] = useState(false);
  const [drawnPaths, setDrawnPaths] = useState([]); // completed stroke paths
  const [currentPath, setCurrentPath] = useState([]);
  const currentPathRef = useRef([]); // always-current ref to avoid stale closure
  const pendingCompleteRef = useRef(false); // last waypoint hit, waiting for pointerUp
  const [status, setStatus] = useState('idle'); // idle | tracing | lift | success | error
  const [errorFlash, setErrorFlash] = useState(false);
  const [awaitingLift, setAwaitingLift] = useState(false); // true once the last waypoint is hit, while still holding
  const svgRef = useRef(null);
  const [accuracy, setAccuracy] = useState(null); // overall letter accuracy 0–100
  const strokeAccuraciesRef = useRef([]); // per-stroke scores, averaged on completion
  const [replaying, setReplaying] = useState(false);
  const [replayPts, setReplayPts] = useState([]);
  const replayRafRef = useRef(null);

  const densePath = useMemo(() => {
    const wp = strokes[strokeIndex];
    return wp && wp.length ? buildDensePath(wp) : [];
  }, [strokes, strokeIndex]);

  // Cancel any in-flight replay animation when the component unmounts.
  useEffect(() => () => {
    if (replayRafRef.current) cancelAnimationFrame(replayRafRef.current);
  }, []);

  // Reset when letter changes
  useEffect(() => {
    setStrokeIndex(0);
    setWaypointIndex(0);
    setDrawing(false);
    setDrawnPaths([]);
    setCurrentPath([]);
    setStatus('idle');
    setErrorFlash(false);
    setAwaitingLift(false);
    pendingCompleteRef.current = false;
    if (replayRafRef.current) { cancelAnimationFrame(replayRafRef.current); replayRafRef.current = null; }
    setReplaying(false);
    setReplayPts([]);
    setAccuracy(null);
    strokeAccuraciesRef.current = [];
  }, [letter]);

  const getPos = (e) => {
    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = useCallback((e) => {
    e.preventDefault();
    if (status === 'success') return;
    const pos = getPos(e);
    const currentStrokes = strokes[strokeIndex];
    if (!currentStrokes) return;
    const firstWp = scale(currentStrokes[0]);
    // Must start near the first waypoint of current stroke
    if (waypointIndex === 0 && dist(pos, firstWp) > HIT_RADIUS * 1.8) {
      flashError();
      return;
    }
    if (replayRafRef.current) { cancelAnimationFrame(replayRafRef.current); replayRafRef.current = null; }
    setReplaying(false);
    setReplayPts([]);
    setDrawing(true);
    setStatus('tracing');
    currentPathRef.current = [pos];
    setCurrentPath([pos]);
  }, [status, strokeIndex, waypointIndex, strokes]);

  const flashError = () => {
    setErrorFlash(true);
    setTimeout(() => setErrorFlash(false), 600);
  };

  const handlePointerMove = useCallback((e) => {
    e.preventDefault();
    if (!drawing || status !== 'tracing') return;
    if (pendingCompleteRef.current) return; // waiting for pointer-up, ignore moves
    const pos = getPos(e);
    currentPathRef.current = [...currentPathRef.current, pos];
    setCurrentPath(currentPathRef.current);

    const currentStrokes = strokes[strokeIndex];
    if (!currentStrokes) return;

    // Wobble detection: measure distance from this point to the nearest point
    // on the densely-sampled ideal path. Beyond WOBBLE_RADIUS the stroke is
    // wandering off the letter — restart it.
    if (densePath.length) {
      let minD = Infinity;
      for (let i = 0; i < densePath.length; i++) {
        const d = dist(pos, densePath[i]);
        if (d < minD) minD = d;
      }
      if (minD > WOBBLE_RADIUS) {
        flashError();
        currentPathRef.current = [];
        setCurrentPath([]);
        setWaypointIndex(0);
        setDrawing(false);
        setStatus('idle');
        return;
      }
    }

    const nextWp = scale(currentStrokes[waypointIndex]);

    if (dist(pos, nextWp) < HIT_RADIUS) {
      const newWpIdx = waypointIndex + 1;
      if (newWpIdx >= currentStrokes.length) {
        // Last waypoint hit — wait for pointerUp before finalising
        pendingCompleteRef.current = true;
        setAwaitingLift(true);
        setWaypointIndex(newWpIdx); // advance so dot disappears
      } else {
        setWaypointIndex(newWpIdx);
      }
    }
  }, [drawing, status, strokeIndex, waypointIndex, strokes, currentPath, onComplete, densePath]);

  const handlePointerUp = useCallback((e) => {
    e.preventDefault();
    if (!drawing) return;
    setDrawing(false);
    if (replayRafRef.current) { cancelAnimationFrame(replayRafRef.current); replayRafRef.current = null; }
    setReplaying(false);
    setReplayPts([]);

    if (pendingCompleteRef.current) {
      pendingCompleteRef.current = false;
      setAwaitingLift(false);
      const completedPath = [...currentPathRef.current];
      currentPathRef.current = [];
      setDrawnPaths(prev => [...prev, completedPath]);
      setCurrentPath([]);
      strokeAccuraciesRef.current.push(strokeAccuracy(completedPath, densePath));
      const newStrokeIdx = strokeIndex + 1;
      if (newStrokeIdx >= strokes.length) {
        setStatus('success');
        const accs = strokeAccuraciesRef.current;
        const avg = accs.length ? Math.round(accs.reduce((a, b) => a + b, 0) / accs.length) : 100;
        setAccuracy(avg);
        onAccuracy?.(avg);
      } else {
        setStatus('idle');
        setStrokeIndex(newStrokeIdx);
        setWaypointIndex(0);
      }
      return;
    }

    const currentStrokes = strokes[strokeIndex];
    if (status === 'tracing' && currentStrokes && waypointIndex > 0 && waypointIndex < currentStrokes.length) {
      // Forgiving finish: accept the stroke if the student lifted near the
      // final waypoint, or has already reached the last couple of waypoints —
      // a freehand lift naturally lands a bit before the exact end point.
      const pos = getPos(e);
      const lastWp = scale(currentStrokes[currentStrokes.length - 1]);
      const nearEnd = dist(pos, lastWp) < HIT_RADIUS * 3.5;
      const reachedMost = waypointIndex >= Math.max(1, currentStrokes.length - 2);
      if (nearEnd || reachedMost) {
        setAwaitingLift(false);
        const completedPath = [...currentPathRef.current];
        currentPathRef.current = [];
        setDrawnPaths(prev => [...prev, completedPath]);
        setCurrentPath([]);
        strokeAccuraciesRef.current.push(strokeAccuracy(completedPath, densePath));
        const newStrokeIdx = strokeIndex + 1;
        if (newStrokeIdx >= strokes.length) {
          setStatus('success');
          const accs = strokeAccuraciesRef.current;
          const avg = accs.length ? Math.round(accs.reduce((a, b) => a + b, 0) / accs.length) : 100;
          setAccuracy(avg);
          onAccuracy?.(avg);
        } else {
          setStatus('idle');
          setStrokeIndex(newStrokeIdx);
          setWaypointIndex(0);
        }
        return;
      }
      // Genuinely lifted too early
      flashError();
      currentPathRef.current = [];
      setCurrentPath([]);
      setWaypointIndex(0);
      setStatus('idle');
    }
  }, [drawing, status, waypointIndex, strokeIndex, strokes, densePath, onAccuracy]);

  const stopReplay = () => {
    if (replayRafRef.current) { cancelAnimationFrame(replayRafRef.current); replayRafRef.current = null; }
    setReplaying(false);
    setReplayPts([]);
  };

  const startReplay = () => {
    if (drawing || status === 'success') return;
    const wp = strokes[strokeIndex];
    if (!wp || wp.length < 2) return;
    const refPath = buildDensePath(wp);
    if (replayRafRef.current) cancelAnimationFrame(replayRafRef.current);
    setReplaying(true);
    setReplayPts([]);
    const duration = 700 + refPath.length * 5; // ms — longer paths take a touch longer
    const startTs = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - startTs) / duration);
      const count = Math.max(1, Math.ceil(t * refPath.length));
      setReplayPts(refPath.slice(0, count));
      if (t < 1) {
        replayRafRef.current = requestAnimationFrame(tick);
      } else {
        replayRafRef.current = null;
        setReplaying(false);
      }
    };
    replayRafRef.current = requestAnimationFrame(tick);
  };

  const reset = () => {
    stopReplay();
    setStrokeIndex(0);
    setWaypointIndex(0);
    setDrawing(false);
    setDrawnPaths([]);
    currentPathRef.current = [];
    pendingCompleteRef.current = false;
    setAwaitingLift(false);
    setCurrentPath([]);
    setStatus('idle');
    setErrorFlash(false);
    setAccuracy(null);
    strokeAccuraciesRef.current = [];
    onReset?.();
  };

  const currentStrokeWaypoints = strokes[strokeIndex] || [];
  const nextWp = waypointIndex < currentStrokeWaypoints.length
    ? scale(currentStrokeWaypoints[waypointIndex]) : null;

  const pathD = (pts) => pts.length < 2 ? '' :
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  const isSuccess = status === 'success';

  return (
    <div className="flex flex-col items-center gap-3 select-none">
      {/* Status prompt */}
      <div className="h-8 flex items-center justify-center">
        {awaitingLift && (
          <div className="bg-yellow-100 border border-yellow-400 rounded-full px-4 py-1 text-yellow-800 font-bold text-sm animate-bounce">
            ✋ Lift your finger!
          </div>
        )}
        {status === 'success' && (
          <div className="flex items-center gap-3">
            <div className="bg-green-100 border border-green-400 rounded-full px-4 py-1 text-green-800 font-bold text-sm">
              🎉 Great job!
            </div>
            {accuracy != null && (
              <div className="bg-indigo-100 border border-indigo-300 rounded-full px-4 py-1 text-indigo-800 font-bold text-sm">
                🎯 {accuracy}%
              </div>
            )}
            <button
              onClick={() => onComplete?.()}
              className="bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-sm px-4 py-1 rounded-full"
            >
              Next →
            </button>
          </div>
        )}
        {status === 'idle' && strokeIndex === 0 && waypointIndex === 0 && (
          <div className="text-white/70 text-sm">Start at the ● dot</div>
        )}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
        className={`w-64 rounded-2xl border-4 touch-none aspect-[4/5] ${
          errorFlash ? 'border-red-400 bg-red-50' :
          isSuccess ? 'border-green-400 bg-green-50' :
          'border-white/40 bg-white/10'
        }`}
        style={{ cursor: 'crosshair' }}
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onTouchStart={handlePointerDown}
        onTouchMove={handlePointerMove}
        onTouchEnd={handlePointerUp}
      >
        {/* Guide letter removed until suitable font is found */}

        {/* Primary writing lines */}
        <line x1="0" y1={0.10 * CANVAS_H} x2={CANVAS_W} y2={0.10 * CANVAS_H}
          stroke="#93c5fd" strokeWidth="1.5" opacity="0.7" />
        <line x1="0" y1={0.42 * CANVAS_H} x2={CANVAS_W} y2={0.42 * CANVAS_H}
          stroke="#93c5fd" strokeWidth="1" strokeDasharray="8 6" opacity="0.7" />
        <line x1="0" y1={0.72 * CANVAS_H} x2={CANVAS_W} y2={0.72 * CANVAS_H}
          stroke="#93c5fd" strokeWidth="1.5" opacity="0.7" />
        <line x1="0" y1={0.92 * CANVAS_H} x2={CANVAS_W} y2={0.92 * CANVAS_H}
          stroke="#fca5a5" strokeWidth="1" strokeDasharray="4 6" opacity="0.6" />

        {/* Faint waypoint guide path (all future waypoints) */}
        {strokes.map((stroke, si) => (
          <polyline
            key={si}
            points={stroke.map(p => `${scale(p).x},${scale(p).y}`).join(' ')}
            fill="none"
            stroke={si < strokeIndex ? '#22c55e' : '#94a3b8'}
            strokeWidth="3"
            strokeDasharray="6 4"
            opacity="0.3"
          />
        ))}

        {/* Drawn paths (completed strokes) */}
        {drawnPaths.map((pts, i) => (
          <path key={i} d={pathD(pts)} fill="none" stroke="#6366f1" strokeWidth="22"
            strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
        ))}

        {/* Current drawing path */}
        {currentPath.length > 1 && (
          <path d={pathD(currentPath)} fill="none" stroke="#6366f1" strokeWidth="22"
            strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
        )}

        {/* Replay hint — animated demo of the current stroke's ideal path */}
        {replayPts.length > 1 && (
          <>
            <path d={pathD(replayPts)} fill="none" stroke="#f59e0b" strokeWidth="10"
              strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
            <circle cx={replayPts[replayPts.length - 1].x}
              cy={replayPts[replayPts.length - 1].y} r="7" fill="#f59e0b" />
          </>
        )}

        {/* Start dot — show only when waiting to begin a stroke */}
        {nextWp && !isSuccess && waypointIndex === 0 && !drawing && (
          <>
            <circle cx={nextWp.x} cy={nextWp.y} r="18" fill="#6366f1" opacity="0.15">
              <animate attributeName="r" values="14;22;14" dur="1s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.2;0.05;0.2" dur="1s" repeatCount="indefinite" />
            </circle>
            <circle cx={nextWp.x} cy={nextWp.y} r="8" fill="#6366f1" />
            <text x={nextWp.x} y={nextWp.y + 4} textAnchor="middle" fontSize="9"
              fill="white" fontWeight="bold">{strokeIndex + 1}</text>
          </>
        )}
      </svg>

      <div className="flex items-center gap-4">
        {!isSuccess && (
          <button
            onClick={startReplay}
            disabled={drawing || replaying || !strokes[strokeIndex]}
            className="text-amber-200 hover:text-amber-100 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ▶ Show me
          </button>
        )}
        <button
          onClick={reset}
          className="text-white/60 hover:text-white text-sm underline"
        >
          Start over
        </button>
      </div>
    </div>
  );
}