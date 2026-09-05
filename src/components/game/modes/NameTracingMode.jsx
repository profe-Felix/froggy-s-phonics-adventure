import { useState, useEffect, useRef, useMemo } from 'react';
import confetti from 'canvas-confetti';
import { Sparkles } from 'lucide-react';
import { LETTER_WAYPOINTS } from '../../data/letterWaypoints';
import NameTracingCanvas from '../NameTracingCanvas';
import { base44 } from '@/api/base44Client';

// Name Tracing — staged progression like Letter Tracing, on a vertical
// scrolling page (names are long). No sound.
//   Phase 1 "Guided"  — 3 rows of dot-to-dot guides (trace over the dots)
//   Phase 2 "Trace"   — 3 rows of faded outlines (trace the letters)
//   Phase 3 "Freehand"— 1 row with just a start dot (write it yourself)
// Rows stack vertically; the page auto-scrolls to the active row.

const GUIDED_REPS = 3;
const TRACE_REPS = 3;

export default function NameTracingMode({ studentData, onBack }) {
  const [waypoints, setWaypoints] = useState(LETTER_WAYPOINTS);
  const [activeRow, setActiveRow] = useState(0);
  const [celebrate, setCelebrate] = useState(null);
  const [done, setDone] = useState(false);
  const scrollRef = useRef(null);
  const rowRefs = useRef([]);

  const name = (studentData?.name || '').trim();

  // Load DB waypoint overrides
  useEffect(() => {
    let cancelled = false;
    base44.entities.LetterWaypoint.list().then((records) => {
      if (cancelled || !Array.isArray(records) || records.length === 0) return;
      setWaypoints((prev) => {
        const merged = { ...prev };
        for (const r of records) {
          if (!r.letter || !r.strokes_data) continue;
          try {
            const strokes = JSON.parse(r.strokes_data);
            if (Array.isArray(strokes) && strokes.length) {
              merged[r.letter] = { strokes, hint: r.hint || prev[r.letter]?.hint || '' };
            }
          } catch { /* ignore */ }
        }
        return merged;
      });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Build the row plan: guided rows, then trace rows, then one freehand row.
  const rows = useMemo(() => {
    const out = [];
    for (let i = 0; i < GUIDED_REPS; i++) out.push({ mode: 'guided', label: `Guided ${i + 1}` });
    for (let i = 0; i < TRACE_REPS; i++) out.push({ mode: 'trace', label: `Trace ${i + 1}` });
    out.push({ mode: 'freehand', label: 'Your turn!' });
    return out;
  }, []);

  // Letters in the name that have waypoints
  const traceableLetters = useMemo(
    () => name.split('').filter((ch) => waypoints[ch]),
    [name, waypoints]
  );

  // Auto-scroll to the active row
  useEffect(() => {
    const el = rowRefs.current[activeRow];
    if (el && scrollRef.current) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeRow]);

  const handleRowComplete = () => {
    const next = activeRow + 1;
    if (next >= rows.length) {
      // All done!
      setDone(true);
      setCelebrate({ message: `You wrote your whole name!` });
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.5 } });
      setTimeout(() => setCelebrate(null), 2500);
    } else {
      setActiveRow(next);
    }
  };

  if (!name) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-3">✏️</div>
          <h2 className="text-xl font-bold text-slate-700 mb-2">No name set yet</h2>
          <p className="text-slate-500 text-sm mb-6">
            Ask your teacher to add your name in the roster, then come back to practice writing it!
          </p>
          {onBack && (
            <button onClick={onBack} className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-700">
              Back
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!traceableLetters.length) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-3">✏️</div>
          <p className="text-slate-500">No traceable letters in your name yet.</p>
          {onBack && (
            <button onClick={onBack} className="mt-4 bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-700">
              Back
            </button>
          )}
        </div>
      </div>
    );
  }

  const renderWidth = Math.min(560, Math.max(320, (window.innerWidth || 800) * 0.92));
  const rowHeight = Math.round(renderWidth * (375 / 300));

  // Current phase label
  const currentRow = rows[activeRow];
  const phaseLabel = currentRow?.mode === 'guided' ? 'Guided — trace the dots'
    : currentRow?.mode === 'trace' ? 'Trace the letters'
    : 'Write it yourself!';

  return (
    <div className="h-full bg-slate-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 shrink-0 border-b border-slate-200 bg-white">
        <button
          onClick={onBack}
          className="text-slate-500 hover:text-slate-800 text-xs font-bold whitespace-nowrap"
        >
          ← Games
        </button>
        <div className="flex items-center gap-2">
          <div className="text-slate-800 font-black text-lg leading-none">{name}</div>
          <div className="text-[11px] text-slate-400 font-bold leading-none">Name Tracing</div>
        </div>
        <div className="flex items-center gap-1">
          {rows.map((r, i) => (
            <div key={i} className={`w-2 h-2 rounded-full ${i < activeRow ? 'bg-green-400' : i === activeRow ? 'bg-indigo-500' : 'bg-slate-200'}`} />
          ))}
        </div>
      </div>

      {/* Phase label */}
      <div className="text-center py-1.5 shrink-0">
        <span className={`text-sm font-bold rounded-full px-3 py-0.5 border ${
          currentRow?.mode === 'guided' ? 'text-amber-700 bg-amber-50 border-amber-200'
          : currentRow?.mode === 'trace' ? 'text-indigo-700 bg-indigo-50 border-indigo-200'
          : 'text-pink-700 bg-pink-50 border-pink-200'
        }`}>
          {currentRow?.mode === 'guided' ? '● Guided' : currentRow?.mode === 'trace' ? '✍️ Trace' : '🌟 Your turn'}
          {' '}· Row {activeRow + 1} of {rows.length}
        </span>
        <span className="ml-2 text-xs text-slate-400 font-bold">{phaseLabel}</span>
      </div>

      {/* Vertical scrolling page of rows */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="flex flex-col items-center gap-6 py-6 px-4">
          {rows.map((row, i) => {
            const isActive = i === activeRow && !done;
            const isPast = i < activeRow || done;
            return (
              <div
                key={i}
                ref={(el) => (rowRefs.current[i] = el)}
                className={`flex flex-col items-center gap-1 transition-opacity ${isPast ? 'opacity-40' : isActive ? 'opacity-100' : 'opacity-30'}`}
              >
                <div className="text-[11px] font-bold text-slate-400">{row.label}</div>
                {isActive ? (
                  <NameTracingCanvas
                    key={`row-${i}`}
                    name={name}
                    waypoints={waypoints}
                    mode={row.mode}
                    renderWidth={renderWidth}
                    rowHeight={rowHeight}
                    onComplete={handleRowComplete}
                  />
                ) : (
                  // Placeholder for non-active rows so the page keeps its height
                  <div
                    className="rounded-2xl border-4 border-slate-200 bg-white flex items-center justify-center"
                    style={{ width: renderWidth, height: rowHeight }}
                  >
                    {isPast ? (
                      <span className="text-3xl">✓</span>
                    ) : (
                      <span className="text-slate-300 text-sm font-bold">Coming up</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <div className="h-8" />
        </div>
      </div>

      {/* Celebration */}
      {celebrate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-white rounded-3xl shadow-2xl px-8 py-6 flex flex-col items-center gap-2">
            <Sparkles className="w-10 h-10 text-amber-400" />
            <div className="text-2xl font-black text-slate-800">{celebrate.message}</div>
          </div>
        </div>
      )}
    </div>
  );
}