import { Home, DoorOpen, UserCheck, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseName } from '@/lib/nameNormalize';

/**
 * Small vertical icon bar that pops up on the left when a student is tapped
 * in Carpet teaching mode. Offers Home (absent) and Door (pulled out) icons.
 * If the student is already out, a Back (present) icon appears.
 *
 * Tapping another student instead of an icon means "swap" — handled by the
 * parent's existing swap logic, which closes this sidebar.
 */
export default function StatusSidebar({ student, status, onStatusChange, onClose }) {
  if (!student) return null;
  const { first } = parseName(student.name);
  const current = status || 'present';

  return (
    <div className="bg-white rounded-lg border shadow-lg p-2.5 flex flex-col gap-1.5 w-[72px] shrink-0">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold truncate">{first || student.name}</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground -mr-0.5">
          <X className="w-3 h-3" />
        </button>
      </div>
      <button
        onClick={() => onStatusChange('absent')}
        className={cn(
          'flex flex-col items-center gap-0.5 py-1.5 rounded-md border-2 transition-colors',
          current === 'absent' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-transparent hover:bg-accent'
        )}
      >
        <Home className="w-5 h-5" />
        <span className="text-[9px] font-medium">Home</span>
      </button>
      <button
        onClick={() => onStatusChange('stepped_out')}
        className={cn(
          'flex flex-col items-center gap-0.5 py-1.5 rounded-md border-2 transition-colors',
          current === 'stepped_out' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-transparent hover:bg-accent'
        )}
      >
        <DoorOpen className="w-5 h-5" />
        <span className="text-[9px] font-medium">Out</span>
      </button>
      {current !== 'present' && (
        <button
          onClick={() => onStatusChange('present')}
          className="flex flex-col items-center gap-0.5 py-1.5 rounded-md border-2 border-transparent hover:bg-accent transition-colors"
        >
          <UserCheck className="w-5 h-5" />
          <span className="text-[9px] font-medium">Back</span>
        </button>
      )}
    </div>
  );
}