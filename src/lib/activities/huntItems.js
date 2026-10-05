// Auto-populate "Caza en el texto" items from the WordBank and the lesson's
// sentence patterns when the teacher hasn't entered custom examples.
// Returns a mix of single words and sentences that contain the target letter.

import { base44 } from '@/api/base44Client';
import { splitLiteracyList } from '@/lib/literacy/lessonProgression';
import { stripDiacritics } from '@/lib/lettersort/phonics';

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function norm(s) { return stripDiacritics(s || '').toLowerCase(); }

function containsTarget(text, target) {
  if (!target) return true;
  return norm(text).includes(norm(target));
}

function startsWithTarget(text, target) {
  if (!target) return true;
  return norm(text).startsWith(norm(target));
}

// Build hunt items from the WordBank + sentence patterns.
// config: { huntType, huntTarget/target, lessonLiteracy }
export async function buildHuntItemsFromBank(config) {
  const huntType = config?.huntType || 'phoneme';
  const target = (config?.huntTarget || config?.target || '').trim();

  // Fetch WordBank words
  let bankWords = [];
  try {
    const records = await base44.entities.WordBank.list('-updated_date', 500);
    bankWords = records.filter((w) => w.active !== false).map((w) => w.word).filter(Boolean);
  } catch { /* best-effort */ }

  // Fetch NounGender for articles (el/la) so sentences are grammatical
  let genderMap = {};
  try {
    const genders = await base44.entities.NounGender.list('-updated_date', 500);
    for (const g of genders) {
      if (g.active !== false && g.word) genderMap[norm(g.word)] = g;
    }
  } catch { /* best-effort */ }

  // Filter words by hunt type
  const matching = bankWords.filter((w) =>
    huntType === 'word' ? startsWithTarget(w, target) : containsTarget(w, target)
  );
  if (matching.length === 0) return [];

  const shuffled = shuffle(matching);

  // Sentence patterns + picture words from the lesson's literacy progression
  const literacy = config?.lessonLiteracy || {};
  const patterns = splitLiteracyList(literacy.sentencePatterns);
  const pictureWords = splitLiteracyList(literacy.pictureWords);

  // Fill sentence patterns with picture words, keep only those containing the target
  const sentences = [];
  if (patterns.length > 0) {
    const fillers = pictureWords.length > 0 ? pictureWords : shuffled;
    for (const pattern of patterns.slice(0, 4)) {
      let filled = pattern;
      let attempts = 0;
      while (filled.includes('{picture}') && attempts < 6) {
        const pw = fillers[Math.floor(Math.random() * fillers.length)];
        filled = filled.replace('{picture}', pw);
        attempts++;
      }
      if (containsTarget(filled, target)) sentences.push(filled);
    }
  }

  // Fallback: build simple sentences from word bank NOUNS (words with a
  // NounGender entry) so article-based patterns are grammatical. Non-noun
  // words (verbs, adjectives) are only used as standalone word items.
  if (sentences.length === 0) {
    const nouns = shuffled.filter((w) => genderMap[norm(w)]);
    if (nouns.length > 0) {
      const simplePatterns = [
        (w, art) => `${art} ${w} come.`,
        (w, art) => `Veo ${art} ${w}.`,
        (w, art) => `Me gusta ${art} ${w}.`,
      ];
      for (const w of nouns.slice(0, 4)) {
        const g = genderMap[norm(w)];
        const art = g?.article || 'el';
        const fn = simplePatterns[Math.floor(Math.random() * simplePatterns.length)];
        const s = fn(w, art);
        if (containsTarget(s, target)) sentences.push(s);
      }
    }
  }

  // Mix: ~4 words + up to 2 sentences
  const wordItems = shuffled.slice(0, 4).map((w) => ({ text: w }));
  const sentenceItems = shuffle(sentences).slice(0, 2).map((s) => ({ text: s }));

  return shuffle([...wordItems, ...sentenceItems]);
}