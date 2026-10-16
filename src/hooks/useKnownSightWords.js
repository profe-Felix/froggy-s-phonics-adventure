import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { parseCurriculumKey } from '@/lib/literacy/curriculumContentBuilder';
import { splitLiteracyList, normalizeSpanish } from '@/lib/literacy/lessonProgression';
import { compareCurriculumPositions } from '@/lib/literacy/curriculumGraphemes';
import { SIGHT_WORDS_EASY } from '@/components/data/sightWords';

// Total curriculum lessons = 9 modules × 15 lessons
const TOTAL_CURRICULUM_LESSONS = 135;

// Loads all active Lesson records and returns a Set of lowercase-normalized
// sight words that students should know by the given curriculum position.
//
// Sight words are introduced in PHONICS lessons (the daily_lessons on Lesson
// records), not in reading lessons.  When `className` is provided we look up
// the class's ClassConfig to get its active phonics position
// (active_spanish_module / active_spanish_lesson) and use THAT as the target,
// because phonics is typically further ahead than reading.  If no ClassConfig
// is found we fall back to the reading lessonKey.
//
// If no lessons have literacy_progression.sightWords populated, falls back to
// a position-based subset of the static SIGHT_WORDS_EASY list.
export function useKnownSightWords(lessonKey, className) {
  return useQuery({
    queryKey: ['known-sight-words', lessonKey, className || null],
    queryFn: async () => {
      let target = null;

      // 0. If a class name is given, use the active PHONICS position from ClassConfig
      if (className) {
        try {
          const cfgRes = await base44.entities.ClassConfig.filter({ class_name: className }, { limit: 1 });
          const cfg = cfgRes.items?.[0];
          if (cfg && cfg.active_spanish_module && cfg.active_spanish_lesson) {
            target = {
              module_number: Number(cfg.active_spanish_module),
              curriculum_lesson_number: Number(cfg.active_spanish_lesson),
            };
          }
        } catch { /* fall back to lessonKey */ }
      }

      // 0b. Fall back to the reading lesson key if no phonics position
      if (!target) {
        target = parseCurriculumKey(lessonKey);
      }
      if (!target) return new Set();

      // 1. Try lesson-based sight words from literacy_progression
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

      // 2. Always merge the static progression list up to the target position.
      // Many lessons don't have literacy_progression.sightWords populated yet,
      // so the static list ensures students see age-appropriate highlights.
      const lessonIndex = (target.module_number - 1) * 15 + target.curriculum_lesson_number;
      const wordCount = Math.max(5, Math.ceil(lessonIndex * SIGHT_WORDS_EASY.length / TOTAL_CURRICULUM_LESSONS));
      SIGHT_WORDS_EASY.slice(0, wordCount).forEach(w => known.add(normalizeSpanish(w)));

      return known;
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!(lessonKey || className),
  });
}