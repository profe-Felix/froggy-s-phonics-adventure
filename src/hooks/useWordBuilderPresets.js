import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import wordBuilderPresets from '@/lib/presets/wordBuilderPresets';

export const WORD_BUILDER_PRESETS_KEY = ['word-builder-presets'];

// DB-backed Word Builder presets, merged with the in-app local presets as a
// fallback. DB records override local entries with the same key, so edits/duplicates
// made in the lesson planner take effect while un-edited presets still resolve.
export function useWordBuilderPresets() {
  const qc = useQueryClient();
  const { data: records = [], isLoading } = useQuery({
    queryKey: WORD_BUILDER_PRESETS_KEY,
    queryFn: () => base44.entities.WordBuilderPreset.list('-updated_date', 500),
  });

  const presets = useMemo(() => {
    const map = { ...wordBuilderPresets };
    for (const r of records) {
      let content = {};
      try { content = JSON.parse(r.content_data || '{}'); } catch { content = {}; }
      map[r.key] = {
        content,
        _dbId: r.id,
        _id: r.key,
        label: r.label || r.key,
      };
    }
    return map;
  }, [records]);

  const list = useMemo(
    () => Object.keys(presets)
      .map((k) => ({ id: k, label: presets[k]?.label || k }))
      .sort((a, b) => (a.label || '').localeCompare(b.label || '', 'es')),
    [presets]
  );

  return {
    presets,
    list,
    isLoading,
    refresh: () => qc.invalidateQueries({ queryKey: WORD_BUILDER_PRESETS_KEY }),
  };
}