import { splinePathD } from '@/components/tracing/strokeMath';
import { LETTER_WAYPOINTS } from '@/components/data/letterWaypoints';

const CANVAS_W = 300;
const CANVAS_H = 375;

// Static, non-animated render of a student's tracing attempt (normalized 0-1
// strokes) over faint guide lines + a ghost of the ideal letter, so a teacher
// can scan a grid of attempts and see who writes smoothly at a glance.
export default function StrokeThumbnail({ strokesData, letter, size = 120, showGuideLetter = true }) {
  let strokes = [];
  try { strokes = JSON.parse(strokesData || '[]'); } catch {}
  if (!Array.isArray(strokes)) strokes = [];

  return (
    <svg
      viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
      width={size}
      style={{ aspectRatio: `${CANVAS_W}/${CANVAS_H}` }}
      className="bg-white border border-slate-200 rounded-lg block"
    >
      {/* Writing lines (match the tracing canvas zones) */}
      <line x1="0" y1={0.10 * CANVAS_H} x2={CANVAS_W} y2={0.10 * CANVAS_H} stroke="#93c5fd" strokeWidth="1.5" />
      <line x1="0" y1={0.367 * CANVAS_H} x2={CANVAS_W} y2={0.367 * CANVAS_H} stroke="#000" strokeWidth="1" strokeDasharray="6 4" />
      <line x1="0" y1={0.633 * CANVAS_H} x2={CANVAS_W} y2={0.633 * CANVAS_H} stroke="#16a34a" strokeWidth="1.5" />
      <line x1="0" y1={0.90 * CANVAS_H} x2={CANVAS_W} y2={0.90 * CANVAS_H} stroke="#fca5a5" strokeWidth="1.5" strokeDasharray="4 4" />

      {/* Faint reference letter so the teacher can compare to the ideal form */}
      {showGuideLetter && letter && LETTER_WAYPOINTS[letter]?.strokes?.map((stroke, si) => {
        const pts = stroke.map(p => ({ x: p.x * CANVAS_W, y: p.y * CANVAS_H }));
        if (pts.length === 1) {
          return <circle key={`ref-${si}`} cx={pts[0].x} cy={pts[0].y} r="5" fill="#cbd5e1" opacity="0.45" />;
        }
        return (
          <path
            key={`ref-${si}`}
            d={splinePathD(pts)}
            fill="none"
            stroke="#cbd5e1"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.45"
          />
        );
      })}

      {/* Student's actual strokes */}
      {strokes.map((stroke, si) => {
        if (!Array.isArray(stroke) || !stroke.length) return null;
        if (stroke.length === 1) {
          return <circle key={si} cx={stroke[0].x * CANVAS_W} cy={stroke[0].y * CANVAS_H} r="4" fill="#6366f1" />;
        }
        return (
          <path
            key={si}
            d={stroke.map((p, j) => `${j === 0 ? 'M' : 'L'}${(p.x * CANVAS_W).toFixed(1)},${(p.y * CANVAS_H).toFixed(1)}`).join(' ')}
            fill="none"
            stroke="#6366f1"
            strokeWidth="8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}
    </svg>
  );
}