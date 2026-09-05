import { useState, useEffect, useRef, useMemo } from 'react';
import confetti from 'canvas-confetti';
import { Sparkles } from 'lucide-react';
import { LETTER_WAYPOINTS } from '../../data/letterWaypoints';
import NameTracingCanvas from '../NameTracingCanvas';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { splitNameParts } from '@/lib/nameNormalize';

// Name Tracing — two-row progression per name part:
//   Row 1 (top): Guided — colored pathway guides + numbered start dots, trace over them
//   Row 2 (bottom): Dot-only — just start dots, write independently for comparison
// First and last name on separate lines (when toggled by teacher).
// Saves dot-only attempts to TracingSample for teacher review. No sound.
export default function NameTracingMode({ studentData, onBack }) {
  const [waypoints, setWaypoints] = useState(LETTER_WAYPOINTS);
  const [activeRow, setActiveRow] = useState(0);
  const [completedRows, setCompletedRows] = useState(new Set());
  const [celebrate, setCelebrate] = useState(null);
  const scrollRef = useRef(null);
  const rowRefs = useRef([]);

  const fullName = (studentData?.name || '').trim();
  const className = studentData?.class_name || '';
  const studentNumber = studentData?.student_number;
  const schoolYear = studentData?.school_year || ACTIVE_SCHOOL_YEAR;

  // Load DB waypoint overrides + class config
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
          } catch {}
        }
        return merged;
      });
    }).catch(() => {});

    return () => { cancelled = true; };
  }, [className]);

  // Split name into parts: first name only, or first + last if teacher checked the box for this student.
  // Middle initials are skipped so the last name only contains actual surnames.
  const nameParts = useMemo(() => {
    if (!fullName) return [];
    const { first, last } = splitNameParts(fullName);
    if (studentData?.name_tracing_last && last) {
      return [first, last];
    }
    return [first];
  }, [fullName, studentData?.name_tracing_last]);

  // Build rows: for each name part, [guided, dot_only]
  const rows = useMemo(() => {
    const out = [];
    for (const part of nameParts) {
      out.push({ part, mode: 'guided', label: `${part} — Guided` });
      out.push({ part, mode: 'dot_only', label: `${part} — Your turn` });
    }
    return out;
  }, [nameParts]);

  // Check which name parts have traceable letters
  const traceableParts = useMemo(
    () => nameParts.filter((part) => part.split('').some((ch) => waypoints[ch])),
    [nameParts, waypoints]
  );

  // Auto-scroll to the active row
  useEffect(() => {
    const el = rowRefs.current[activeRow];
    if (el && scrollRef.current) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeRow]);

  const handleRowComplete = (strokes) => {
    const row = rows[activeRow];
    if (!row) return;

    setCompletedRows((prev) => new Set(prev).add(activeRow));

    // Save dot-only attempts to TracingSample for teacher review
    if (row.mode === 'dot_only' && strokes && studentNumber) {
      base44.entities.TracingSample.create({
        student_number: studentNumber,
        class_name: className,
        school_year: schoolYear,
        letter: row.part,
        phase: 'practice',
        mode: 'dot_only',
        strokes_data: JSON.stringify(strokes),
        size_label: 'Name',
      }).catch(() => {});
    }

    const next = activeRow + 1;
    if (next >= rows.length) {
      setCelebrate({ message: `You wrote your whole name!` });
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.5 } });
      setTimeout(() => setCelebrate(null), 2500);
    } else {
      setActiveRow(next);
    }
  };

  if (!fullName) {
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

  if (!traceableParts.length) {
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

  const renderWidth = Math.min(640, Math.max(300, (typeof window !== 'undefined' ? window.innerWidth : 800) * 0.92));
  const currentRow = rows[activeRow];

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
          <div className="text-slate-800 font-black text-lg leading-none">{fullName}</div>
          <div className="text-[11px] text-slate-400 font-bold leading-none">Name Tracing</div>
        </div>
        <div className="flex items-center gap-1">
          {rows.map((r, i) => (
            <div key={i} className={`w-2 h-2 rounded-full ${completedRows.has(i) ? 'bg-green-400' : i === activeRow ? 'bg-indigo-500' : 'bg-slate-200'}`} />
          ))}
        </div>
      </div>

      {/* Phase label */}
      <div className="text-center py-1.5 shrink-0">
        <span className={`text-sm font-bold rounded-full px-3 py-0.5 border ${
          currentRow?.mode === 'guided' ? 'text-amber-700 bg-amber-50 border-amber-200'
          : 'text-pink-700 bg-pink-50 border-pink-200'
        }`}>
          {currentRow?.mode === 'guided' ? '● Guided — trace the pathways' : '🌟 Your turn — write from the start dots'}
        </span>
        <span className="ml-2 text-xs text-slate-400 font-bold">Row {activeRow + 1} of {rows.length}</span>
      </div>

      {/* Vertical scrolling page of rows */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="flex flex-col items-center gap-8 py-6 px-4">
          {rows.map((row, i) => {
            const isActive = i === activeRow && !completedRows.has(i);
            const isPast = completedRows.has(i);
            const isFuture = i > activeRow && !completedRows.has(i);
            const hasTraceable = row.part.split('').some((ch) => waypoints[ch]);
            if (!hasTraceable) return null;
            return (
              <div
                key={i}
                ref={(el) => (rowRefs.current[i] = el)}
                className={`flex flex-col items-center gap-1 transition-opacity ${isPast ? 'opacity-40' : isActive ? 'opacity-100' : 'opacity-25'}`}
              >
                <div className={`text-xs font-bold ${isActive ? 'text-slate-600' : 'text-slate-400'}`}>{row.label}</div>
                {isActive ? (
                  <NameTracingCanvas
                    key={`row-${i}`}
                    name={row.part}
                    waypoints={waypoints}
                    mode={row.mode}
                    renderWidth={renderWidth}
                    onComplete={handleRowComplete}
                  />
                ) : (
                  <div
                    className="rounded-2xl border-4 border-slate-200 bg-white flex items-center justify-center"
                    style={{ width: renderWidth, height: renderWidth * (375 / 300) }}
                  >
                    {isPast ? (
                      <span className="text-3xl text-green-400">✓</span>
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