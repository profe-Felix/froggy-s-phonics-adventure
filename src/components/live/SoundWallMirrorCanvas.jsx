import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import CameraMirror from '@/components/soundwall/CameraMirror';
import RevealCard from '@/components/soundwall/RevealCard';
import { playLetterSound } from '@/lib/audio';
import { Lock } from 'lucide-react';

// Student's read-only mirror of the teacher's Sound Wall progression. Follows
// the teacher's "Show next" advances in realtime, revealing each stage:
//   1. Phoneme mouth card
//   2. Camera mirror (practice mouth shape)
//   3. Grapheme card
// The student sees the same stages the teacher reveals, in the same order.
export default function SoundWallMirrorCanvas({ broadcast }) {
  const has = broadcast?.type === 'soundwall';
  const stages = has ? (broadcast.stages || []) : [];
  const revealedCount = has ? (broadcast.revealedCount || 0) : 0;
  const lang = has ? broadcast.lang : 'es';
  const lastStageCountRef = useRef(0);

  // Replay the sound when a new phoneme or grapheme stage is revealed.
  useEffect(() => {
    if (!has || !stages.length) return;
    if (revealedCount > lastStageCountRef.current) {
      const newStage = stages[revealedCount - 1];
      if (newStage?.card?.sound && (newStage.type === 'phoneme' || newStage.type === 'grapheme')) {
        playLetterSound(newStage.card.sound, lang);
      }
    }
    lastStageCountRef.current = revealedCount;
  }, [has, revealedCount, stages, lang]);

  if (!has || stages.length === 0) return null;

  const stageLabels = {
    phoneme: { color: 'text-red-400', text: 'We make it this way' },
    camera: { color: 'text-indigo-400', text: 'Now you try it!' },
    grapheme: { color: 'text-green-400', text: 'This sound is written as' },
  };

  return (
    <div className="w-full h-full p-4 flex flex-col">
      <div className="flex-1 flex items-center justify-center min-h-0 overflow-auto">
        <div className="flex flex-col lg:flex-row gap-4 items-center justify-center w-full max-w-5xl">
          {stages.map((stage, i) => {
            const label = stageLabels[stage.type];
            const isRevealed = i < revealedCount;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={isRevealed ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.4 }}
                className={`flex-1 flex flex-col items-center gap-2 ${isRevealed ? '' : 'pointer-events-none'}`}
              >
                <div className="text-center">
                  <p className={`text-xs font-black uppercase tracking-wide ${label.color}`}>
                    {label.text}
                  </p>
                  {stage.type === 'camera' && (
                    <p className="text-[10px] text-white/40 mt-0.5">Match the mouth shape</p>
                  )}
                </div>

                {stage.type === 'camera' ? (
                  <div className="w-full max-w-[320px] aspect-[3/4] rounded-2xl overflow-hidden shadow-lg bg-slate-950">
                    {isRevealed && <CameraMirror className="w-full h-full" />}
                  </div>
                ) : (
                  <div className="w-full max-w-[320px] aspect-[3/4] rounded-2xl overflow-hidden shadow-lg bg-white">
                    {isRevealed && <RevealCard card={stage.card} />}
                  </div>
                )}

                {stage.card?.label && isRevealed && (
                  <div className="text-2xl font-black text-white">{stage.card.label}</div>
                )}

                {isRevealed && (
                  <div className="text-xs text-white/60 flex items-center gap-1.5 bg-black/40 px-3 py-1.5 rounded-full">
                    <Lock className="w-3.5 h-3.5" /> Watch your teacher
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 p-2 shrink-0">
        <span className="text-sm font-bold text-white/60">
          {revealedCount} / {stages.length}
        </span>
      </div>
    </div>
  );
}