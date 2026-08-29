import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

// Dynamic class list driven by ClassConfig records, so teachers can add/remove
// classes without code changes. Every dashboard that used to hardcode
// `['Felix','Valero','Campos']` now reads from here.
//
// Falls back to a sensible default list while ClassConfig records load (or if
// none exist yet) so dashboards never render empty on first load.
export const FALLBACK_CLASSES = ['Felix', 'Valero', 'Gutierrez', 'Schwarz'];

export function useClassNames() {
  const queryClient = useQueryClient();
  const { data: configs = [], isLoading } = useQuery({
    queryKey: ['class-configs-for-names'],
    queryFn: () => base44.entities.ClassConfig.list('-updated_date', 100),
  });

  const names = configs.map((c) => c.class_name).filter(Boolean);
  const classList = names.length ? names : FALLBACK_CLASSES;

  const addClass = async (class_name, { color, grade, language } = {}) => {
    const existing = configs.find((c) => c.class_name === class_name);
    if (existing) {
      await base44.entities.ClassConfig.update(existing.id, { color, grade, language });
    } else {
      await base44.entities.ClassConfig.create({ class_name, color, grade, language });
    }
    queryClient.invalidateQueries({ queryKey: ['class-configs-for-names'] });
    queryClient.invalidateQueries({ queryKey: ['class-colors'] });
  };

  const removeClass = async (class_name) => {
    const existing = configs.find((c) => c.class_name === class_name);
    if (existing) {
      await base44.entities.ClassConfig.delete(existing.id);
    }
    queryClient.invalidateQueries({ queryKey: ['class-configs-for-names'] });
    queryClient.invalidateQueries({ queryKey: ['class-colors'] });
  };

  return { classList, configs, isLoading, addClass, removeClass };
}