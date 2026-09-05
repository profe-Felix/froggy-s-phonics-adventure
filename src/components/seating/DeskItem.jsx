import { RotateCw, X } from 'lucide-react';
import { parseName } from '@/lib/nameNormalize';
import { cn } from '@/lib/utils';

export const DESK_W = 84;
export const DESK_H = 56;

export default function DeskItem({ desk, student, isBankSelected, isSelected, isSwapSource, interactive, onPointerDown, onRotate, onDelete }) {
  const { first, last } = parseName(student?.name);
  const displayName = first || last || '';
  const initials = student ? ((first[0] || '') + (last[0] || '')).toUpperCase() : '';
  const photo = student?.photo_url;
  const isPortrait = (desk.rotation || 0) % 180 === 90;
  const visualW = isPortrait ? DESK_H : DESK_W;
  const visualH = isPortrait ? DESK_W : DESK_H;
  const fitClass = isPortrait ? 'object-cover' : 'object-contain';

  return (
    <div
      onPointerDown={interactive ? onPointerDown : undefined}
      className={cn(
        'absolute select-none rounded-md border-2 bg-white overflow-hidden transition-shadow',
        interactive && 'cursor-grab active:cursor-grabbing hover:shadow-md',
        !interactive && 'pointer-events-none',
        isSelected
          ? 'border-primary ring-2 ring-primary z-10'
          : isSwapSource
            ? 'border-amber-500 ring-2 ring-amber-500 z-10'
            : isBankSelected && !student
              ? 'border-primary border-dashed bg-primary/5'
              : 'border-slate-400'
      )}
      style={{
        left: desk.x - visualW / 2,
        top: desk.y - visualH / 2,
        width: visualW,
        height: visualH,
        touchAction: 'none',
      }}
    >
      {student ? (
        photo ? (
          <img src={photo} alt="" className={`w-full h-full ${fitClass}`} />
        ) : (
          <div className="w-full h-full flex items-center gap-1 p-1">
            <div className="w-9 h-9 rounded bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-400 shrink-0">
              {initials}
            </div>
            <span className="text-[10px] font-medium leading-tight truncate">{displayName}</span>
          </div>
        )
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-300">
          {isBankSelected ? 'Tap to seat' : 'Empty'}
        </div>
      )}

      {interactive && (
        <>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onRotate(); }}
            className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-white border border-slate-300 shadow flex items-center justify-center hover:bg-slate-50 z-10"
            title="Rotate"
          >
            <RotateCw className="w-3 h-3" />
          </button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-white border border-red-300 shadow flex items-center justify-center hover:bg-red-50 z-10"
            title="Delete"
          >
            <X className="w-3 h-3 text-red-500" />
          </button>
        </>
      )}
    </div>
  );
}