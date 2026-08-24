import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import letterSortPresets from '@/lib/presets/letterSortPresets';
import { presetModeKey } from '@/lib/lettersort/presetConfig';

export const LETTER_SORT_PRESETS_KEY = ['letter-sort-presets'];

// DB-backed Letter Sort presets, merged with the in-app local presets as a
// fallback. DB records override local entries with the same key, so edits made
// in the lesson planner take effect while un-edited presets still resolve.
export function useLetterSortPresets() {
  const qc = useQueryClient();
  const { data: records = [], isLoading } = useQuery({
    queryKey: LETTER_SORT_PRESETS_KEY,
    queryFn: () => base44.entities.LetterSortPreset.list('-updated_date', 500),
  });

  const presets = useMemo(() => {
    const map = { ...letterSortPresets };
    for (const r of records) {
      let cfg = {};
      try { cfg = JSON.parse(r.config_data || '{}'); } catch { cfg = {}; }
      map[r.key] = {
        ...cfg,
        _dbId: r.id,
        label: r.label || r.key,
        mode_key: r.mode_key || presetModeKey(cfg) || '',
      };
    }
    return map;
  }, [records]);

  const list = useMemo(
    () => Object.keys(presets)
      .map((k) => ({
        id: k,
        label: presets[k]?.label || k,
        modeKey: presets[k]?.mode_key || presetModeKey(presets[k]) || '',
      }))
      .sort((a, b) => (a.label || '').localeCompare(b.label || '', 'es')),
    [presets]
  );

  return {
    presets,
    list,
    isLoading,
    refresh: () => qc.invalidateQueries({ queryKey: LETTER_SORT_PRESETS_KEY }),
  };
}