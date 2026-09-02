import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { RotateCcw, Check, X } from 'lucide-react';

const CANVAS_W = 300;
const CANVAS_H = 375;
const POINTS_PER_MS = 0.03; // ~30 points/sec — slow enough to see formation

// Animated playback of a single dot-only sample. Strokes reveal
// progressively in the order the student drew them, so the teacher
// can watch letter formation (stroke order + direction) — not just
// see the finished ink.
function SamplePlayback({ sample }) {
  const [strokes, setStrokes] = useState([]);
  const [revealed, setRevealed] = useState(0);
  const [playing, setPlaying] = useState(true);
  const rafRef = useRef(null);

  useEffect(() => {
    let parsed = [];
    try { parsed = JSON.parse(sample.strokes_data || '[]'); } catch {}
    setStrokes(parsed);
    setRevealed(0);
    setPlaying(true);
  }, [sample.id]);

  // Cumulative point counts so we know which stroke a given revealed
  // index falls into.
  const strokeStarts = [];
  let cum = 0;
  for (const stroke of strokes) {
    strokeStarts.push(cum);
    cum += stroke.length;
  }
  const totalPoints = cum;

  useEffect(() => {
    if (!playing || totalPoints === 0) return;
    let startTime = null;
    const animate = (ts) => {
      if (!startTime) startTime = ts;
      const elapsed = ts - startTime;
      const target = Math.min(totalPoints, Math.floor(elapsed * POINTS_PER_MS));
      setRevealed(target);
      if (target < totalPoints) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setPlaying(false);
      }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, totalPoints, sample.id]);

  const handleReplay = () => {
    setRevealed(0);
    setPlaying(true);
  };

  return (
    <div className="border rounded-xl p-2">
      <div className="text-[10px] font-bold text-slate-500 mb-1 flex items-center justify-between">
        <span>{sample.mode === 'dot_only' ? '● Dot only' : '✍️ Freehand'}</span>
        {sample.size_label && <span className="text-slate-400">{sample.size_label}</span>}
      </div>
      <svg viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} className="w-full bg-white border rounded-lg" style={{ aspectRatio: `${CANVAS_W}/${CANVAS_H}` }}>
        <line x1="0" y1="37.5" x2={CANVAS_W} y2="37.5" stroke="#93c5fd" strokeWidth="1.5" />
        <line x1="0" y1="137.6" x2={CANVAS_W} y2="137.6" stroke="#000" strokeWidth="1" strokeDasharray="6 4" />
        <line x1="0" y1="237.4" x2={CANVAS_W} y2="237.4" stroke="#16a34a" strokeWidth="1.5" />
        <line x1="0" y1="337.5" x2={CANVAS_W} y2="337.5" stroke="#fca5a5" strokeWidth="1.5" strokeDasharray="4 4" />
        {sample.mode === 'dot_only' && strokes[0]?.[0] && (
          <circle cx={strokes[0][0].x * CANVAS_W} cy={strokes[0][0].y * CANVAS_H} r="6" fill="#a78bfa" />
        )}
        {strokes.map((stroke, si) => {
          const start = strokeStarts[si] || 0;
          const visible = Math.max(0, Math.min(stroke.length, revealed - start));
          if (visible <= 0) return null;
          const pts = stroke.slice(0, visible);
          if (pts.length === 1) {
            return <circle key={si} cx={pts[0].x * CANVAS_W} cy={pts[0].y * CANVAS_H} r="4" fill="#6366f1" />;
          }
          return (
            <path
              key={si}
              d={pts.map((p, j) => `${j === 0 ? 'M' : 'L'}${(p.x * CANVAS_W).toFixed(1)},${(p.y * CANVAS_H).toFixed(1)}`).join(' ')}
              fill="none"
              stroke="#6366f1"
              strokeWidth="8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}
      </svg>
      <div className="flex items-center justify-between mt-1">
        <span className="text-[10px] text-slate-400 font-bold">
          {playing ? '▶ Playing…' : revealed >= totalPoints ? '✓ Done' : 'Paused'}
        </span>
        <button onClick={handleReplay} className="text-indigo-600 hover:text-indigo-800 text-xs font-bold flex items-center gap-1">
          <RotateCcw className="w-3 h-3" /> Replay
        </button>
      </div>
    </div>
  );
}

// Shows a student's dot-only tracing attempts with animated playback,
// so the teacher can review formation before approving mastery.
export default function FreehandReplayModal({ studentNumber, className, letter, onClose, onApprove, onReject, pendingReview }) {
  const [samples, setSamples] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studentNumber || !letter) return;
    setLoading(true);
    const q = { student_number: studentNumber, letter };
    if (className) q.class_name = className;
    base44.entities.TracingSample.filter(q, '-created_date', 30)
      .then(records => { setSamples(records || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [studentNumber, className, letter]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-slate-800 text-lg">Playback — "{letter}"</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl">✕</button>
        </div>
        {loading ? (
          <div className="text-center py-8 text-slate-400">Loading...</div>
        ) : samples.length === 0 ? (
          <div className="text-center py-8 text-slate-400">No dot-only attempts yet.</div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {samples.map(s => (
                <SamplePlayback key={s.id} sample={s} />
              ))}
            </div>
            {pendingReview && (
              <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t">
                <button
                  onClick={onReject}
                  className="bg-red-500 hover:bg-red-600 text-white text-sm font-bold px-4 py-2 rounded-lg flex items-center gap-1"
                >
                  <X className="w-4 h-4" /> Reject — redo
                </button>
                <button
                  onClick={onApprove}
                  className="bg-green-500 hover:bg-green-600 text-white text-sm font-bold px-4 py-2 rounded-lg flex items-center gap-1"
                >
                  <Check className="w-4 h-4" /> Approve — master
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}