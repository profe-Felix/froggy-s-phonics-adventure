import { useRef, useState } from 'react';
import { Trash2, Sparkles } from 'lucide-react';
import { CANVAS_W, CANVAS_H } from '@/components/tracing/strokeMath';
import { recognize } from '@/lib/letterRecognize';

const pathD = (pts) =>
  pts.length < 2 ? '' : pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

export default function LetterRecognitionCanvas({ templates }) {
  const [strokes, setStrokes] = useState([]);
  const [current, setCurrent] = useState([]);
  const [result, setResult] = useState(null);
  const [guessing, setGuessing] = useState(false);
  const svgRef = useRef(null);
  const currentRef = useRef([]);
  const drawingRef = useRef(false);

  const getPos = (e) => {
    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * CANVAS_W) / rect.width,
      y: ((e.clientY - rect.top) * CANVAS_H) / rect.height,
    };
  };

  const down = (e) => {
    e.preventDefault();
    if (e.button != null && e.button !== 0) return;
    try { svgRef.current.setPointerCapture(e.pointerId); } catch {}
    const pos = getPos(e);
    currentRef.current = [pos];
    setCurrent([pos]);
    drawingRef.current = true;
    setResult(null);
  };

  const move = (e) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const pos = getPos(e);
    const last = currentRef.current[currentRef.current.length - 1];
    if (last && Math.hypot(pos.x - last.x, pos.y - last.y) < 2) return;
    currentRef.current = [...currentRef.current, pos];
    setCurrent(currentRef.current);
  };

  const up = (e) => {
    e.preventDefault();
    try { svgRef.current.releasePointerCapture(e.pointerId); } catch {}
    if (drawingRef.current && currentRef.current.length > 1) {
      setStrokes((prev) => [...prev, currentRef.current.slice()]);
    }
    currentRef.current = [];
    setCurrent([]);
    drawingRef.current = false;
  };

  const clear = () => { setStrokes([]); setCurrent([]); setResult(null); };

  const guess = () => {
    if (!strokes.length) return;
    setGuessing(true);
    setTimeout(() => {
      setResult(recognize(strokes, templates));
      setGuessing(false);
    }, 60);
  };

  const top = result && result.length ? result[0] : null;

  return (
    <div className="flex flex-col items-center gap-3">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
        className="w-72 max-w-full rounded-2xl border-4 border-indigo-300 bg-white touch-none aspect-[4/5] shadow-sm"
        style={{ touchAction: 'none', cursor: 'crosshair' }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={up}
      >
        <line x1="0" y1={0.10 * CANVAS_H} x2={CANVAS_W} y2={0.10 * CANVAS_H} stroke="#93c5fd" strokeWidth="1.5" opacity="0.7" />
        <line x1="0" y1={0.367 * CANVAS_H} x2={CANVAS_W} y2={0.367 * CANVAS_H} stroke="#93c5fd" strokeWidth="1" strokeDasharray="8 6" opacity="0.7" />
        <line x1="0" y1={0.633 * CANVAS_H} x2={CANVAS_W} y2={0.633 * CANVAS_H} stroke="#93c5fd" strokeWidth="1.5" opacity="0.7" />
        <line x1="0" y1={0.90 * CANVAS_H} x2={CANVAS_W} y2={0.90 * CANVAS_H} stroke="#fca5a5" strokeWidth="1.5" strokeDasharray="6 6" opacity="0.85" />

        {strokes.map((s, i) => (
          <path key={i} d={pathD(s)} fill="none" stroke="#4f46e5" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {current.length > 1 && (
          <path d={pathD(current)} fill="none" stroke="#6366f1" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>

      <div className="flex gap-2">
        <button
          onClick={guess}
          disabled={!strokes.length || guessing}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Sparkles className="w-4 h-4" /> {guessing ? 'Thinking…' : 'Guess my letter'}
        </button>
        <button
          onClick={clear}
          disabled={!strokes.length && !current.length}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Trash2 className="w-4 h-4" /> Clear
        </button>
      </div>

      {top && (
        <div className="w-full max-w-xs text-center">
          <div className="text-lg font-bold text-slate-700">
            I think you wrote: <span className="text-2xl text-indigo-600">{top.letter}</span>{' '}
            <span className="text-sm font-normal text-slate-500">({top.confidence}% sure)</span>
          </div>
          <div className="mt-3 space-y-1.5">
            {result.map((r) => (
              <div key={r.letter} className="flex items-center gap-2">
                <span className="w-5 text-sm font-bold text-slate-600">{r.letter}</span>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${r === top ? 'bg-indigo-500' : 'bg-slate-300'}`}
                    style={{ width: `${r.confidence}%` }}
                  />
                </div>
                <span className="w-8 text-right text-xs text-slate-400 tabular-nums">{r.confidence}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}