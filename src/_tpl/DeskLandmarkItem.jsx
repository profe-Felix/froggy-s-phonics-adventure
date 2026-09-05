import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function DeskLandmarkItem({ landmark, onPointerDown, onDelete, onEdit }) {
  return (
    <div
      onPointerDown={onPointerDown}
      onDoubleClick={(e) => { e.stopPropagation(); onEdit(); }}
      className={cn(
        'absolute rounded-md border-2 border-dashed border-amber-500 bg-amber-100/50 flex items-center justify-center select-none',
        onPointerDown && 'cursor-grab active:cursor-grabbing'
      )}
      style={{
        left: landmark.x - landmark.width / 2,
        top: landmark.y - landmark.height / 2,
        width: landmark.width,
        height: landmark.height,
      }}
    >
      <span className="text-xs font-medium text-amber-700 truncate px-1 pointer-events-none">
        {landmark.label || 'Landmark'}
      </span>
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-white border border-red-300 shadow flex items-center justify-center hover:bg-red-50 z-10"
        title="Delete landmark"
      >
        <X className="w-3 h-3 text-red-500" />
      </button>
    </div>
  );
}