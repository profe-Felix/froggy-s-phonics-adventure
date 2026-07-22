import { useRef, useState } from 'react';
import { Undo2, Trash2 } from 'lucide-react';
import { CANVAS_W, CANVAS_H, smoothPoints, pointAtLength } from './strokeMath';

const STROKE_COLORS = ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6'];

function Arrow({ pos, color }) {
  const size = 7;
  const a1 = pos.angle + Math.PI - 0.45;
  const a2 = pos.angle + Math.PI + 0.45;
  const p1 = `${(pos.x + size * Math.cos(a1)).toFixed(1)},${(pos.y + size * Math.sin(a1)).toFixed(1)}`;
  const p2 = `${(pos.x + size * Math.cos(a2)).toFixed(1)},${(pos.y + size * Math.sin(a2)).toFixed(1)}`;
  return <polygon points={`${pos.x.toFixed(1)},${pos.y.toFixed(1)} ${p1} ${p2}`} fill={color} />;
}

const pathD = (pts) =>
  pts.length < 2 ? '' : pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

export default function StrokeAuthoringCanvas({ rawStrokes, setRawStrokes }) {
  const [current, setCurrent] = useState([]);
  const [drawing, setDrawing] = useState(false);
  const svgRef = useRef(null);
  const currentRef = useRef([]);

  const getPos = (e) => {
    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: ((clientX - rect.left) * CANVAS_W) / rect.width,
      y: ((clientY - rect.top) * CANVAS_H) / rect.height,
    };
  };

  const down = (e) => {
    e.preventDefault();
    const pos = getPos(e);
    currentRef.current = [pos];
    setCurrent([pos]);
    setDrawing(true);
  };

  const move = (e) => {
    if (!drawing) return;
    e.preventDefault();
    const pos = getPos(e);
    const last = currentRef.current[currentRef.current.length - 1];
    if (last && Math.hypot(pos.x - last.x, pos.y - last.y) < 2) return;
    currentRef.current = [...currentRef.current, pos];
    setCurrent(currentRef.current);
  };

  const up = () => {
    if (!drawing) return;
    setDrawing(false);
    if (currentRef.current.length > 1) {
      setRawStrokes((prev) => [...prev, currentRef.current]);
    }
    currentRef.current = [];
    setCurrent([]);
  };

  const undo = () => setRawStrokes((prev) => prev.slice(0, -1));
  const clear = () => setRawStrokes([]);

  return (
    <div className="flex flex-col items-center gap-3">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
        className="w-72 max-w-full rounded-2xl border-4 border-indigo-300 bg-white touch-none aspect-[4/5] shadow-sm"
        style={{ cursor: 'crosshair' }}
        onMouseDown={down}
        onMouseMove={move}
        onMouseUp={up}
        onMouseLeave={up}
        onTouchStart={down}
        onTouchMove={move}
        onTouchEnd={up}
      >
        {/* Writing lines: T=0.10, M=0.42, B=0.72, D=0.92 */}
        <line x1="0" y1={0.1 * CANVAS_H} x2={CANVAS_W} y2={0.1 * CANVAS_H} stroke="#93c5fd" strokeWidth="1.5" opacity="0.7" />
        <line x1="0" y1={0.42 * CANVAS_H} x2={CANVAS_W} y2={0.42 * CANVAS_H} stroke="#93c5fd" strokeWidth="1" strokeDasharray="8 6" opacity="0.7" />
        <line x1="0" y1={0.72 * CANVAS_H} x2={CANVAS_W} y2={0.72 * CANVAS_H} stroke="#93c5fd" strokeWidth="1.5" opacity="0.7" />
        <line x1="0" y1={0.92 * CANVAS_H} x2={CANVAS_W} y2={0.92 * CANVAS_H} stroke="#fca5a5" strokeWidth="1" strokeDasharray="4 6" opacity="0.6" />

        {/* Smoothed strokes with direction arrows */}
        {rawStrokes.map((s, i) => {
          const sm = smoothPoints(s, 3);
          const color = STROKE_COLORS[i % STROKE_COLORS.length];
          return (
            <g key={i}>
              <path d={pathD(sm)} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
              <Arrow pos={pointAtLength(sm, 0.4)} color={color} />
              <Arrow pos={pointAtLength(sm, 0.75)} color={color} />
              <circle cx={sm[0].x} cy={sm[0].y} r="10" fill={color} />
              <text x={sm[0].x} y={sm[0].y + 4} textAnchor="middle" fontSize="11" fill="white" fontWeight="bold">
                {i + 1}
              </text>
            </g>
          );
        })}

        {/* Current in-progress stroke (raw) */}
        {current.length > 1 && (
          <path d={pathD(current)} fill="none" stroke="#94a3b8" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>

      <div className="flex gap-2">
        <button
          onClick={undo}
          disabled={!rawStrokes.length}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Undo2 className="w-4 h-4" /> Undo stroke
        </button>
        <button
          onClick={clear}
          disabled={!rawStrokes.length}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Trash2 className="w-4 h-4" /> Clear all
        </button>
      </div>

      <p className="text-xs text-gray-500 text-center max-w-xs">
        Draw each stroke in order, in the correct direction. Lift between strokes — the number shows the stroke order.
      </p>
    </div>
  );
}