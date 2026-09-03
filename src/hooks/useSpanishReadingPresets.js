import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export const SPANISH_READING_PRESETS_KEY = ['spanish-reading-presets'];

// DB-backed Slide-Reading presets. Each record stores items_data (JSON array
// of strings or {text, id}) and a section. Returns a list for the picker and
// a map keyed by preset key for the game/step to consume.
export function useSpanishReadingPresets() {
  const qc = useQueryClient();
  const { data: records = [], isLoading } = useQuery({
    queryKey: SPANISH_READING_PRESETS_KEY,
    queryFn: () => base44.entities.SpanishReadingPreset.list('-updated_date', 500),
  });

  const presets = useMemo(() => {
    const map = {};
    for (const r of records) {
      let items = [];
      try { items = JSON.parse(r.items_data || '[]'); } catch { items = []; }
      map[r.key] = {
        _dbId: r.id,
        label: r.label || r.key,
        section: r.section || 'Sílabas',
        items: Array.isArray(items) ? items : [],
      };
    }
    return map;
  }, [records]);

  const list = useMemo(
    () => Object.keys(presets)
      .map((k) => ({
        id: k,
        label: presets[k]?.label || k,
        section: presets[k]?.section || 'Sílabas',
        itemCount: (presets[k]?.items || []).length,
      }))
      .sort((a, b) => (a.label || '').localeCompare(b.label || '', 'es')),
    [presets]
  );

  return {
    presets,
    list,
    isLoading,
    refresh: () => qc.invalidateQueries({ queryKey: SPANISH_READING_PRESETS_KEY }),
  };
}