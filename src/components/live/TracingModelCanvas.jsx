import { useState, useEffect, useCallback } from 'react';
import { LETTER_WAYPOINTS } from '@/components/data/letterWaypoints';
import LetterTracingCanvas from '@/components/game/LetterTracingCanvas';
import { base44 } from '@/api/base44Client';

const BASE_LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('').filter((l) => LETTER_WAYPOINTS[l]);
const SPANISH_EXTRA = ['ñ'];

// Teacher's letter-tracing model canvas. The teacher picks a letter and traces
// it on the guided canvas; the live ink (current + completed strokes) is
// broadcast so student iPads mirror the pen forming the letter in real time.
// The guided canvas enforces the correct stroke path, so the teacher always
// models a correctly-formed letter.
export default function TracingModelCanvas({ step, send }) {
  const targets = step?.config?.targets || step?.config?.targetLetters;
  const [waypoints, setWaypoints] = useState(LETTER_WAYPOINTS);
  const [letter, setLetter] = useState(null);

  // Load DB-authored waypoint overrides (same merge as the student tracing mode).
  useEffect(() => {
    let cancelled = false;
    base44.entities.LetterWaypoint.list()
      .then((records) => {
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
            } catch { /* ignore malformed */ }
          }
          return merged;
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const letters = (targets && targets.length ? targets : [...BASE_LETTERS, ...SPANISH_EXTRA])
    .map((l) => l.toLowerCase())
    .filter((l) => waypoints[l]);

  useEffect(() => {
    if (!letter && letters.length) setLetter(letters[0]);
  }, [letters, letter]);

  const guideStrokes = letter ? waypoints[letter]?.strokes : null;

  const handleStrokesChange = useCallback((payload) => {
    if (!letter || !guideStrokes) return;
    send({ type: 'tracing', letter, guideStrokes, ...payload });
  }, [send, letter, guideStrokes]);

  if (!letter || !guideStrokes) {
    return <div className="p-10 text-center text-slate-400">No letters available for this step.</div>;
  }

  return (
    <div className="flex flex-col gap-3 p-4 max-w-3xl mx-auto w-full">
      <div className="font-bold text-slate-700 text-sm">Trace a letter — students see your strokes live on their iPads.</div>

      <div className="flex flex-wrap gap-2 justify-center max-h-28 overflow-y-auto p-1">
        {letters.map((l) => (
          <button
            key={l}
            onClick={() => setLetter(l)}
            className={`h-10 w-10 rounded-lg font-bold text-lg transition ${
              letter === l ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-700 border border-indigo-100 hover:bg-indigo-50'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      <div className="flex justify-center">
        <LetterTracingCanvas
          key={letter}
          letter={letter}
          lang="es"
          strokes={guideStrokes}
          renderWidth={360}
          onComplete={() => {}}
          onAccuracy={() => {}}
          onReset={() => {}}
          onStrokesChange={handleStrokesChange}
        />
      </div>
    </div>
  );
}