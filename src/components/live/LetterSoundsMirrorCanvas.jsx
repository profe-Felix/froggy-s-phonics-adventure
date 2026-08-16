import { useRef, useEffect } from 'react';
import { Lock } from 'lucide-react';
import GameCanvas from '@/components/game/GameCanvas';
import { playLetterSound } from '@/lib/audio';

// Student's read-only mirror of the teacher's Letter Sounds model. Renders the
// real frog-catches-flies scene (sky, clouds, lily pad, frog, letter flies) so
// students watch the same game their teacher is playing. When the teacher taps a
// fly, the mirror replays the frog's tongue-catch animation and shows the same
// correct/wrong feedback. No answering — students try themselves in the "try" phase.
export default function LetterSoundsMirrorCanvas({ broadcast }) {
  const has = broadcast?.type === 'letter_sounds';
  const lang = has ? (broadcast.lang || 'es') : 'es';
  const target = has ? broadcast.targetLetter : null;
  const options = has ? (broadcast.options || []) : [];
  const selected = has ? broadcast.selectedLetter : null;
  const isCorrect = has ? broadcast.isCorrect : false;
  const phase = has ? broadcast.phase : 'prompt';

  const gameRef = useRef(null);
  const lastTargetRef = useRef(null);
  const caughtRef = useRef(false);

  // Replay the letter sound whenever the teacher moves to a new target.
  useEffect(() => {
    if (target && target !== lastTargetRef.current) {
      lastTargetRef.current = target;
      caughtRef.current = false;
      playLetterSound(target, lang);
    }
  }, [target, lang]);

  // Replay the frog's catch animation when the teacher answers.
  useEffect(() => {
    if (phase === 'answered' && selected && !caughtRef.current) {
      caughtRef.current = true;
      gameRef.current?.catchFly(selected);
    }
  }, [phase, selected]);

  if (!has || !target) return null;

  return (
    <div className="flex flex-col items-center gap-2 w-full">
      <div className="relative w-full max-w-2xl h-[58vh] rounded-2xl overflow-hidden shadow-lg">
        <GameCanvas
          ref={gameRef}
          currentLetter={target}
          options={options}
          score={0}
          streak={0}
          onPlaySound={() => target && playLetterSound(target, lang)}
          showFeedback={phase === 'answered'}
          isCorrect={isCorrect}
          canAnswer={false}
        />
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-white/95 bg-black/45 px-3 py-1.5 rounded-full flex items-center gap-1.5 pointer-events-none">
          <Lock className="w-3.5 h-3.5" /> Watch your teacher — try it when they say go
        </div>
      </div>
    </div>
  );
}