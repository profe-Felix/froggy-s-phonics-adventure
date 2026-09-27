import { parseName } from '@/lib/nameNormalize';
import { cn } from '@/lib/utils';

// Visual student card used in the Small Group Manager — shows photo + name.
// Used both in the unassigned bank and inside color group columns.
export default function GroupStudentCard({ student, isSelected, onClick, onUnassign, size = 'sm' }) {
  const { first, last } = parseName(student.name);
  const initials = ((first[0] || '') + (last[0] || '')).toUpperCase();
  const photo = student.photo_url;
  const displayName = first || last || student.name;

  return (
    <div className="relative group">
      <button
        onClick={onClick}
        className={cn(
          'flex items-center gap-1.5 rounded-lg border-2 p-1.5 transition-all text-left w-full',
          isSelected
            ? 'border-slate-800 ring-2 ring-slate-400 ring-offset-1'
            : 'border-slate-200 hover:border-slate-300 bg-white'
        )}
      >
        <div className={cn('rounded overflow-hidden bg-slate-100 shrink-0', size === 'sm' ? 'w-7 h-7' : 'w-10 h-10')}>
          {photo ? (
            <img src={photo} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-slate-400">
              {initials}
            </div>
          )}
        </div>
        <span className={cn('font-medium truncate', size === 'sm' ? 'text-xs' : 'text-sm')}>{displayName}</span>
      </button>
      {onUnassign && (
        <button
          onClick={(e) => { e.stopPropagation(); onUnassign(student); }}
          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow text-[10px] font-bold"
          title="Remove from group"
        >
          ✕
        </button>
      )}
    </div>
  );
}