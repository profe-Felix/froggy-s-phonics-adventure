import { useRef, useState, useEffect, useCallback } from 'react';

const CANVAS_W = 300;
const CANVAS_H = 300;
const HIT_RADIUS = 28; // pixels to count as hitting a waypoint

function scale(pt) {
  return { x: pt.x * CANVAS_W, y: pt.y * CANVAS_H };
}

export default function LetterTracingCanvas({ letter, strokes, onComplete, onReset }) {
  const [strokeIndex, setStrokeIndex] = useState(0);
  const [waypointIndex, setWaypointIndex] = useState(0);
  const [drawing, setDrawing] = useState(false);
  const [drawnPaths, setDrawnPaths] = useState([]); // completed stroke paths
  const [currentPath, setCurrentPath] = useState([]);
  const [status, setStatus] = useState('idle'); // idle | tracing | lift | success | error
  const [errorFlash, setErrorFlash] = useState(false);
  const svgRef = useRef(null);

  // Reset when letter changes
  useEffect(() => {
    setStrokeIndex(0);
    setWaypointIndex(0);
    setDrawing(false);
    setDrawnPaths([]);
    setCurrentPath([]);
    setStatus('idle');
    setErrorFlash(false);
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

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  const handlePointerDown = useCallback((e) => {
    e.preventDefault();
    if (status === 'success' || status === 'lift') return;
    const pos = getPos(e);
    const currentStrokes = strokes[strokeIndex];
    if (!currentStrokes) return;
    const firstWp = scale(currentStrokes[0]);
    // Must start near the first waypoint of current stroke
    if (waypointIndex === 0 && dist(pos, firstWp) > HIT_RADIUS * 1.8) {
      flashError();
      return;
    }
    setDrawing(true);
    setStatus('tracing');
    setCurrentPath([pos]);
  }, [status, strokeIndex, waypointIndex, strokes]);

  const flashError = () => {
    setErrorFlash(true);
    setTimeout(() => setErrorFlash(false), 600);
  };

  const handlePointerMove = useCallback((e) => {
    e.preventDefault();
    if (!drawing || status !== 'tracing') return;
    const pos = getPos(e);
    setCurrentPath(prev => [...prev, pos]);

    const currentStrokes = strokes[strokeIndex];
    if (!currentStrokes) return;
    const nextWp = scale(currentStrokes[waypointIndex]);

    if (dist(pos, nextWp) < HIT_RADIUS) {
      const newWpIdx = waypointIndex + 1;
      if (newWpIdx >= currentStrokes.length) {
        // Stroke complete!
        setDrawnPaths(prev => [...prev, currentPath]);
        setCurrentPath([]);
        setDrawing(false);
        const newStrokeIdx = strokeIndex + 1;
        if (newStrokeIdx >= strokes.length) {
          setStatus('success');
          setTimeout(() => onComplete?.(), 800);
        } else {
          setStatus('lift');
          setStrokeIndex(newStrokeIdx);
          setWaypointIndex(0);
        }
      } else {
        setWaypointIndex(newWpIdx);
      }
    }
  }, [drawing, status, strokeIndex, waypointIndex, strokes, currentPath, onComplete]);

  const handlePointerUp = useCallback((e) => {
    e.preventDefault();
    if (!drawing) return;
    setDrawing(false);
    if (status === 'tracing' && waypointIndex > 0 && waypointIndex < (strokes[strokeIndex]?.length ?? 0)) {
      // Lifted too early
      flashError();
      setCurrentPath([]);
      setWaypointIndex(0);
      setStatus('idle');
    }
    if (status === 'lift') {
      setStatus('idle');
    }
  }, [drawing, status, waypointIndex, strokeIndex, strokes]);

  const handleLiftDone = () => {
    if (status === 'lift') setStatus('idle');
  };

  const reset = () => {
    setStrokeIndex(0);
    setWaypointIndex(0);
    setDrawing(false);
    setDrawnPaths([]);
    setCurrentPath([]);
    setStatus('idle');
    setErrorFlash(false);
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
        {status === 'lift' && (
          <div className="bg-yellow-100 border border-yellow-400 rounded-full px-4 py-1 text-yellow-800 font-bold text-sm animate-bounce">
            ✋ Lift your finger!
          </div>
        )}
        {status === 'success' && (
          <div className="bg-green-100 border border-green-400 rounded-full px-4 py-1 text-green-800 font-bold text-sm">
            🎉 Great job!
          </div>
        )}
        {status === 'idle' && strokeIndex === 0 && waypointIndex === 0 && (
          <div className="text-white/70 text-sm">Start at the ● dot</div>
        )}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
        className={`w-72 h-72 rounded-2xl border-4 touch-none ${
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
        onTouchEnd={status === 'lift' ? handleLiftDone : handlePointerUp}
      >
        {/* Faint letter guide */}
        <text
          x={CANVAS_W / 2} y={CANVAS_H * 0.82}
          textAnchor="middle"
          fontSize="220"
          fontFamily="Lexend, sans-serif"
          fill={isSuccess ? '#22c55e' : '#94a3b8'}
          opacity={isSuccess ? 0.3 : 0.15}
        >
          {letter}
        </text>

        {/* Guide lines */}
        <line x1="0" y1={0.42 * CANVAS_H} x2={CANVAS_W} y2={0.42 * CANVAS_H}
          stroke="#cbd5e1" strokeWidth="1" strokeDasharray="4 4" opacity="0.6" />
        <line x1="0" y1={0.72 * CANVAS_H} x2={CANVAS_W} y2={0.72 * CANVAS_H}
          stroke="#cbd5e1" strokeWidth="1" opacity="0.6" />

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
          <path key={i} d={pathD(pts)} fill="none" stroke="#6366f1" strokeWidth="5"
            strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
        ))}

        {/* Current drawing path */}
        {currentPath.length > 1 && (
          <path d={pathD(currentPath)} fill="none" stroke="#6366f1" strokeWidth="5"
            strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
        )}

        {/* Waypoint dots — completed */}
        {currentStrokeWaypoints.slice(0, waypointIndex).map((wp, i) => {
          const p = scale(wp);
          return <circle key={i} cx={p.x} cy={p.y} r="6" fill="#22c55e" opacity="0.6" />;
        })}

        {/* Next waypoint to hit — pulsing */}
        {nextWp && !isSuccess && (
          <>
            <circle cx={nextWp.x} cy={nextWp.y} r="18" fill="#6366f1" opacity="0.15">
              <animate attributeName="r" values="14;22;14" dur="1s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.2;0.05;0.2" dur="1s" repeatCount="indefinite" />
            </circle>
            <circle cx={nextWp.x} cy={nextWp.y} r="8" fill={waypointIndex === 0 ? '#6366f1' : '#f59e0b'} />
            {waypointIndex === 0 && (
              <text x={nextWp.x} y={nextWp.y + 4} textAnchor="middle" fontSize="9"
                fill="white" fontWeight="bold">{strokeIndex + 1}</text>
            )}
          </>
        )}
      </svg>

      {/* Reset button */}
      <button
        onClick={reset}
        className="text-white/60 hover:text-white text-sm underline"
      >
        Start over
      </button>
    </div>
  );
}