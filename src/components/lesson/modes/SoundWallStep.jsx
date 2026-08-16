import { useState } from 'react';
import CameraMirror from '@/components/soundwall/CameraMirror';
import { playLetterSound } from '@/lib/audio';
import { ChevronLeft, ChevronRight, Volume2, Check } from 'lucide-react';

// Student-facing Sound Wall step. Shows a sound wall card (lip/mouth image) on
// one side and a front-facing camera mirror on the other so students can
// replicate the mouth shape and make the sound. Supports multiple cards per
// step; the student cycles through them and taps Done to complete.
export default function SoundWallStep({ onComplete, stepConfig }) {
  const lang = stepConfig?.language || 'es';
  const cards = stepConfig?.cards?.length
    ? stepConfig.cards
    : stepConfig?.cardUrl
      ? [{ label: stepConfig.cardLabel || '', imageUrl: stepConfig.cardUrl, sound: stepConfig.sound || '' }]
      : [];

  const [idx, setIdx] = useState(0);
  const [done, setDone] = useState(false);
  const card = cards[idx];

  const playSound = () => {
    if (card?.sound) playLetterSound(card.sound, lang);
  };

  const next = () => {
    if (idx < cards.length - 1) {
      setIdx(idx + 1);
    } else if (!done) {
      setDone(true);
      onComplete?.();
    }
  };

  const prev = () => {
    if (idx > 0) setIdx(idx - 1);
  };

  if (cards.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400 text-lg font-bold">
        No sound wall cards configured.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 p-4 min-h-0 overflow-auto">
        {/* Sound wall card */}
        <div className="flex flex-col items-center justify-center gap-3">
          <div className="w-full max-w-sm aspect-[3/4] rounded-2xl overflow-hidden shadow-lg bg-white border-4 border-indigo-200">
            {card?.imageUrl ? (
              <img src={card.imageUrl} alt={card?.label || 'Sound card'} className="w-full h-full object-contain" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-300 text-sm">No image</div>
            )}
          </div>
          {card?.label && <div className="text-3xl font-black text-indigo-600">{card.label}</div>}
          <button
            onClick={playSound}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-indigo-500 text-white font-black shadow-lg hover:bg-indigo-600 transition"
          >
            <Volume2 className="w-5 h-5" /> Play sound
          </button>
        </div>

        {/* Camera mirror */}
        <div className="flex flex-col items-center justify-center gap-3">
          <div className="text-sm font-bold text-gray-500 text-center">
            👄 Make your mouth match the card!
          </div>
          <CameraMirror className="w-full max-w-sm aspect-[3/4]" />
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between p-4 shrink-0 bg-white border-t border-gray-100">
        <button
          onClick={prev}
          disabled={idx === 0}
          className="px-4 py-2 rounded-xl bg-white border border-gray-200 font-bold text-gray-600 disabled:opacity-40 inline-flex items-center gap-1 hover:bg-gray-50"
        >
          <ChevronLeft className="w-5 h-5" /> Prev
        </button>
        <span className="text-sm font-bold text-gray-500">
          {idx + 1} / {cards.length}
        </span>
        <button
          onClick={next}
          disabled={done}
          className="px-4 py-2 rounded-xl bg-green-500 text-white font-bold inline-flex items-center gap-1 hover:bg-green-600 disabled:opacity-60"
        >
          {idx < cards.length - 1 ? (
            <>Next <ChevronRight className="w-5 h-5" /></>
          ) : (
            <><Check className="w-5 h-5" /> {done ? 'Done!' : 'Done'}</>
          )}
        </button>
      </div>
    </div>
  );
}