import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { parseCurriculumKey } from '@/lib/literacy/curriculumContentBuilder';
import { splitLiteracyList, normalizeSpanish } from '@/lib/literacy/lessonProgression';
import { compareCurriculumPositions } from '@/lib/literacy/curriculumGraphemes';

// Loads all active Lesson records and returns a Set of lowercase-normalized
// sight words that students should know by the given curriculum position
// (e.g. "M2.L1"). A word is "known" if it appears in any lesson whose
// daily_lessons curriculum position is <= the target.
export function useKnownSightWords(lessonKey) {
  return useQuery({
    queryKey: ['known-sight-words', lessonKey],
    queryFn: async () => {
      if (!lessonKey) return new Set();
      const target = parseCurriculumKey(lessonKey);
      if (!target) return new Set();

      const res = await base44.entities.Lesson.filter({ active: true }, { limit: 200 });
      const lessons = res.items || [];
      const known = new Set();

      lessons.forEach((lesson) => {
        const dailyLessons = lesson.daily_lessons || [];
        const positions = dailyLessons
          .filter(d => d.active !== false)
          .map(d => ({
            module_number: Number(d.module_number) || 0,
            curriculum_lesson_number: Number(d.curriculum_lesson_number) || 0,
          }))
          .filter(p => p.module_number > 0 && p.curriculum_lesson_number > 0)
          .filter(p => compareCurriculumPositions(p, target) <= 0);

        if (positions.length === 0) return;

        const sightWords = splitLiteracyList(lesson.literacy_progression?.sightWords);
        sightWords.forEach(w => known.add(normalizeSpanish(w)));
      });

      return known;
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!lessonKey,
  });
}