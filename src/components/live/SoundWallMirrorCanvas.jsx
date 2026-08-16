import { useEffect, useRef } from 'react';
import CameraMirror from '@/components/soundwall/CameraMirror';
import { playLetterSound } from '@/lib/audio';
import { Lock } from 'lucide-react';

// Student's read-only mirror of the teacher's Sound Wall model. Shows the same
// sound wall card the teacher is displaying plus a front-facing camera mirror
// so the student can practice their mouth shape. The teacher controls which
// card is shown; the student just watches and replicates.
export default function SoundWallMirrorCanvas({ broadcast }) {
  const has = broadcast?.type === 'soundwall';
  const card = has ? broadcast.card : null;
  const lang = has ? broadcast.lang : 'es';
  const lastCardRef = useRef(null);

  // Replay the sound whenever the teacher moves to a new card.
  useEffect(() => {
    if (has && card && card.imageUrl !== lastCardRef.current) {
      lastCardRef.current = card.imageUrl;
      if (card.sound) playLetterSound(card.sound, lang);
    }
  }, [has, card, lang]);

  if (!has || !card) return null;

  return (
    <div className="w-full h-full p-4 flex items-center justify-center">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-4xl">
        {/* Teacher's card */}
        <div className="flex flex-col items-center justify-center gap-2">
          <div className="w-full aspect-[3/4] max-h-[60vh] rounded-2xl overflow-hidden shadow-lg bg-white border-4 border-indigo-200">
            {card.imageUrl ? (
              <img src={card.imageUrl} alt={card.label || 'Sound card'} className="w-full h-full object-contain" />
            ) : null}
          </div>
          {card.label && <div className="text-2xl font-black text-white">{card.label}</div>}
          <div className="text-xs text-white/60 flex items-center gap-1.5 bg-black/40 px-3 py-1.5 rounded-full">
            <Lock className="w-3.5 h-3.5" /> Watch your teacher — try it when they say go
          </div>
        </div>

        {/* Camera mirror */}
        <div className="flex flex-col items-center justify-center gap-2">
          <div className="text-sm font-bold text-white/70">👄 Make your mouth match!</div>
          <CameraMirror className="w-full aspect-[3/4] max-h-[60vh]" />
        </div>
      </div>
    </div>
  );
}