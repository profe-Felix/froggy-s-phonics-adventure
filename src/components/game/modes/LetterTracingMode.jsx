import { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Sparkles } from 'lucide-react';
import { LETTER_WAYPOINTS } from '../../data/letterWaypoints';
import LetterTracingCanvas from '../LetterTracingCanvas';
import { base44 } from '@/api/base44Client';
import { getLanguage } from '@/lib/language';

const BASE_LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('').filter(l => LETTER_WAYPOINTS[l]);
// ñ is a Spanish-only letter; English students never see it. The other letters
// share the same waypoints across both languages (same shapes, different phonemes).
const SPANISH_EXTRA = ['ñ'];

// Adaptive sizing: level 0 = huge (nearly fills the screen), each step shrinks
// toward Zaner-Bloser size. When a letter is traced cleanly it levels up
// (smaller); a rough trace levels it back down (bigger) so a struggling student
// returns to large-format practice before shrinking again.
const SIZE_LEVELS = [
  { w: 600, label: 'Huge' },
  { w: 460, label: 'Big' },
  { w: 360, label: 'Medium' },
  { w: 290, label: 'Small' },
  { w: 240, label: 'Zaner-Bloser' },
];
const MAX_LEVEL = SIZE_LEVELS.length - 1;
const PAGE_SIZE = 10;

export default function LetterTracingMode({ studentData, onUpdateProgress, targets }) {
  const [currentLetter, setCurrentLetter] = useState(null);
  const [completedLetters, setCompletedLetters] = useState(new Set());
  const [streak, setStreak] = useState(0);
  const [waypoints, setWaypoints] = useState(LETTER_WAYPOINTS);
  const [letterLevels, setLetterLevels] = useState({});
  const [lastAccuracy, setLastAccuracy] = useState(null);
  const [celebrate, setCelebrate] = useState(null);
  const [page, setPage] = useState(0);
  const studentKey = studentData?.id || 'guest';

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

  // Load persisted per-letter scale levels for this student (per device).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`tracing-scale-${studentKey}`);
      if (raw) setLetterLevels(JSON.parse(raw));
    } catch {}
  }, [studentKey]);

  const persistLevels = (next) => {
    setLetterLevels(next);
    try { localStorage.setItem(`tracing-scale-${studentKey}`, JSON.stringify(next)); } catch {}
  };

  const lang = getLanguage(studentData);
  const LETTERS = (targets && targets.length > 0 ? targets : [...BASE_LETTERS, ...(lang === 'es' ? SPANISH_EXTRA : [])])
    .map(l => l.toLowerCase()).filter(l => waypoints[l]);

  const pageCount = Math.max(1, Math.ceil(LETTERS.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const paged = LETTERS.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const levelFor = (l) => letterLevels[l] || 0;
  const renderWidthFor = (l) => {
    const w = SIZE_LEVELS[levelFor(l)].w;
    return Math.min(w, Math.max(220, (typeof window !== 'undefined' ? window.innerWidth : 800) * 0.92));
  };

  const handleAccuracy = (acc) => setLastAccuracy(acc);

  const handleComplete = (letter) => {
    setCompletedLetters(prev => new Set([...prev, letter]));
    setStreak(s => s + 1);
    const acc = lastAccuracy;
    const cur = levelFor(letter);
    let next = cur;
    let leveledUp = false;
    if (acc != null && acc >= 80 && cur < MAX_LEVEL) {
      next = cur + 1;
      leveledUp = true;
    } else if (acc != null && acc < 70 && cur > 0) {
      next = cur - 1; // struggled → grow back to a bigger size
    }
    persistLevels({ ...letterLevels, [letter]: next });
    if (leveledUp) {
      setCelebrate({ letter, level: next, label: SIZE_LEVELS[next].label });
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
      setTimeout(() => setCelebrate(null), 2200);
    }
    setTimeout(() => { setCurrentLetter(null); setLastAccuracy(null); }, leveledUp ? 1600 : 900);
  };

  if (!currentLetter) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center py-6 px-4 gap-4">
        <div className="text-center">
          <div className="text-4xl mb-1">✏️</div>
          <h1 className="text-2xl font-bold text-slate-800">Letter Tracing</h1>
          <p className="text-slate-500 text-sm mt-1">Tap a letter to practice writing it</p>
        </div>

        {streak > 0 && (
          <div className="bg-amber-100 border border-amber-300 rounded-full px-4 py-1 text-amber-800 font-bold text-sm">
            🔥 {streak} in a row!
          </div>
        )}

        <div className="grid grid-cols-5 gap-2 w-full max-w-md">
          {paged.map(letter => {
            const lvl = levelFor(letter);
            const done = completedLetters.has(letter);
            return (
              <button
                key={letter}
                onClick={() => { setCurrentLetter(letter); setLastAccuracy(null); }}
                className={`h-14 rounded-xl font-bold text-xl shadow-sm transition-transform active:scale-95 flex flex-col items-center justify-center ${
                  done ? 'bg-green-500 text-white' : 'bg-white text-indigo-700 border border-indigo-100 hover:bg-indigo-50'
                }`}
              >
                {letter}
                {lvl > 0 && <span className="text-[9px] font-bold opacity-70">L{lvl + 1}</span>}
              </button>
            );
          })}
        </div>

        {pageCount > 1 && (
          <div className="flex items-center gap-3">
            <button disabled={safePage === 0} onClick={() => setPage(p => Math.max(0, p - 1))}
              className="px-3 py-1 rounded-lg bg-white border disabled:opacity-40 text-sm font-bold text-slate-600">← Prev</button>
            <span className="text-xs text-slate-400 font-bold">{safePage + 1}/{pageCount}</span>
            <button disabled={safePage >= pageCount - 1} onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
              className="px-3 py-1 rounded-lg bg-white border disabled:opacity-40 text-sm font-bold text-slate-600">Next →</button>
          </div>
        )}

        <p className="text-slate-400 text-xs">{completedLetters.size}/{LETTERS.length} letters practiced</p>
      </div>
    );
  }

  const letterData = waypoints[currentLetter];
  const lvl = levelFor(currentLetter);
  const sizeLabel = SIZE_LEVELS[lvl].label;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center py-4 px-4 gap-3">
      <div className="flex items-center justify-between w-full max-w-md">
        <button onClick={() => setCurrentLetter(null)} className="text-slate-500 hover:text-slate-800 text-sm font-bold">← All letters</button>
        <div className="text-slate-800 font-bold text-lg">{currentLetter}</div>
        <div className="text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-full px-2 py-1">{sizeLabel} · L{lvl + 1}</div>
      </div>

      {letterData.hint && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-2 text-indigo-700 text-sm text-center max-w-xs">
          {letterData.hint}
        </div>
      )}

      <LetterTracingCanvas
        letter={currentLetter}
        lang={lang}
        strokes={letterData.strokes}
        renderWidth={renderWidthFor(currentLetter)}
        onComplete={() => handleComplete(currentLetter)}
        onAccuracy={handleAccuracy}
        onReset={() => {}}
      />

      {celebrate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-white rounded-3xl shadow-2xl px-8 py-6 flex flex-col items-center gap-2">
            <Sparkles className="w-10 h-10 text-amber-400" />
            <div className="text-2xl font-black text-slate-800">Level Up!</div>
            <div className="text-slate-500 text-sm">{celebrate.letter.toUpperCase()} → {celebrate.label}</div>
          </div>
        </div>
      )}
    </div>
  );
}