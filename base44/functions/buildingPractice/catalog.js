import { knownSightWordsAt, getIntroducedGraphemesThrough, canDecodeWord,
  pathwayPosition, decodableBookPool, hasIntroducedConsonant } from './curriculum.generated.js';
import { KINDS, normalize, validateConfig } from './model.js';

export function catalogFor(lesson, indexes = [], books = [], reviews = []) {
  let raw = {};
  if (lesson.building_practice_data) {
    try { raw = JSON.parse(lesson.building_practice_data); }
    catch { throw Error('The saved building targets are invalid. Review them in Building Practice Setup.'); }
  }
  const config = validateConfig(raw);
  const position = pathwayPosition(Number(lesson.lesson_number), 4);
  // Honor authored ranges rather than guessing introductions from book titles.
  const positions = (lesson.daily_lessons || []).filter(d => d.active !== false && d.steps?.length)
    .map(d => ({ moduleNumber: Number(d.module_number),
      lessonNumber: Number(d.curriculum_lesson_end || d.curriculum_lesson_number) }))
    .filter(p => Number.isInteger(p.moduleNumber) && p.moduleNumber >= 1 && p.moduleNumber <= 9 &&
      Number.isInteger(p.lessonNumber) && p.lessonNumber >= 1 && p.lessonNumber <= 20)
    .sort((a, b) => a.moduleNumber - b.moduleNumber || a.lessonNumber - b.lessonNumber);
  const through = positions.at(-1) || position;
  const pools = Object.fromEntries(KINDS.map(k => [k, []]));
  if (!through) return { config, pools, requiredKinds: [], position: null };
  const hfw = new Set(knownSightWordsAt(through).map(normalize));
  const graphemes = getIntroducedGraphemesThrough(through);
  const allowed = text => hfw.has(normalize(text)) || canDecodeWord(normalize(text).replace(/[¿?¡!.,]/g, ''), graphemes);
  const row = text => ({ text: normalize(text), imageUrl: '' });
  pools.sight_words = (config.sight_words.length ? config.sight_words : [...hfw].map(row))
    .filter(r => hfw.has(r.text));
  for (const [kind, bankKind] of [['syllables', 'syllables'], ['words', 'words']]) {
    const bank = decodableBookPool(indexes, through, { books, reviews, kind: bankKind, limit: 100 }).map(row);
    // An override can vet/order the bank, not reintroduce an excluded target.
    const allowedBank = new Set(bank.map(r => r.text));
    pools[kind] = hasIntroducedConsonant(through)
      ? (config[kind].length ? config[kind].filter(r => allowedBank.has(r.text)) : bank) : [];
  }
  pools.phrases = config.phrases.filter(r => r.text.split(' ').every(allowed));
  return { config, pools, requiredKinds: KINDS.filter(k => pools[k].length), position: through };
}
