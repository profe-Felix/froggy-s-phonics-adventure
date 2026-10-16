import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { requestWithRetry } from '@/lib/classroomSync';
import StudentThumbnail from '@/components/notebook/StudentThumbnail';

// Test-only wrapper that fetches its own TestNotebookSession and adapts props
// for the production StudentThumbnail component.
export default function TestStudentThumbnail({ assignment, className, studentNumber, schoolYear, live, onOpen }) {
  const { data: sessions = [] } = useQuery({
    queryKey: ['test-notebook-session-thumb', assignment?.id, className, studentNumber, schoolYear],
    queryFn: () => requestWithRetry(() => base44.entities.TestNotebookSession.filter({
      assignment_id: assignment.id,
      class_name: className,
      student_number: studentNumber,
      school_year: schoolYear,
    })),
    enabled: !!assignment?.id && !!className && !!studentNumber,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchInterval: 30000,
    retry: 1,
  });

  const session = sessions[0] || null;
  const viewPage = live?.current_page || undefined;

  if (!session) {
    return (
      <div
        className="rounded-2xl overflow-hidden flex flex-col"
        style={{ background: '#1a1a2e', border: '1px solid #4338ca' }}
      >
        <div className="flex items-center justify-between px-2 py-1.5 shrink-0" style={{ background: '#0f0f1a' }}>
          <div className="w-7 h-7 rounded-full flex items-center justify-center font-black text-white text-sm" style={{ background: '#4338ca' }}>
            {studentNumber}
          </div>
          <span className="text-xs text-indigo-500 italic">No session</span>
        </div>
        <div className="h-20 flex items-center justify-center text-gray-500 text-xs">Not joined yet</div>
      </div>
    );
  }

  return (
    <StudentThumbnail
      session={session}
      assignment={assignment}
      viewPage={viewPage}
      onOpen={onOpen || (() => {})}
    />
  );
}