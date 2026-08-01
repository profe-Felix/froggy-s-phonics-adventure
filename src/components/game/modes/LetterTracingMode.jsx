import { useState, useEffect } from 'react';
import { LETTER_WAYPOINTS } from '../../data/letterWaypoints';
import LetterTracingCanvas from '../LetterTracingCanvas';
import { base44 } from '@/api/base44Client';
import { getLanguage } from '@/lib/language';

const BASE_LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('').filter(l => LETTER_WAYPOINTS[l]);
// ñ is a Spanish-only letter; English students never see it. The other letters
// share the same waypoints across both languages (same shapes, different phonemes).
const SPANISH_EXTRA = ['ñ'];

export default function LetterTracingMode({ studentData, onUpdateProgress, targets }) {
  const [currentLetter, setCurrentLetter] = useState(null);
  const [completedLetters, setCompletedLetters] = useState(new Set());
  const [streak, setStreak] = useState(0);
  const [waypoints, setWaypoints] = useState(LETTER_WAYPOINTS);

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

  const lang = getLanguage(studentData);
  const LETTERS = (targets && targets.length > 0 ? targets : [...BASE_LETTERS, ...(lang === 'es' ? SPANISH_EXTRA : [])])
    .map(l => l.toLowerCase()).filter(l => waypoints[l]);

  const handleComplete = (letter) => {
    setCompletedLetters(prev => new Set([...prev, letter]));
    setStreak(s => s + 1);
    setTimeout(() => setCurrentLetter(null), 1200);
  };

  if (!currentLetter) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-purple-400 to-indigo-600 flex flex-col items-center py-8 px-4 gap-6">
        <div className="text-center">
          <div className="text-4xl mb-1">✏️</div>
          <h1 className="text-2xl font-bold text-white">Letter Tracing</h1>
          <p className="text-white/70 text-sm mt-1">Tap a letter to practice writing it</p>
        </div>

        {streak > 0 && (
          <div className="bg-yellow-400 rounded-full px-4 py-1 text-yellow-900 font-bold text-sm">
            🔥 {streak} in a row!
          </div>
        )}

        <div className="grid grid-cols-5 gap-2 w-full max-w-sm">
          {LETTERS.map(letter => (
            <button
              key={letter}
              onClick={() => setCurrentLetter(letter)}
              className={`h-14 rounded-xl font-bold text-xl shadow transition-transform active:scale-95 ${
                completedLetters.has(letter)
                  ? 'bg-green-400 text-white'
                  : 'bg-white text-indigo-700 hover:bg-indigo-50'
              }`}
            >
              {letter}
            </button>
          ))}
        </div>

        <p className="text-white/50 text-xs">{completedLetters.size}/{LETTERS.length} letters practiced</p>
      </div>
    );
  }

  const letterData = waypoints[currentLetter];

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-400 to-indigo-600 flex flex-col items-center py-8 px-4 gap-4">
      <div className="flex items-center justify-between w-full max-w-sm">
        <button
          onClick={() => setCurrentLetter(null)}
          className="text-white/80 hover:text-white text-sm"
        >
          ← All letters
        </button>
        <div className="text-white font-bold text-lg">{currentLetter}</div>
        <div className="w-16" />
      </div>

      <div className="bg-white/10 rounded-xl px-4 py-2 text-white/80 text-sm text-center max-w-xs">
        {letterData.hint}
      </div>

      <LetterTracingCanvas
        letter={currentLetter}
        strokes={letterData.strokes}
        onComplete={() => handleComplete(currentLetter)}
        onReset={() => {}}
      />
    </div>
  );
}