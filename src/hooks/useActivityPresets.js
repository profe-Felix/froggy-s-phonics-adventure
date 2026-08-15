import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { PRESETS as BUILTIN_PRESETS } from '@/lib/activities/presets';

// Merge built-in code presets with teacher-created DB presets.
// DB presets are keyed by their entity id; built-ins keep their string keys.
export function useActivityPresets() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['activityPresets'],
    queryFn: async () => {
      const records = await base44.entities.ActivityPreset.list('-created_date', 200);
      return records;
    },
    staleTime: 30000,
  });

  const presets = useMemo(() => {
    const out = { ...BUILTIN_PRESETS };
    for (const r of data || []) {
      out[r.id] = {
        label: r.label,
        mode: r.mode,
        items: r.items_data ? safeParse(r.items_data, []) : [],
        ...(r.hunt_type ? { huntType: r.hunt_type } : {}),
        ...(r.hunt_target ? { target: r.hunt_target } : {}),
        ...(r.palette_data ? { palette: safeParse(r.palette_data, []) } : {}),
        _dbId: r.id,
      };
    }
    return out;
  }, [data]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['activityPresets'] });

  return { presets, dbRecords: data || [], isLoading, invalidate };
}

function safeParse(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

// Serialize items array → textarea string (one item per line).
export function serializeItems(mode, items) {
  if (mode === 'rhyme_identification') {
    return (items || []).map((it) => `${it.word1}, ${it.word2}, ${it.answer ? 'sí' : 'no'}`).join('\n');
  }
  return (items || []).map((it) => (typeof it === 'string' ? it : it.text || it.word || '')).join('\n');
}

// Parse textarea string → items array.
export function parseItems(mode, text) {
  const lines = String(text || '').split(/\n/).map(s => s.trim()).filter(Boolean);
  if (mode === 'rhyme_identification') {
    return lines.map(l => {
      const parts = l.split(',').map(x => x.trim());
      if (parts.length < 2) return null;
      return { word1: parts[0], word2: parts[1], answer: /sí|si|true/i.test(parts[2] || '') };
    }).filter(Boolean);
  }
  return lines.map(t => ({ text: t }));
}