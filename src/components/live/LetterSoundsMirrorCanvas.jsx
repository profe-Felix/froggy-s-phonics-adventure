import { useEffect, useRef } from 'react';
import { Lock } from 'lucide-react';
import { playLetterSound } from '@/lib/audio';

// Student's read-only mirror of the teacher's Letter Sounds model. Renders the
// same target letter + four option cards and highlights the teacher's pick
// (green = the teacher found the right one, red = a wrong demonstration). Plays
// the letter sound on the iPad too so students with headphones hear it. No
// interaction — students try themselves once the teacher releases the "try" phase.
export default function LetterSoundsMirrorCanvas({ broadcast }) {
  const has = broadcast?.type === 'letter_sounds';
  const lang = has ? (broadcast.lang || 'es') : 'es';
  const target = has ? broadcast.targetLetter : null;
  const options = has ? (broadcast.options || []) : [];
  const selected = has ? broadcast.selectedLetter : null;
  const isCorrect = has ? broadcast.isCorrect : false;
  const phase = has ? broadcast.phase : 'prompt';

  // Replay the sound whenever the teacher moves to a new target letter.
  const lastTargetRef = useRef(null);
  useEffect(() => {
    if (target && target !== lastTargetRef.current) {
      lastTargetRef.current = target;
      playLetterSound(target, lang);
    }
  }, [target, lang]);

  return (
    <div className="flex flex-col gap-4 p-6 max-w-md mx-auto w-full">
      <div className="rounded-2xl bg-white border-2 border-slate-200 p-4 text-center shadow-sm">
        <div className="text-xs font-bold text-indigo-600 uppercase tracking-wide mb-1">Sound</div>
        <div className="text-5xl font-black text-slate-800">{(target || '?').toUpperCase()}</div>
      </div>

      <div className="grid grid-cols-2 gap-3 w-full">
        {options.map((opt, i) => {
          const isSelected = selected === opt.letter;
          const showCorrect = phase === 'answered' && opt.letter === target;
          const showWrong = phase === 'answered' && isSelected && !isCorrect;
          return (
            <div
              key={i}
              className={`h-28 rounded-2xl border-2 flex items-center justify-center ${
                showCorrect ? 'border-green-500 bg-green-100' :
                showWrong ? 'border-red-500 bg-red-100' :
                isSelected ? 'border-indigo-400 bg-indigo-50' :
                'border-slate-200 bg-white'
              }`}
            >
              <span className="text-5xl font-black text-slate-800">{opt.display}</span>
            </div>
          );
        })}
      </div>

      {phase === 'answered' && (
        <div className={`text-center text-2xl font-black ${isCorrect ? 'text-green-600' : 'text-red-500'}`}>
          {isCorrect ? '🎉 Correct!' : `❌ It's "${(target || '').toUpperCase()}"`}
        </div>
      )}

      <div className="text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
        <Lock className="w-3.5 h-3.5" /> Watch your teacher — try it yourself when they say go
      </div>
    </div>
  );
}