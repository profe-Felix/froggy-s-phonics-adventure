import { useState, useEffect, useCallback } from 'react';
import { RotateCw } from 'lucide-react';
import GameCanvas from '@/components/game/GameCanvas';
import { LETTER_SOUNDS, LETTER_SOUNDS_EN } from '@/components/data/letterSounds';
import { playLetterSound } from '@/lib/audio';

// Teacher's model panel for the Letter Sounds activity during the "I do" phase.
// Reuses the real frog-catches-flies GameCanvas so the teacher demonstrates on
// the exact same scene the students play. Each state change broadcasts to the
// student mirror so iPads show the same target, flies, and the teacher's catch.
const CONFUSING = {
  en: { 'b': ['d'], 'd': ['b'], 'p': ['b', 'q'], 'q': ['p'], 'm': ['n'], 'n': ['m'], 'v': ['w'], 'w': ['v'], 'g': ['j'], 'j': ['g'], 'c': ['k'], 'k': ['c'], 's': ['c'], 'u': ['v'], 'i': ['l'] },
  es: { 'c': ['k', 'c-soft'], 'k': ['c'], 'c-soft': ['c'], 'll': ['y'], 'y': ['ll'], 'b': ['v'], 'v': ['b'], 'r': ['r-soft'], 'r-soft': ['r'], 'g': ['g-soft', 'j'], 'g-soft': ['g', 'j'], 'j': ['g', 'g-soft'] },
};

export default function LetterSoundsModelCanvas({ step, send }) {
  const lang = step?.config?.language || 'es';
  const ALL = lang === 'en' ? LETTER_SOUNDS_EN : LETTER_SOUNDS;
  const targets = (step?.config?.targets || []).filter((l) => ALL.includes(l));
  const pool = targets.length ? targets : ALL;

  const [target, setTarget] = useState(null);
  const [options, setOptions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [canAnswer, setCanAnswer] = useState(true);

  const buildOptions = useCallback((t) => {
    const avoid = CONFUSING[lang]?.[t] || [];
    const wrong = ALL
      .filter((l) => l !== t && !avoid.includes(l))
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);
    const randomCase = (l) => (Math.random() < 0.5 ? l.toUpperCase() : l);
    return [t, ...wrong].sort(() => Math.random() - 0.5).map((l) => ({ letter: l, display: randomCase(l) }));
  }, [ALL, lang]);

  const newRound = useCallback((t) => {
    const letter = t || pool[Math.floor(Math.random() * pool.length)];
    setTarget(letter);
    setOptions(buildOptions(letter));
    setSelected(null);
    setShowFeedback(false);
    setIsCorrect(false);
    setCanAnswer(true);
    playLetterSound(letter, lang);
  }, [pool, buildOptions, lang]);

  // First round on mount
  useEffect(() => { newRound(); /* eslint-disable-next-line */ }, []);

  // Broadcast every state change so the student mirror stays in sync.
  useEffect(() => {
    if (!target) return;
    send({
      type: 'letter_sounds', lang, targetLetter: target, options,
      selectedLetter: selected, isCorrect, phase: showFeedback ? 'answered' : 'prompt',
    });
  }, [target, options, selected, showFeedback, isCorrect, lang, send]);

  const handleAnswer = (letter) => {
    if (showFeedback) return;
    const correct = letter === target;
    setSelected(letter);
    setIsCorrect(correct);
    setShowFeedback(true);
    setCanAnswer(false);
  };

  const handleRetry = () => {
    setShowFeedback(false);
    setIsCorrect(false);
    setSelected(null);
    setCanAnswer(true);
    playLetterSound(target, lang);
  };

  // Auto-advance after a correct demonstration
  useEffect(() => {
    if (showFeedback && isCorrect) {
      const t = setTimeout(() => newRound(), 1800);
      return () => clearTimeout(t);
    }
  }, [showFeedback, isCorrect, newRound]);

  return (
    <div className="h-full flex flex-col gap-2 p-3 overflow-hidden">
      <div className="text-xs font-bold text-indigo-500 uppercase tracking-wide shrink-0">Letter Sounds · Modeling — students see your frog</div>

      <div className="relative flex-1 min-h-0 w-full rounded-2xl overflow-hidden shadow-lg">
        <GameCanvas
          currentLetter={target}
          options={options}
          onAnswer={handleAnswer}
          score={0}
          streak={0}
          onPlaySound={() => target && playLetterSound(target, lang)}
          showFeedback={showFeedback}
          isCorrect={isCorrect}
          canAnswer={canAnswer}
          onRetry={handleRetry}
        />
      </div>

      <div className="flex flex-wrap gap-2 justify-center items-center shrink-0">
        {targets.length > 1 && targets.map((l) => (
          <button
            key={l}
            onClick={() => newRound(l)}
            className={`px-3 h-9 rounded-lg text-sm font-bold transition ${
              target === l ? 'bg-indigo-500 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {l.toUpperCase()}
          </button>
        ))}
        <button
          onClick={() => newRound()}
          className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-800 text-white px-4 h-9 rounded-lg text-sm font-bold shadow"
        >
          <RotateCw className="w-4 h-4" /> New round
        </button>
      </div>
    </div>
  );
}