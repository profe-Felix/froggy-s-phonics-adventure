import { Volume2 } from 'lucide-react';
import { markersToPretty } from '@/lib/lettersort/phonics';

// A single sort card — presentational only (the view wraps it in <Draggable>).
// Renders either a word tile (tiles-only / split word-half) or an image tile.
// Honors "hideWords": word is covered with a speaker icon; tapping plays audio.
// The word is revealed only when the card is locked (dropped in the correct column).
export default function SortCard({ card, tilesOnly, splitCards, hideWords, showCaption, onClick, locked, bad }) {
  const isWordTile = tilesOnly || (splitCards && !card.imgUrl);
  const labelText = markersToPretty(card.coreRaw || card.word || '');

  const base =
    'relative select-none rounded-xl bg-white shadow-sm transition-all flex flex-col items-center justify-center ' +
    (locked ? 'border-2 border-green-400 ring-2 ring-green-300 ' : 'border-2 border-slate-200 ') +
    (bad ? 'border-red-400 ring-2 ring-red-300 animate-pulse ' : '');

  if (isWordTile || !card.imgUrl) {
    const showCover = hideWords && !locked;
    return (
      <div
        className={base + 'overflow-hidden px-2 py-2 min-h-[64px] w-full cursor-grab active:cursor-grabbing'}
        onClick={onClick}
        role="button"
        tabIndex={0}
      >
        <span className="font-bold text-xl text-slate-800 text-center leading-tight break-words">
          {labelText || '\u00A0'}
        </span>
        {showCover && (
          <div className="absolute inset-0 rounded-xl bg-indigo-500 text-white font-bold flex items-center justify-center pointer-events-none">
            <Volume2 className="w-6 h-6" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={base + 'overflow-hidden p-1 w-full cursor-grab active:cursor-grabbing'}
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      <img src={card.imgUrl} alt="" className="rounded-lg object-contain w-full max-h-16 bg-slate-50" draggable={false} />
      {showCaption && (
        <div className="mt-1 text-center text-sm font-semibold text-slate-700 truncate w-full px-1">
          {labelText || '\u00A0'}
        </div>
      )}
    </div>
  );
}