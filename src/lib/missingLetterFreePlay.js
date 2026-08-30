// Generates Missing Letter items for free play by scanning the Letter Sort
// image bucket and filtering to words whose initial sound is one the student
// has already mastered in Letter Sounds mode.
//
// Vowel accents are stripped for matching (á→a) so a mastered 'a' matches
// words starting with 'á'. ñ is preserved as a distinct letter (not stripped
// to n) since it's a separate phoneme in the Spanish progression.

import { listAllImagesJpg } from '@/lib/lettersort/storage';

function stripVowelAccents(s) {
  return (s || '')
    .replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i')
    .replace(/ó/g, 'o').replace(/ú/g, 'u').replace(/ü/g, 'u');
}

export async function generateMissingLetterItems(masteredLetters, { bucket = 'lettersort-images', maxItems = 30 } = {}) {
  if (!masteredLetters || !masteredLetters.length) return [];
  const images = await listAllImagesJpg({ bucket });
  const masteredSet = new Set(masteredLetters.map(l => stripVowelAccents(l.toLowerCase())));
  const seen = new Set();
  const items = [];
  for (const img of images.sort(() => Math.random() - 0.5)) {
    if (!img.core) continue;
    const word = stripVowelAccents(img.core);
    if (seen.has(word)) continue;
    const init = stripVowelAccents(img.initial?.toLowerCase() || '');
    if (!masteredSet.has(init)) continue;
    seen.add(word);
    items.push({
      word,
      position: 'initial',
      image_source: 'upload',
      image_url: img.url,
    });
    if (items.length >= maxItems) break;
  }
  return items;
}