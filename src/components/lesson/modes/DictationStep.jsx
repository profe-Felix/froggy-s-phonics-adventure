import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import DictationCanvas from '@/components/dictation/DictationCanvas';
import DictadoLinesCanvas from '@/components/dictation/DictadoLinesCanvas';
import { Loader2 } from 'lucide-react';

// Renders a dictation step inside a lesson.
// Two modes:
//  1. Inline lines (step.config.lines) — teacher-driven live dictado. The student
//     joins the active LiveDictationSession for their class and writes on a per-line
//     canvas whose ink locks line-by-line as the teacher reveals/advances.
//  2. Legacy assignment (step.config.assignmentId) — simple autosaving canvas.
export default function DictationStep({ stepConfig, studentNumber, className }) {
  const inlineLines = (stepConfig?.lines || [])
    .map((l) => (typeof l === 'string' ? l : ''))
    .filter((l) => l.trim() !== '');
  const hasInline = inlineLines.length > 0;

  // Live dictado session discovery (inline lines flow)
  const { data: liveSessions, isLoading: liveLoading } = useQuery({
    queryKey: ['dictado-live-student', className, ACTIVE_SCHOOL_YEAR],
    queryFn: () =>
      base44.entities.LiveDictationSession.filter({
        class_name: className,
        school_year: ACTIVE_SCHOOL_YEAR,
        active: true,
      }),
    enabled: hasInline && !!className,
    refetchInterval: 1000,
  });
  const liveSession = Array.isArray(liveSessions) && liveSessions.length > 0
    ? liveSessions[0]
    : null;

  // Legacy assignment-based flow
  const assignmentId = stepConfig?.assignmentId;
  const { data: assignment, isLoading } = useQuery({
    queryKey: ['dictation-assignment', assignmentId],
    queryFn: () => base44.entities.DictationAssignment.get(assignmentId),
    enabled: !hasInline && !!assignmentId,
  });

  if (hasInline) {
    if (liveLoading && !liveSession) {
      return (
        <div className="h-full flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      );
    }
    if (!liveSession) {
      return (
        <div className="h-full flex flex-col items-center justify-center text-slate-500 p-6 text-center gap-2">
          <div className="text-5xl">✍️</div>
          <p className="font-bold text-slate-700">
            Waiting for your teacher to start dictation…
          </p>
          <p className="text-sm text-slate-400">
            When your teacher goes live, this screen will open.
          </p>
        </div>
      );
    }
    const lines =
      liveSession.lines && liveSession.lines.length > 0
        ? liveSession.lines
        : inlineLines;
    const bs = liveSession.broadcast_state || {};
    return (
      <div className="h-full min-h-0 flex flex-col pt-14">
        <div className="flex-1 min-h-0 flex flex-col">
          <DictadoLinesCanvas
            lines={lines}
            currentLine={bs.current_line || 0}
            revealed={!!bs.revealed}
            assignmentId={liveSession.assignment_id}
            studentNumber={studentNumber}
            className={className}
            schoolYear={ACTIVE_SCHOOL_YEAR}
          />
        </div>
      </div>
    );
  }

  // Legacy assignment flow
  if (!assignmentId) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400 p-6 text-center">
        No dictation assignment selected for this step.
      </div>
    );
  }
  if (isLoading || !assignment) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }
  return (
    <div className="h-full min-h-0 flex flex-col pt-14">
      <div className="flex-1 min-h-0 flex flex-col">
        <DictationCanvas
          assignmentId={assignmentId}
          studentNumber={studentNumber}
          className={className}
          schoolYear={ACTIVE_SCHOOL_YEAR}
          promptText={assignment?.prompt_text || stepConfig?.promptText || ''}
        />
      </div>
    </div>
  );
}