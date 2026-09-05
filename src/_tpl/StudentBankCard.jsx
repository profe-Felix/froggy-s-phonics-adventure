import { parseName } from '@/lib/nameNormalize';
import { cn } from '@/lib/utils';

export default function StudentBankCard({ student, isSelected, onClick }) {
  const { first, last } = parseName(student.student_name);
  const initials = ((first[0] || '') + (last[0] || '')).toUpperCase();
  const photo = student.photo_url;
  const displayName = first || last || student.student_name;

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-lg border-2 p-1.5 transition-all text-left w-full',
        isSelected
          ? 'border-primary ring-2 ring-primary ring-offset-1'
          : 'border-slate-200 hover:border-slate-300 bg-white'
      )}
    >
      <div className="w-7 h-7 rounded overflow-hidden bg-slate-100 shrink-0">
        {photo ? (
          <img src={photo} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-slate-400">
            {initials}
          </div>
        )}
      </div>
      <span className="text-xs font-medium truncate">{displayName}</span>
    </button>
  );
}