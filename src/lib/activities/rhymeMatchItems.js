// Rhyme matching — image lookup + auto-generation.
//
// Teacher types word pairs: "gato, pato, cocodrilo" per line where
//   gato       = target (anchor image on the left)
//   pato       = correct rhyme answer
//   cocodrilo  = distractor (wrong option)
// Multiple distractors can be typed; the number of options shown scales with
// how many distractors the teacher provides.
//
// The app looks up an image for each word from the image library (NounGender
// first, then WordBank). If no image is found the word still shows as a text
// card so the activity never breaks.
//
// After the teacher-set rounds, students can replay with auto-generated rhyme
// pairs built from the image library: we group all imaged words by their
// Spanish rhyme ending and pick random pairs from the same group.

import { base44 } from '@/api/base44Client';
import { stripDiacritics } from '@/lib/lettersort/phonics';

function norm(s) {
  return stripDiacritics(s || '').toLowerCase().trim();
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Spanish rhyme ending: from the last vowel (inclusive) to the end.
// "gato" -> "ato", "pato" -> "ato" (match), "flor" -> "or", "tambor" -> "or".
function rhymeEnd(word) {
  const w = norm(word);
  const m = w.match(/[aeiou][^aeiou]*$/);
  return m ? m[0] : w;
}

// Parse the teacher's textarea into rhyme-match items.
// Each line: target, answer, distractor1, distractor2, ...
export function parseRhymeMatchItems(text) {
  const lines = String(text || '')
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  return lines
    .map((l) => {
      const parts = l.split(',').map((x) => x.trim()).filter(Boolean);
      if (parts.length < 2) return null;
      return {
        target: parts[0],
        answer: parts[1],
        distractors: parts.slice(2),
      };
    })
    .filter(Boolean);
}

// Serialize rhyme-match items back to textarea format.
export function serializeRhymeMatchItems(items) {
  return (items || [])
    .map((it) => [it.target, it.answer, ...(it.distractors || [])].join(', '))
    .join('\n');
}

// Cache the image library so repeated lookups during a session are fast.
let _imageCache = null;

async function loadImageLibrary() {
  if (_imageCache) return _imageCache;
  const map = new Map(); // norm(word) -> image_url
  try {
    const nouns = await base44.entities.NounGender.filter(
      { active: true, image_url: { $exists: true } },
      { limit: 500, fields: ['word', 'image_url'] }
    );
    for (const n of nouns.items || []) {
      if (n.word && n.image_url) map.set(norm(n.word), n.image_url);
    }
  } catch { /* best-effort */ }
  try {
    const bank = await base44.entities.WordBank.filter(
      { active: true, image_url: { $exists: true } },
      { limit: 500, fields: ['word', 'image_url'] }
    );
    for (const w of bank.items || []) {
      if (w.word && w.image_url && !map.has(norm(w.word))) {
        map.set(norm(w.word), w.image_url);
      }
    }
  } catch { /* best-effort */ }
  _imageCache = map;
  return map;
}

// Look up an image for a single word.
export async function lookupWordImage(word) {
  const lib = await loadImageLibrary();
  return lib.get(norm(word)) || '';
}

// Attach images to parsed items. Returns items ready for the student UI:
//   { target, answer, distractors: [{word, image}], targetImage, answerImage }
export async function resolveRhymeMatchItems(rawItems) {
  const lib = await loadImageLibrary();
  return rawItems.map((it) => ({
    target: it.target,
    answer: it.answer,
    targetImage: lib.get(norm(it.target)) || '',
    answerImage: lib.get(norm(it.answer)) || '',
    distractors: (it.distractors || []).map((d) => ({
      word: d,
      image: lib.get(norm(d)) || '',
    })),
  }));
}

// Auto-generate rhyme pairs from the image library for replay rounds.
// Returns up to `count` items, each with a target, a correct rhyme answer,
// and one distractor (a word from a different rhyme group).
export async function autoGenerateRhymeMatchItems(count = 5) {
  const lib = await loadImageLibrary();
  const words = shuffle([...lib.keys()]);
  // Group by rhyme ending.
  const groups = new Map(); // rhymeEnd -> [normWord, ...]
  for (const w of words) {
    const re = rhymeEnd(w);
    if (!groups.has(re)) groups.set(re, []);
    groups.get(re).push(w);
  }
  // Keep only groups with 2+ words (a target + at least one rhyme).
  const pairs = [...groups.values()].filter((g) => g.length >= 2);
  if (pairs.length === 0) return [];

  const items = [];
  const used = new Set();
  for (let i = 0; i < count && pairs.length > 0; i++) {
    const group = shuffle(pairs)[0];
    const [target, answer] = shuffle(group).slice(0, 2);
    if (used.has(target) || used.has(answer)) continue;
    used.add(target);
    used.add(answer);
    // Distractor: a random word from a different rhyme group.
    const distractorPool = words.filter(
      (w) => rhymeEnd(w) !== rhymeEnd(target) && !used.has(w)
    );
    const distractor = distractorPool.length > 0
      ? shuffle(distractorPool)[0]
      : '';
    items.push({
      target,
      answer,
      targetImage: lib.get(target) || '',
      answerImage: lib.get(answer) || '',
      distractors: distractor ? [{ word: distractor, image: lib.get(distractor) || '' }] : [],
    });
  }
  return items;
}