import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

// Hex pairs (light -> dark) for each selectable class color. Stored as a key
// in ClassConfig.color and resolved here so login tiles render fully dynamic
// gradients without needing Tailwind to purge-safelist every shade.
export const CLASS_COLOR_PALETTE = {
  red: { name: 'Red', from: '#f87171', to: '#dc2626' },
  orange: { name: 'Orange', from: '#fb923c', to: '#ea580c' },
  amber: { name: 'Amber', from: '#fbbf24', to: '#d97706' },
  yellow: { name: 'Yellow', from: '#facc15', to: '#ca8a04' },
  green: { name: 'Green', from: '#4ade80', to: '#16a34a' },
  emerald: { name: 'Emerald', from: '#34d399', to: '#059669' },
  teal: { name: 'Teal', from: '#2dd4bf', to: '#0d9488' },
  cyan: { name: 'Cyan', from: '#22d3ee', to: '#0891b2' },
  sky: { name: 'Sky', from: '#38bdf8', to: '#0284c7' },
  blue: { name: 'Blue', from: '#60a5fa', to: '#2563eb' },
  indigo: { name: 'Indigo', from: '#818cf8', to: '#4f46e5' },
  violet: { name: 'Violet', from: '#a78bfa', to: '#7c3aed' },
  purple: { name: 'Purple', from: '#c084fc', to: '#9333ea' },
  fuchsia: { name: 'Fuchsia', from: '#e879f9', to: '#c026d3' },
  pink: { name: 'Pink', from: '#f472b6', to: '#db2777' },
  rose: { name: 'Rose', from: '#fb7185', to: '#e11d48' },
};

const FALLBACK = CLASS_COLOR_PALETTE.emerald;

// Loads all ClassConfig records and exposes color/grade/language lookups plus a
// grade-grouped class list for the login screens. Color, grade, and language
// are all data-driven from the stored records.
export function useClassColors() {
  const queryClient = useQueryClient();
  const { data: configs = [], isLoading } = useQuery({
    queryKey: ['class-colors'],
    queryFn: () => base44.entities.ClassConfig.list('-updated_date', 100),
  });

  const byName = {};
  configs.forEach((c) => { if (c.class_name) byName[c.class_name] = c; });

  const colorFor = (cls) => CLASS_COLOR_PALETTE[byName[cls]?.color] || FALLBACK;
  const languageFor = (cls) => byName[cls]?.language || 'es';
  const gradeFor = (cls) => byName[cls]?.grade || 'kinder';
  const tracingOnlyFor = (cls) => !!byName[cls]?.tracing_only;
  const sharesBooksFromFor = (cls) => byName[cls]?.shares_books_from || [];

  // Classes grouped by grade, preserving storage order.
  const groupedClasses = () => {
    const grades = { kinder: [], first: [] };
    configs.forEach((c) => {
      if (!c.class_name) return;
      const g = c.grade === 'first' ? 'first' : 'kinder';
      grades[g].push(c.class_name);
    });
    return grades;
  };

  const setColor = async (cls, color) => {
    const existing = configs.find((c) => c.class_name === cls);
    if (existing) {
      await base44.entities.ClassConfig.update(existing.id, { color });
    } else {
      await base44.entities.ClassConfig.create({ class_name: cls, color });
    }
    queryClient.invalidateQueries({ queryKey: ['class-colors'] });
  };

  return { colorFor, languageFor, gradeFor, tracingOnlyFor, sharesBooksFromFor, groupedClasses, setColor, palette: CLASS_COLOR_PALETTE, configs, loading: isLoading };
}