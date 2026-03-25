import { LETTER_SOUNDS } from '@/components/data/letterSounds';
import { SIGHT_WORDS_EASY } from '@/components/data/sightWords';

export function getItemList(mode) {
  if (mode === 'letter_sounds') return LETTER_SOUNDS;
  if (mode === 'sight_words_easy') return SIGHT_WORDS_EASY;
  return [];
}

function shuffle(arr, seed) {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = ((s ^ (s << 13)) ^ (s >> 7) ^ (s << 17)) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildCard(playerNumber, className, mode) {
  const items = getItemList(mode);
  const classSeed = (className || '').split('').reduce((a, c, i) => a + c.charCodeAt(0) * (i + 7), 0);
  const seed = ((playerNumber || 1) * 999983 + classSeed * 31337 + 1234567) >>> 0;
  const shuffled = shuffle(items, seed);
  const count = mode === 'letter_sounds' ? 16 : 9;
  return shuffled.slice(0, count);
}

export function getCardUnion(player1Number, player2Number, className, mode) {
  const card1 = buildCard(player1Number, className, mode);
  const card2 = buildCard(player2Number, className, mode);
  return [...new Set([...card1, ...card2])];
}