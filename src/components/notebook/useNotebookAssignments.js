import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { requestWithRetry } from '@/lib/classroomSync';

export default function useNotebookAssignments(className, directAssignmentName) {
  return useQuery({
    queryKey: ['student-notebook-assignments', className, directAssignmentName?.trim().toLowerCase() || ''],
    queryFn: () => requestWithRetry(() => {
      const query = { class_name: className, status: 'active' };
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
    retry: false,
  });
}