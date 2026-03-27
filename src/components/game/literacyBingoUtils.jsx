import { LETTER_SOUNDS } from '@/components/data/letterSounds';
import { SIGHT_WORDS_EASY } from '@/components/data/sightWords';

// Letters that should NOT appear together on the same card (same/identical sounds)
const SOUND_GROUPS = [
  new Set(['c', 's', 'z']),
  new Set(['c', 'k', 'q']),
  new Set(['g', 'j']),
  new Set(['y', 'll']),
];

function conflictsWithSelected(letter, selectedSoFar) {
  // Returns true if 'letter' shares a sound group with any already-selected letter
  for (const group of SOUND_GROUPS) {
    if (!group.has(letter)) continue;
    for (const sel of selectedSoFar) {
      if (group.has(sel)) return true;
    }
  }
  return false;
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

  // Filter out same-sounding letters — no two letters from the same sound group on one card
  const selected = [];
  for (const item of shuffled) {
    if (selected.length >= count) break;
    if (!conflictsWithSelected(item, selected)) {
      selected.push(item);
    }
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