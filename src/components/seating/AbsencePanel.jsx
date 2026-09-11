import { UserX, UserCheck, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseName } from '@/lib/nameNormalize';

export default function AbsencePanel({ seats, studentMap, onMarkBack }) {
  const outStudents = (seats || []).filter(
    (s) => s.student_id && s.status && s.status !== 'present'
  );

  if (outStudents.length === 0) {
    return (
      <div className="text-center py-3 text-sm text-muted-foreground">
        ✓ All students present
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {outStudents.map((seat) => {
        const student = studentMap[seat.student_id];
        if (!student) return null;
        const { first } = parseName(student.name);
        const isAbsent = seat.status === 'absent';
        const since = seat.absent_since ? new Date(seat.absent_since) : null;
        const mins = since ? Math.max(0, Math.round((Date.now() - since.getTime()) / 60000)) : 0;

        return (
          <div
            key={seat.id}
            className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-2 border',
              isAbsent ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
            )}
          >
            <UserX className={cn('w-4 h-4 shrink-0', isAbsent ? 'text-red-500' : 'text-amber-500')} />
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{first || student.name}</div>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {isAbsent ? 'Absent' : 'Pulled'} · {mins}m
              </div>
            </div>
            <button
              onClick={() => onMarkBack(seat.position)}
              className="ml-1 shrink-0 text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 flex items-center gap-1"
            >
              <UserCheck className="w-3 h-3" />
              Back
            </button>
          </div>
        );
      })}
    </div>
  );
}