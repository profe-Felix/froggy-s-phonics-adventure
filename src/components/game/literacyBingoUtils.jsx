import { LETTER_SOUNDS } from '@/components/data/letterSounds';
import { SIGHT_WORDS_EASY } from '@/components/data/sightWords';

// Letters that sound the same and should not both appear on one card
const SOUND_GROUPS = [
  ['c', 's', 'z'],
  ['c', 'k', 'q'],
  ['g', 'j'],
  ['y', 'll'],
];

function getConflicts(letter) {
  const conflicts = new Set();
  for (const group of SOUND_GROUPS) {
    if (group.includes(letter)) group.forEach(l => conflicts.add(l));
  }
  return conflicts;
}

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

  if (mode !== 'letter_sounds') return shuffled.slice(0, count);

  // Filter out same-sounding letters
  const selected = [];
  const blocked = new Set();
  for (const item of shuffled) {
    if (selected.length >= count) break;
    if (blocked.has(item)) continue;
    selected.push(item);
    getConflicts(item).forEach(c => blocked.add(c));
  }
  return selected;
}

export function getCardUnion(player1Number, player2Number, className, mode) {
  const card1 = buildCard(player1Number, className, mode);
  const card2 = buildCard(player2Number, className, mode);
  return [...new Set([...card1, ...card2])];
}

export function checkBingo(coveredSet, totalCells) {
  const cols = totalCells === 16 ? 4 : 3;
  for (let r = 0; r < cols; r++) {
    if (Array.from({ length: cols }, (_, c) => r * cols + c).every(i => coveredSet.has(i))) return true;
  }
  for (let c = 0; c < cols; c++) {
    if (Array.from({ length: cols }, (_, r) => r * cols + c).every(i => coveredSet.has(i))) return true;
  }
  if (Array.from({ length: cols }, (_, i) => i * cols + i).every(i => coveredSet.has(i))) return true;
  if (Array.from({ length: cols }, (_, i) => i * cols + (cols - 1 - i)).every(i => coveredSet.has(i))) return true;
  return false;
}

export function getPointsForAttempt(attempts) {
  if (attempts === 0) return 10;
  if (attempts === 1) return 5;
  if (attempts === 2) return 1;
  return 0;
}