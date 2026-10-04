import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { requestWithRetry } from '@/lib/classroomSync';

export function useClassConfigs() {
  return useQuery({
    queryKey: ['class-configs'],
    queryFn: () => requestWithRetry(() => base44.entities.ClassConfig.list('-updated_date', 100)),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    // Retry slowly only while there is an actual error.
    // Previously loaded configurations stay available during that error.
    refetchInterval: query => query.state.status === 'error'
      ? 20000 + Math.random() * 10000
      : false,
    refetchIntervalInBackground: false,
    retry: false,
  });
}
