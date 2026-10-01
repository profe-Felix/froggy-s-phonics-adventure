import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import DictationCanvas from '@/components/dictation/DictationCanvas';
import { Loader2 } from 'lucide-react';

// Renders a DictationAssignment inside a lesson step. The teacher dictates
// verbally; students write on the canvas (autosaved as a DictationSubmission).
// Completion is "view" — the student finishes and presses "Back to Lesson",
// which the LessonModeRouter treats as a completed step.
export default function DictationStep({ stepConfig, studentNumber, className }) {
  const assignmentId = stepConfig?.assignmentId;

  const { data: assignment, isLoading } = useQuery({
    queryKey: ['dictation-assignment', assignmentId],
    queryFn: () => base44.entities.DictationAssignment.get(assignmentId),
    enabled: !!assignmentId,
  });

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
    // Top padding clears the LessonModeRouter's floating Back / goal chip.
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