import { useRef, useState, useEffect } from 'react';
import { Undo2, Trash2, PenTool, PenLine } from 'lucide-react';
import { CANVAS_W, CANVAS_H, smoothPoints, pointAtLength } from './strokeMath';

// "Trace thin" authoring mode — the alternative to the image-based "center on
// ink" canvas. Two phases share one surface:
//   1. DRAW GUIDE — rough out each stroke with a thick black marker. Those
//      marks are a GUIDE only.
//   2. TRACE THIN — the thick black shrinks to a thin gray line. You trace over
//      it; your pen is magnetically held to that thin polyline (within a
//      corridor), so you only have to move in the right direction. The colored
//      trace — with direction arrows + stroke numbers — is what becomes the
//      saved waypoints (pushed to the parent's rawStrokes).
const STROKE_COLORS = ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6'];
const GUIDE_THICK = '#0f172a';
const SNAP_CORRIDOR = 40; // px — pen is held to the guide within this distance

const pathD = (pts) =>
  pts.length < 2 ? '' : pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

function Arrow({ pos, color }) {
  const size = 7;
  const a1 = pos.angle + Math.PI - 0.45;
  const a2 = pos.angle + Math.PI + 0.45;
  const p1 = `${(pos.x + size * Math.cos(a1)).toFixed(1)},${(pos.y + size * Math.sin(a1)).toFixed(1)}`;
  const p2 = `${(pos.x + size * Math.cos(a2)).toFixed(1)},${(pos.y + size * Math.sin(a2)).toFixed(1)}`;
  return <polygon points={`${pos.x.toFixed(1)},${pos.y.toFixed(1)} ${p1} ${p2}`} fill={color} />;
}

// Nearest point on any guide polyline to p (segment projection, clamped).
function nearestOnGuide(p, strokes) {
  let best = null;
  for (let si = 0; si < strokes.length; si++) {
    const s = strokes[si];
    if (!s || s.length < 2) continue;
    for (let i = 0; i < s.length - 1; i++) {
      const a = s[i], b = s[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      let t = len2 > 1e-6 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const x = a.x + dx * t, y = a.y + dy * t;
      const d = Math.hypot(p.x - x, p.y - y);
      if (!best || d < best.dist) best = { x, y, dist: d };
    }
  }
  return best;
}

export default function TraceThinCanvas({ rawStrokes, setRawStrokes }) {
  const [guide, setGuide] = useState(rawStrokes && rawStrokes.length ? rawStrokes : []);
  const [traced, setTraced] = useState([]);
  const [mode, setMode] = useState(rawStrokes && rawStrokes.length ? 'trace' : 'draw');
  const [current, setCurrent] = useState([]);
  const svgRef = useRef(null);
  const currentRef = useRef([]);
  const drawingRef = useRef(false);

  // Adopt external rawStrokes into the guide when the parent loads/replaces
  // them (letter change, DB load) and the teacher hasn't retraced yet. Once
  // tracing has begun, traced is canonical and external updates are ignored.
  // Reference equality is enough: every internal write passes the SAME array
  // ref to setRawStrokes, so only genuinely external changes differ.
  useEffect(() => {
    if (traced.length > 0) return;
    if (rawStrokes !== guide) {
      setGuide(rawStrokes || []);
      setMode(rawStrokes && rawStrokes.length ? 'trace' : 'draw');
    }
  }, [rawStrokes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Push this mode's output to the parent so waypoints/preview/save stay in
  // sync. Traced strokes win once any exist; otherwise the guide is the output.
  useEffect(() => {
    const output = traced.length ? traced : guide;
    setRawStrokes(output);
  }, [guide, traced]); // eslint-disable-line react-hooks/exhaustive-deps

  const lineTop = 0.10, lineMid = 0.367, lineBase = 0.633, lineDesc = 0.90;

  const getPos = (e) => {
    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * CANVAS_W) / rect.width,
      y: ((e.clientY - rect.top) * CANVAS_H) / rect.height,
    };
  };

  // Hold the pen to the thin guide line: snap to the nearest point on any guide
  // polyline when within the corridor. Outside it, draw freely (so you can lift
  // and start a fresh stroke away from the guide without teleporting).
  const snapToGuide = (pos) => {
    if (mode !== 'trace' || !guide.length) return pos;
    const n = nearestOnGuide(pos, guide);
    if (!n || n.dist > SNAP_CORRIDOR) return pos;
    return { x: n.x, y: n.y };
  };

  const down = (e) => {
    e.preventDefault();
    if (e.button != null && e.button !== 0) return;
    try { svgRef.current.setPointerCapture(e.pointerId); } catch {}
    const pos = snapToGuide(getPos(e));
    currentRef.current = [pos];
    setCurrent([pos]);
    drawingRef.current = true;
  };

  const move = (e) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const pos = snapToGuide(getPos(e));
    const last = currentRef.current[currentRef.current.length - 1];
    if (last && Math.hypot(pos.x - last.x, pos.y - last.y) < 2) return;
    currentRef.current = [...currentRef.current, pos];
    setCurrent(currentRef.current);
  };

  const up = (e) => {
    e.preventDefault();
    try { svgRef.current.releasePointerCapture(e.pointerId); } catch {}
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (currentRef.current.length > 1) {
      const stroke = currentRef.current.slice();
      if (mode === 'draw') setGuide((g) => [...g, stroke]);
      else setTraced((t) => [...t, stroke]);
    }
    currentRef.current = [];
    setCurrent([]);
  };

  const undo = () => {
    if (mode === 'draw') setGuide((g) => g.slice(0, -1));
    else setTraced((t) => t.slice(0, -1));
  };

  const clear = () => {
    if (mode === 'draw') setGuide([]);
    else setTraced([]);
  };

  const guideIsThin = mode === 'trace';
  const traceColor = STROKE_COLORS[traced.length % STROKE_COLORS.length];

  return (
    <div className="flex flex-col items-center gap-3">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
        className="w-72 max-w-full rounded-2xl border-4 border-indigo-300 bg-white touch-none aspect-[4/5] shadow-sm"
        style={{ cursor: 'crosshair', touchAction: 'none' }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={up}
      >
        {/* Writing guide lines (match the main authoring canvas) */}
        <line x1="0" y1={lineTop * CANVAS_H} x2={CANVAS_W} y2={lineTop * CANVAS_H} stroke="#93c5fd" strokeWidth="1.5" opacity="0.7" />
        <line x1="0" y1={lineMid * CANVAS_H} x2={CANVAS_W} y2={lineMid * CANVAS_H} stroke="#93c5fd" strokeWidth="1" strokeDasharray="8 6" opacity="0.7" />
        <line x1="0" y1={lineBase * CANVAS_H} x2={CANVAS_W} y2={lineBase * CANVAS_H} stroke="#93c5fd" strokeWidth="1.5" opacity="0.7" />
        <line x1="0" y1={lineDesc * CANVAS_H} x2={CANVAS_W} y2={lineDesc * CANVAS_H} stroke="#fca5a5" strokeWidth="1.5" strokeDasharray="6 6" opacity="0.85" />

        {/* Guide strokes: thick black "marker" while drawing; the black shrinks
            to a thin gray line once you switch to Trace. */}
        {guide.map((s, i) => {
          const sm = smoothPoints(s, 3);
          return (
            <path
              key={'g' + i}
              d={pathD(sm)}
              fill="none"
              stroke={guideIsThin ? '#94a3b8' : GUIDE_THICK}
              strokeWidth={guideIsThin ? 2.5 : 10}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={guideIsThin ? 0.8 : 0.92}
            />
          );
        })}

        {/* Traced strokes — the clean, directed waypoints (color + arrows + numbers) */}
        {traced.map((s, i) => {
          const sm = smoothPoints(s, 3);
          const color = STROKE_COLORS[i % STROKE_COLORS.length];
          return (
            <g key={'t' + i}>
              <path d={pathD(sm)} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" opacity="0.95" />
              <Arrow pos={pointAtLength(sm, 0.4)} color={color} />
              <Arrow pos={pointAtLength(sm, 0.75)} color={color} />
              <circle cx={sm[0].x} cy={sm[0].y} r="10" fill={color} />
              <text x={sm[0].x} y={sm[0].y + 4} textAnchor="middle" fontSize="11" fill="white" fontWeight="bold">{i + 1}</text>
            </g>
          );
        })}

        {/* Current in-progress stroke */}
        {current.length > 1 && (
          <path
            d={pathD(smoothPoints(current, 3))}
            fill="none"
            stroke={mode === 'draw' ? GUIDE_THICK : traceColor}
            strokeWidth={mode === 'draw' ? 10 : 6}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.9"
          />
        )}
      </svg>

      {/* Mode toggle */}
      <div className="flex flex-wrap items-center gap-2 justify-center">
        <button
          onClick={() => setMode('draw')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold border ${
            mode === 'draw' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <PenTool className="w-4 h-4" /> Draw guide
        </button>
        <button
          onClick={() => guide.length && setMode('trace')}
          disabled={!guide.length}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold border ${
            mode === 'trace' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50'
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          <PenLine className="w-4 h-4" /> Trace thin
        </button>
      </div>

      <div className="flex gap-2">
        <button
          onClick={undo}
          disabled={mode === 'draw' ? !guide.length : !traced.length}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Undo2 className="w-4 h-4" /> Undo stroke
        </button>
        <button
          onClick={clear}
          disabled={mode === 'draw' ? !guide.length : !traced.length}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Trash2 className="w-4 h-4" /> {mode === 'draw' ? 'Clear guide' : 'Clear traced'}
        </button>
      </div>

      <p className="text-xs text-gray-500 text-center max-w-xs">
        {mode === 'draw'
          ? 'Roughly draw each stroke with the thick marker — it becomes your guide. Then switch to “Trace thin”.'
          : 'The black shrank to a thin line. Trace over it — your pen is held to the line, so just move in the right direction. The colored trace is what gets saved.'}
      </p>
    </div>
  );
}