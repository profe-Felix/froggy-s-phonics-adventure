// Build a sorted list of curriculum positions (M#.L#) from the grapheme chart,
// with the graphemes introduced at each position. Used by the Sound Wall
// manager dropdown and the Lesson Editor curriculum-position pickers.
import { ES_GRAPHEME_CHART } from './curriculumGraphemes';

export function getCurriculumPositionList() {
  return Object.keys(ES_GRAPHEME_CHART)
    .map((key) => {
      const match = key.match(/^M(\d+)\.L(\d+)$/);
      if (!match) return null;
      const moduleNumber = parseInt(match[1], 10);
      const lessonNumber = parseInt(match[2], 10);
      const graphemes = ES_GRAPHEME_CHART[key] || [];
      return { key, moduleNumber, lessonNumber, graphemes };
    })
    .filter(Boolean)
    .sort((a, b) => a.moduleNumber - b.moduleNumber || a.lessonNumber - b.lessonNumber);
}

export function getGraphemesAtKey(key) {
  return ES_GRAPHEME_CHART[key] || [];
}