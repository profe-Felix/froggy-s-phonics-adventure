import { useState, useEffect } from 'react';
import { playLetterSound } from '@/lib/audio';
import { ChevronLeft, ChevronRight, Volume2 } from 'lucide-react';

// Teacher's model panel for the Sound Wall activity during the "I do" phase.
// Shows the current sound wall card large on screen and broadcasts the card
// index + data to student mirrors so they see the same card + their own camera.
export default function SoundWallModelCanvas({ step, send }) {
  const cfg = step?.config || {};
  const lang = cfg.language || 'es';
  const cards = cfg.cards?.length
    ? cfg.cards
    : cfg.cardUrl
      ? [{ label: cfg.cardLabel || '', imageUrl: cfg.cardUrl, sound: cfg.sound || '' }]
      : [];

  const [idx, setIdx] = useState(0);
  const card = cards[idx];

  // Broadcast current card to student mirrors whenever it changes.
  useEffect(() => {
    if (!card) return;
    send({ type: 'soundwall', lang, cardIndex: idx, card, totalCards: cards.length });
  }, [idx, card, lang, send]); // eslint-disable-line react-hooks/exhaustive-deps

  const playSound = () => {
    if (card?.sound) playLetterSound(card.sound, lang);
  };

  if (cards.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-slate-400 text-lg font-bold">
        No sound wall cards configured.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-3 p-4 overflow-hidden">
      <div className="text-xs font-bold text-indigo-400 uppercase tracking-wide shrink-0">
        Sound Wall · Modeling — students see your card
      </div>

      <div className="flex-1 flex items-center justify-center min-h-0">
        <div className="flex flex-col items-center gap-3">
          <div className="w-full max-w-lg aspect-[3/4] max-h-full rounded-2xl overflow-hidden shadow-2xl bg-white border-4 border-indigo-300">
            {card?.imageUrl ? (
              <img src={card.imageUrl} alt={card?.label || 'Sound card'} className="w-full h-full object-contain" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-300">No image</div>
            )}
          </div>
          {card?.label && <div className="text-4xl font-black text-white">{card.label}</div>}
          <button
            onClick={playSound}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-indigo-500 text-white font-black shadow-lg hover:bg-indigo-600"
          >
            <Volume2 className="w-5 h-5" /> Play sound
          </button>
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 shrink-0">
        <button
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
          disabled={idx === 0}
          className="w-10 h-10 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 flex items-center justify-center"
        >
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
        <span className="text-white font-bold text-sm">{idx + 1} / {cards.length}</span>
        <button
          onClick={() => setIdx((i) => Math.min(cards.length - 1, i + 1))}
          disabled={idx >= cards.length - 1}
          className="w-10 h-10 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 flex items-center justify-center"
        >
          <ChevronRight className="w-5 h-5 text-white" />
        </button>
      </div>
    </div>
  );
}