import { useState, useEffect, useCallback } from 'react';
import { Volume2, RotateCw } from 'lucide-react';
import { LETTER_SOUNDS, LETTER_SOUNDS_EN } from '@/components/data/letterSounds';
import { playLetterSound } from '@/lib/audio';

// Teacher's model panel for the Letter Sounds activity during the "I do" phase.
// The teacher picks a target letter (or lets a round auto-generate), plays its
// sound, and taps an option to demonstrate. Each state change broadcasts to the
// student mirror so iPads show the same letter, options, and the teacher's pick.
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
  const [isCorrect, setIsCorrect] = useState(false);
  const [phase, setPhase] = useState('prompt'); // prompt | answered

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
    setIsCorrect(false);
    setPhase('prompt');
    playLetterSound(letter, lang);
  }, [pool, buildOptions, lang]);

  // First round on mount
  useEffect(() => { newRound(); /* eslint-disable-next-line */ }, []);

  // Broadcast every state change so the student mirror stays in sync.
  useEffect(() => {
    if (!target) return;
    send({ type: 'letter_sounds', lang, targetLetter: target, options, selectedLetter: selected, isCorrect, phase });
  }, [target, options, selected, isCorrect, phase, lang, send]);

  const handleAnswer = (letter) => {
    if (phase === 'answered') return;
    setSelected(letter);
    setIsCorrect(letter === target);
    setPhase('answered');
  };

  return (
    <div className="h-full flex flex-col items-center justify-center gap-5 p-6 bg-gradient-to-b from-sky-50 to-indigo-50 overflow-auto">
      <div className="text-center">
        <div className="text-xs font-bold text-indigo-500 uppercase tracking-wide">Letter Sounds · Modeling</div>
        <div className="text-6xl font-black text-slate-800 mt-1">{(target || '?').toUpperCase()}</div>
      </div>

      <button
        onClick={() => target && playLetterSound(target, lang)}
        className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white font-bold px-5 py-2.5 rounded-full shadow"
      >
        <Volume2 className="w-5 h-5" /> Play sound
      </button>

      {targets.length > 1 && (
        <div className="flex flex-wrap gap-1.5 justify-center max-w-md">
          {targets.map((l) => (
            <button
              key={l}
              onClick={() => newRound(l)}
              className={`w-9 h-9 rounded-lg text-sm font-bold transition ${
                target === l ? 'bg-indigo-500 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 max-w-md w-full">
        {options.map((opt, i) => {
          const isSelected = selected === opt.letter;
          const showCorrect = phase === 'answered' && opt.letter === target;
          const showWrong = phase === 'answered' && isSelected && !isCorrect;
          return (
            <button
              key={i}
              onClick={() => handleAnswer(opt.letter)}
              disabled={phase === 'answered'}
              className={`h-28 rounded-2xl border-2 flex items-center justify-center transition active:scale-95 ${
                showCorrect ? 'border-green-500 bg-green-100' :
                showWrong ? 'border-red-500 bg-red-100' :
                'border-slate-200 bg-white hover:border-indigo-300'
              }`}
            >
              <span className="text-5xl font-black text-slate-800">{opt.display}</span>
            </button>
          );
        })}
      </div>

      {phase === 'answered' && (
        <div className={`text-2xl font-black ${isCorrect ? 'text-green-600' : 'text-red-500'}`}>
          {isCorrect ? '🎉 Correct!' : `❌ It's "${(target || '').toUpperCase()}"`}
        </div>
      )}

      <button
        onClick={() => newRound()}
        className="flex items-center gap-2 bg-slate-700 hover:bg-slate-800 text-white font-bold px-5 py-2.5 rounded-full shadow"
      >
        <RotateCw className="w-5 h-5" /> New round
      </button>
    </div>
  );
}