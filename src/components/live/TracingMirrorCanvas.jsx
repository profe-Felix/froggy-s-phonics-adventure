import { useRef, useEffect } from 'react';
import { Lock } from 'lucide-react';

// Student's read-only letter-tracing mirror. Renders the same guided canvas
// (writing lines + colored guide path) and draws the teacher's live ink on
// top — the current stroke being formed plus completed strokes — so students
// watch the teacher form the letter in real time. No interaction.
const CANVAS_W = 300;
const CANVAS_H = 375;
const GUIDE_COLORS = ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6'];

function pathD(pts) {
  if (!pts || pts.length < 2) return '';
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}

export default function TracingMirrorCanvas({ broadcast }) {
  const has = broadcast?.type === 'tracing';
  const letter = has ? broadcast.letter : null;
  // Cache the guide path per letter: the model sends it once on letter change
  // (a "setup" frame) and omits it from the high-frequency ink frames, so we
  // fall back to the cached guide when a frame doesn't carry it.
  const guideCacheRef = useRef({});
  useEffect(() => {
    if (has && letter && broadcast.guideStrokes) {
      guideCacheRef.current[letter] = broadcast.guideStrokes;
    }
  }, [has, letter, broadcast.guideStrokes]);
  const guideStrokes = has ? (broadcast.guideStrokes || guideCacheRef.current[letter] || []) : [];
  const drawnPaths = has ? (broadcast.drawnPaths || []) : [];
  const currentPath = has ? (broadcast.currentPath || []) : [];
  const status = has ? broadcast.status : null;
  const accuracy = has ? broadcast.accuracy : null;

  return (
    <div className="flex flex-col gap-3 p-4 max-w-md mx-auto w-full">
      <div className="rounded-2xl bg-white border-2 border-slate-200 p-4 text-center shadow-sm">
        <div className="text-xs font-bold text-indigo-600 uppercase tracking-wide mb-1">Letter</div>
        <div className="text-5xl font-black text-slate-800">{(letter || '?').toUpperCase()}</div>
        {status === 'success' && (
          <div className="mt-1 font-bold text-sm text-green-600">
            🎉 Great job!{accuracy != null ? ` · ${accuracy}%` : ''}
          </div>
        )}
      </div>

      <svg
        viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
        className="rounded-2xl border-4 border-slate-200 bg-white aspect-[4/5] w-full"
        style={{ maxWidth: 360 }}
      >
        {/* Primary writing lines — match the tracing canvas */}
        <line x1="0" y1={0.10 * CANVAS_H} x2={CANVAS_W} y2={0.10 * CANVAS_H} stroke="#93c5fd" strokeWidth="1.5" opacity="0.7" />
        <line x1="0" y1={0.367 * CANVAS_H} x2={CANVAS_W} y2={0.367 * CANVAS_H} stroke="#93c5fd" strokeWidth="1" strokeDasharray="8 6" opacity="0.7" />
        <line x1="0" y1={0.633 * CANVAS_H} x2={CANVAS_W} y2={0.633 * CANVAS_H} stroke="#93c5fd" strokeWidth="1.5" opacity="0.7" />
        <line x1="0" y1={0.90 * CANVAS_H} x2={CANVAS_W} y2={0.90 * CANVAS_H} stroke="#fca5a5" strokeWidth="1.5" strokeDasharray="6 6" opacity="0.85" />

        {/* Guide path — normalized 0-1 points scaled to canvas coords */}
        {guideStrokes.map((stroke, si) => (
          <polyline
            key={si}
            points={stroke.map((p) => `${(p.x * CANVAS_W).toFixed(1)},${(p.y * CANVAS_H).toFixed(1)}`).join(' ')}
            fill="none"
            stroke={GUIDE_COLORS[si % GUIDE_COLORS.length]}
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.6"
          />
        ))}

        {/* Completed strokes (teacher's ink — already in canvas coords) */}
        {drawnPaths.map((pts, i) => (
          <path key={`d${i}`} d={pathD(pts)} fill="none" stroke="#6366f1" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
        ))}

        {/* Live current stroke */}
        {currentPath.length > 1 && (
          <path d={pathD(currentPath)} fill="none" stroke="#6366f1" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
        )}
      </svg>

      <div className="text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
        <Lock className="w-3.5 h-3.5" /> Watch your teacher — try it yourself when they say go
      </div>
    </div>
  );
}