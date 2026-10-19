import { useState } from 'react';
import { ImageOff, RotateCcw, Volume2 } from 'lucide-react';
import { markersToPretty } from '@/lib/lettersort/phonics';

// A single sort card — presentational only (the view wraps it in <Draggable>).
// Renders either a word tile (tiles-only / split word-half) or an image tile.
// Honors "hideWords": word is covered with a speaker icon; tapping plays audio.
// The word is revealed only when the card is locked (dropped in the correct column).
export default function SortCard({ card, tilesOnly, splitCards, hideWords, showCaption, onClick, locked, bad, imageOnly, audioState }) {
  if (imageOnly) return <ImageOnlyCard card={card} onClick={onClick} locked={locked} bad={bad} audioState={audioState} />;
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
        className={base + 'overflow-hidden px-3 py-3 min-h-[96px] w-full cursor-grab active:cursor-grabbing ' + (locked && hideWords ? 'animate-card-flip' : '')}
        style={locked && hideWords ? { transformStyle: 'preserve-3d' } : undefined}
        onClick={onClick}
        role="button"
        tabIndex={0}
      >
        <span className={`font-bold text-slate-800 text-center leading-tight break-words ${labelText.length > 8 ? 'text-2xl' : labelText.length > 6 ? 'text-3xl' : 'text-4xl'}`}>
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
      <img src={card.imgUrl} alt="" className="rounded-lg object-contain w-full max-h-28 bg-slate-50" draggable={false} />
      {showCaption && (
        <div className="mt-1 text-center text-sm font-semibold text-slate-700 truncate w-full px-1">
          {labelText || '\u00A0'}
        </div>
      )}
    </div>
  );
}
// Picture-only card: never renders spelling (not even when locked, not as alt
// text, not as a fallback). Broken/missing image -> neutral icon + listen cue.
function ImageOnlyCard({ card, onClick, locked, bad, audioState }) {
  const [broken, setBroken] = useState(false);
  const showImg = card.imgUrl && !broken;
  const err = audioState === 'error';
  const loading = audioState === 'loading';
  const ring = locked
    ? 'border-green-400 ring-2 ring-green-300 '
    : bad ? 'border-red-400 ring-2 ring-red-300 animate-pulse ' : 'border-slate-200 ';
  return (
    <div
      className={'relative select-none rounded-xl bg-white shadow-sm transition-all border-2 p-1 w-full cursor-grab active:cursor-grabbing ' + ring}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } }}
      role="button"
      tabIndex={0}
      aria-label={err ? 'Reintentar audio' : 'Escuchar palabra'}
    >
      {showImg ? (
        <img src={card.imgUrl} alt="" onError={() => setBroken(true)} className="rounded-lg object-contain w-full h-24 bg-slate-50" draggable={false} />
      ) : (
        <div className="rounded-lg w-full h-24 bg-slate-100 text-slate-400 flex items-center justify-center">
          <ImageOff className="w-8 h-8" />
        </div>
      )}
      <span
        className={'absolute bottom-1.5 right-1.5 w-7 h-7 rounded-full flex items-center justify-center shadow pointer-events-none ' +
          (err ? 'bg-amber-500 text-white' : 'bg-indigo-600 text-white') + (loading ? ' animate-pulse' : '')}
      >
        {err ? <RotateCcw className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
      </span>
      {err && (
        <div className="absolute top-1 left-1 right-1 rounded-md bg-amber-50 border border-amber-300 text-amber-800 text-[11px] font-semibold text-center px-1 py-0.5 pointer-events-none">
          Audio no disponible. Toca para reintentar.
        </div>
      )}
    </div>
  );
}
