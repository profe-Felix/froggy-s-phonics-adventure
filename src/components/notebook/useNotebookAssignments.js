import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { requestWithRetry } from '@/lib/classroomSync';

export default function useNotebookAssignments(className, directAssignmentName, directAssignmentId = null) {
  return useQuery({
    queryKey: ['student-notebook-assignments', className, directAssignmentName?.trim().toLowerCase() || '', directAssignmentId || ''],
    queryFn: () => requestWithRetry(() => {
      const query = { class_name: className, status: 'active' };
      if (directAssignmentId) {
        return base44.entities.DigitalNotebookAssignment.filter({ ...query, id: directAssignmentId }, 'created_date', 1);
      }
      if (directAssignmentName?.trim()) {
        const title = directAssignmentName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        query.title = { $regex: `^${title}$`, $options: 'i' };
        return base44.entities.DigitalNotebookAssignment.filter(query, 'created_date', 1);
      }
      return base44.entities.DigitalNotebookAssignment.filter(query);
    }),
    enabled: Boolean(className),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchInterval: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    // When a direct assignment name is present (student redirected from a live
    // assessment), retry the query a couple of times so a transient 429 doesn't
    // leave the notebook view without its PDF. When no direct name is set the
    // student is just browsing the picker, so no retry needed.
    retry: Boolean(directAssignmentId || directAssignmentName?.trim()) ? 2 : false,
    retryDelay: (attempt) => Math.min(10000, 2000 * 2 ** attempt) + Math.random() * 1000,
  });
}