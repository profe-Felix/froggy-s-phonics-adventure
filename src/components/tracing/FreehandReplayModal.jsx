import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

// Shows a student's dot-only and freehand tracing attempts for a letter,
// so the teacher can assess whether guided tracing is transferring to
// independent writing. Each sample renders as a static SVG with the
// student's actual strokes overlaid on the writing lines.
export default function FreehandReplayModal({ studentNumber, className, letter, onClose }) {
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
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-slate-800 text-lg">Freehand attempts for "{letter}"</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl">✕</button>
        </div>
        {loading ? (
          <div className="text-center py-8 text-slate-400">Loading...</div>
        ) : samples.length === 0 ? (
          <div className="text-center py-8 text-slate-400">No freehand attempts yet.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {samples.map((s) => {
              let strokes = [];
              try { strokes = JSON.parse(s.strokes_data || '[]'); } catch {}
              return (
                <div key={s.id} className="border rounded-xl p-2">
                  <div className="text-[10px] font-bold text-slate-500 mb-1 flex items-center justify-between">
                    <span>{s.mode === 'dot_only' ? '● Dot only' : '✍️ Freehand'}</span>
                    {s.size_label && <span className="text-slate-400">{s.size_label}</span>}
                  </div>
                  <svg viewBox="0 0 300 375" className="w-full bg-white border rounded-lg" style={{ aspectRatio: '300/375' }}>
                    <line x1="0" y1="37.5" x2="300" y2="37.5" stroke="#93c5fd" strokeWidth="1.5" />
                    <line x1="0" y1="137.6" x2="300" y2="137.6" stroke="#000" strokeWidth="1" strokeDasharray="6 4" />
                    <line x1="0" y1="237.4" x2="300" y2="237.4" stroke="#16a34a" strokeWidth="1.5" />
                    <line x1="0" y1="337.5" x2="300" y2="337.5" stroke="#fca5a5" strokeWidth="1.5" strokeDasharray="4 4" />
                    {s.mode === 'dot_only' && strokes[0]?.[0] && (
                      <circle cx={strokes[0][0].x * 300} cy={strokes[0][0].y * 375} r="6" fill="#a78bfa" />
                    )}
                    {strokes.map((stroke, si) => (
                      stroke.length > 1 ? (
                        <path
                          key={si}
                          d={stroke.map((p, j) => `${j === 0 ? 'M' : 'L'}${(p.x * 300).toFixed(1)},${(p.y * 375).toFixed(1)}`).join(' ')}
                          fill="none"
                          stroke="#6366f1"
                          strokeWidth="8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      ) : stroke.length === 1 ? (
                        <circle key={si} cx={stroke[0].x * 300} cy={stroke[0].y * 375} r="4" fill="#6366f1" />
                      ) : null
                    ))}
                  </svg>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}