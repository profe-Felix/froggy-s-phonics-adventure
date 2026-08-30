import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export const MISSING_LETTER_PRESETS_KEY = ['missing-letter-presets'];

// DB-backed Missing Letter presets. Each record stores items_data (JSON array
// of word items) and an optional default_bank. Returns a list for the picker
// and a map keyed by preset key for the game/step to consume.
export function useMissingLetterPresets() {
  const qc = useQueryClient();
  const { data: records = [], isLoading } = useQuery({
    queryKey: MISSING_LETTER_PRESETS_KEY,
    queryFn: () => base44.entities.MissingLetterPreset.list('-updated_date', 500),
  });

  const presets = useMemo(() => {
    const map = {};
    for (const r of records) {
      let items = [];
      try { items = JSON.parse(r.items_data || '[]'); } catch { items = []; }
      let bank = [];
      try { bank = JSON.parse(r.default_bank || '[]'); } catch { bank = []; }
      map[r.key] = {
        _dbId: r.id,
        label: r.label || r.key,
        items,
        default_bank: Array.isArray(bank) ? bank : [],
      };
    }
    return map;
  }, [records]);

  const list = useMemo(
    () => Object.keys(presets)
      .map((k) => ({ id: k, label: presets[k]?.label || k, itemCount: (presets[k]?.items || []).length }))
      .sort((a, b) => (a.label || '').localeCompare(b.label || '', 'es')),
    [presets]
  );

  return {
    presets,
    list,
    isLoading,
    refresh: () => qc.invalidateQueries({ queryKey: MISSING_LETTER_PRESETS_KEY }),
  };
}