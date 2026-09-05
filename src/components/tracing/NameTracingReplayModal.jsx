import { useState, useEffect, useRef, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { RotateCcw, X } from 'lucide-react';
import { LETTER_WAYPOINTS } from '@/components/data/letterWaypoints';
import { splinePathD } from '@/components/tracing/strokeMath';
import { computeWordLayout } from '@/lib/tracingCore';

const CANVAS_H = 375;
const X_SCALE = 300;
const LETTER_GAP = 18;
const PADDING = 30;
const POINTS_PER_MS = 0.03;

// Animated playback of a name-tracing dot-only sample, with the reference
// name rendered as faint pathways so the teacher can compare the student's
// attempt to the ideal form.
function SamplePlayback({ sample, namePart, waypoints }) {
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

  // Layout for the reference name
  const { totalW } = useMemo(
    () => computeWordLayout(namePart, waypoints, X_SCALE, LETTER_GAP, PADDING, 1, 0),
    [namePart, waypoints]
  );

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

  return (
    <div className="border rounded-xl p-2">
      <div className="text-[10px] font-bold text-slate-500 mb-1 flex items-center justify-between">
        <span>● Dot only — "{namePart}"</span>
        <span className="text-slate-400">{new Date(sample.created_date).toLocaleDateString()}</span>
      </div>
      <svg viewBox={`0 0 ${totalW} ${CANVAS_H}`} className="w-full bg-white border rounded-lg" style={{ aspectRatio: `${totalW}/${CANVAS_H}` }}>
        {/* Guide lines */}
        <line x1="0" y1={0.10 * CANVAS_H} x2={totalW} y2={0.10 * CANVAS_H} stroke="#93c5fd" strokeWidth="1.5" />
        <line x1="0" y1={0.367 * CANVAS_H} x2={totalW} y2={0.367 * CANVAS_H} stroke="#000" strokeWidth="1" strokeDasharray="6 4" />
        <line x1="0" y1={0.633 * CANVAS_H} x2={totalW} y2={0.633 * CANVAS_H} stroke="#16a34a" strokeWidth="1.5" />
        <line x1="0" y1={0.90 * CANVAS_H} x2={totalW} y2={0.90 * CANVAS_H} stroke="#fca5a5" strokeWidth="1.5" strokeDasharray="4 4" />
        {/* Faint reference name */}
        {(() => {
          const { layout } = computeWordLayout(namePart, waypoints, X_SCALE, LETTER_GAP, PADDING, 1, 0);
          const refs = [];
          layout.forEach((lay, li) => {
            const letterStrokes = waypoints[lay.ch]?.strokes || [];
            const scaleFn = (pt) => ({ x: lay.offset + (pt.x - lay.minX) * X_SCALE, y: pt.y * CANVAS_H });
            letterStrokes.forEach((stroke, si) => {
              const clean = Array.isArray(stroke) ? stroke.filter(p => p && p.x != null) : [];
              const pts = clean.map(scaleFn);
              if (pts.length < 2) {
                if (pts[0]) refs.push(<circle key={`ref-${li}-${si}`} cx={pts[0].x} cy={pts[0].y} r="4" fill="#cbd5e1" opacity="0.5" />);
              } else {
                refs.push(<path key={`ref-${li}-${si}`} d={splinePathD(pts)} fill="none" stroke="#cbd5e1" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />);
              }
            });
          });
          return refs;
        })()}
        {/* Student strokes */}
        {strokes.map((stroke, si) => {
          const start = strokeStarts[si] || 0;
          const visible = Math.max(0, Math.min(stroke.length, revealed - start));
          if (visible <= 0) return null;
          const pts = stroke.slice(0, visible);
          if (pts.length === 1) {
            return <circle key={si} cx={pts[0].x * totalW} cy={pts[0].y * CANVAS_H} r="4" fill="#6366f1" />;
          }
          return (
            <path
              key={si}
              d={pts.map((p, j) => `${j === 0 ? 'M' : 'L'}${(p.x * totalW).toFixed(1)},${(p.y * CANVAS_H).toFixed(1)}`).join(' ')}
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
        <button onClick={() => { setRevealed(0); setPlaying(true); }} className="text-indigo-600 hover:text-indigo-800 text-xs font-bold flex items-center gap-1">
          <RotateCcw className="w-3 h-3" /> Replay
        </button>
      </div>
    </div>
  );
}

// Shows a student's name-tracing dot-only attempts with animated playback,
// so the teacher can review formation. Loads from TracingSample where
// letter = the name part.
export default function NameTracingReplayModal({ studentNumber, className, studentName, waypoints, onClose }) {
  const [samples, setSamples] = useState([]);
  const [loading, setLoading] = useState(true);

  // Split the student's name into parts to know what to look for
  const nameParts = useMemo(() => {
    if (!studentName) return [];
    const tokens = studentName.trim().split(/\s+/).filter(Boolean);
    return tokens.length >= 2 ? [tokens[0], tokens.slice(1).join(' ')] : [tokens[0] || ''];
  }, [studentName]);

  useEffect(() => {
    if (!studentNumber || !className) return;
    setLoading(true);
    base44.entities.TracingSample.filter(
      { student_number: studentNumber, class_name: className, mode: 'dot_only', size_label: 'Name' },
      '-created_date', 30
    ).then(records => { setSamples(records || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [studentNumber, className]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-slate-800 text-lg">Name Tracing — {studentName || `Student ${studentNumber}`}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl"><X className="w-5 h-5" /></button>
        </div>
        {loading ? (
          <div className="text-center py-8 text-slate-400">Loading...</div>
        ) : samples.length === 0 ? (
          <div className="text-center py-8 text-slate-400">No name tracing attempts yet.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {samples.map(s => (
              <SamplePlayback key={s.id} sample={s} namePart={s.letter} waypoints={waypoints || LETTER_WAYPOINTS} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}