import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import PrizeWheel from '@/components/game/PrizeWheel';

const SUPABASE_LISTS_URL = 'https://dmlsiyyqpcupbizpxwhp.supabase.co/storage/v1/object/public/app-presets/slidetoread/lists.json';
const SUPABASE_AUDIO_BASE = 'https://dmlsiyyqpcupbizpxwhp.supabase.co/storage/v1/object/public/lettersort-audio';

// ── Spanish homophones to exclude from phonics cloze ──────────────
// These words sound identical to another word, so hearing alone can't
// determine the correct spelling — they need sentence context.
const HOMOPHONES = new Set([
  // b/v homophones
  'vaca','baca','vino','bino','vello','bello','vaya','baya','vota','bota',
  'tubo','tuvo','cavo','cabo','rebelar','revelar','bienes','vienes',
  'votar','botar','volar','bolar','varón','barón','vault','bault',
  // h homophones (silent h)
  'hola','ola','hasta','asta','hoya','oya','hora','ora','honda','onda',
  'horca','orca','habría','abría','hecho','echo','hay','ay','ha','a',
  'he','e','ah','a','oh','o',
  // ll/y homophones (yeísmo)
  'halla','haya','valla','vaya','pollo','poyo','malla','maya','sello','seyo',
  'callo','cayo','rollo','royo','lloro','yoro','llama','yama',
  // s/z/c homophones (seseo)
  'caza','casa','cocer','coser','cede','sede','cierra','sierra',
  'abrasar','abrazar','cauce','cause','tasa','taza','poso','pozo',
  // g/j homophones
  'gira','jira','giro','jiro',
  // other common pairs
  'mas','más','si','sí','te','té','tu','tú','el','él','se','sé','de','dé',
  'mi','mí','aun','aún',
]);

// ── Audio helpers ──────────────────────────────────────────────────
function toAudioName(word) {
  return word
    .replace(/á/g, 'a..').replace(/é/g, 'e..').replace(/í/g, 'i..')
    .replace(/ó/g, 'o..').replace(/ú/g, 'u..')
    .replace(/ü/g, 'u,,').replace(/ñ/g, 'n..');
}
async function findAudioUrl(word) {
  const audioName = toAudioName(word);
  for (const ext of ['mp3', 'wav']) {
    try {
      const url = `${SUPABASE_AUDIO_BASE}/${encodeURIComponent(audioName)}.${ext}`;
      const res = await fetch(url, { method: 'HEAD' });
      if (res.ok) return url;
    } catch { /* try next */ }
  }
  return null;
}

// ── Digraph / token splitting ──────────────────────────────────────
// Spanish digraphs that act as single phonemes
const DIGRAPHS = ['ch', 'qu', 'gu', 'gü', 'll', 'rr', 'güe', 'güi', 'gue', 'gui'];

/**
 * Split a word into phonemic tokens (digraphs first, then single chars).
 * e.g. "chivo" → ["ch","i","v","o"]
 *      "guerra" → ["gu","e","rr","a"]
 */
function tokenize(word) {
  const w = word.toLowerCase();
  const tokens = [];
  let i = 0;
  while (i < w.length) {
    // Try longest digraph first
    let found = false;
    for (const dg of ['güe','güi','gue','gui','ch','qu','gu','gü','ll','rr']) {
      if (w.startsWith(dg, i)) {
        tokens.push(dg);
        i += dg.length;
        found = true;
        break;
      }
    }
    if (!found) { tokens.push(w[i]); i++; }
  }
  return tokens;
}

function tokenizeForSyllables(word) {
  const w = word.toLowerCase();
  const tokens = [];
  let i = 0;

  while (i < w.length) {
    const two = w.slice(i, i + 2);

    // Keep true Spanish digraph consonants together.
    // Do NOT merge gue/gui/güe/güi here because syllabication needs to see the vowel.
    if (['ch', 'll', 'rr'].includes(two)) {
      tokens.push(two);
      i += 2;
      continue;
    }

    tokens.push(w[i]);
    i += 1;
  }

  return tokens;
}

// ── Syllabification ────────────────────────────────────────────────
const VOWEL_SET = new Set('aeiouáéíóúü');
// Stressed weak vowels break diphthongs (á/é/ó are always strong)
const STRONG_VOWELS = new Set('aeoáéó');
const WEAK_VOWELS = new Set('iuüíú');
function isVowelToken(t) { return t.length === 1 && VOWEL_SET.has(t); }

/**
 * Returns true if two adjacent vowel tokens form a diphthong (stay in same syllable).
 * Rules: strong+weak or weak+strong → diphthong UNLESS weak has accent (becomes strong).
 * Two strong vowels → hiatus (separate syllables).
 * Two weak vowels → diphthong.
 * Accented weak vowel (í, ú) → acts as strong → hiatus.
 */
function formsDiphthong(v1, v2) {
  const s1 = STRONG_VOWELS.has(v1), w1 = WEAK_VOWELS.has(v1);
  const s2 = STRONG_VOWELS.has(v2), w2 = WEAK_VOWELS.has(v2);
  // accented weak = strong (í ú already in STRONG via áéó set? No — handle explicitly)
  const accentedWeak = new Set('íú');
  if (accentedWeak.has(v1) || accentedWeak.has(v2)) return false; // hiatus
  if (w1 && w2) return true;       // ui, iu → diphthong
  if (s1 && s2) return false;       // ae, eo etc → hiatus
  return true;                       // strong+weak or weak+strong → diphthong
}

/**
 * Unbreakable onset clusters (consonant + consonant that must start next syllable together).
 * Based on LDC/RAE rules:
 *   stop/f + liquid: pr br tr dr cr gr fr pl bl cl gl fl
 *   tl (Mexican Spanish)
 * These are checked on PHONEME tokens (after digraph splitting).
 */
const UNBREAKABLE_ONSET_PAIRS = new Set([
  'pr','br','tr','dr','cr','gr','fr',
  'pl','bl','cl','gl','fl',
  'tl', // Mexican Spanish
]);

function isConsonantToken(t) { return !isVowelToken(t); }

/**
 * Proper Spanish syllabification following RAE/LDC rules.
 *
 * Algorithm operates on phoneme tokens (digraphs already merged).
 * Steps:
 *  1. Split tokens into nuclei (vowels, handling diphthongs/triphthongs).
 *  2. Distribute inter-nucleus consonants:
 *     - 1 consonant → onset of next syllable
 *     - 2 consonants: if they form unbreakable onset (pr,bl,cl,etc.) → both go to next syllable
 *                     otherwise → first is coda of prev, second is onset of next
 *     - 3 consonants: if last 2 form unbreakable onset → first is coda, last 2 are onset
 *                     if first 2 are ns/bs → first 2 are coda, last is onset
 *                     otherwise → first 2 are coda, last is onset
 */
function syllabify(word) {
  const tokens = tokenizeForSyllables(word.toLowerCase());

  // Step 1: find nuclei positions (vowels, merging diphthongs)
  // Build list of nucleus groups with their token indices
  const nuclei = []; // [{indices: [i, j, ...]}]
  let i = 0;
  while (i < tokens.length) {
    if (!isVowelToken(tokens[i])) { i++; continue; }
    // Start a nucleus
    const nucTokens = [i];
    // Check for diphthong/triphthong
    if (i + 1 < tokens.length && isVowelToken(tokens[i + 1])) {
      if (formsDiphthong(tokens[i], tokens[i + 1])) {
        nucTokens.push(i + 1);
        // Triphthong: weak+strong+weak
        if (i + 2 < tokens.length && isVowelToken(tokens[i + 2]) && WEAK_VOWELS.has(tokens[i + 2])) {
          nucTokens.push(i + 2);
        }
      }
    }
    nuclei.push(nucTokens);
    i = nucTokens[nucTokens.length - 1] + 1;
  }

  if (nuclei.length === 0) return [word]; // no vowels

  // Step 2: build syllable token-index ranges
  // Each syllable = [onset consonants] + [nucleus] + [coda consonants]
  const syllableRanges = []; // [{start, end}] inclusive token indices

  for (let n = 0; n < nuclei.length; n++) {
    const nucStart = nuclei[n][0];
    const nucEnd = nuclei[n][nuclei[n].length - 1];
    const prevNucEnd = n === 0 ? -1 : nuclei[n - 1][nuclei[n - 1].length - 1];
    const nextNucStart = n === nuclei.length - 1 ? tokens.length : nuclei[n + 1][0];

    // Consonants before this nucleus (after previous nucleus)
    const prevConsonants = [];
    for (let k = prevNucEnd + 1; k < nucStart; k++) prevConsonants.push(k);

    // Consonants after this nucleus (before next nucleus)
    const nextConsonants = [];
    for (let k = nucEnd + 1; k < nextNucStart; k++) nextConsonants.push(k);

    // Determine how many of prevConsonants belong to THIS syllable's onset
    // vs the PREVIOUS syllable's coda (already handled when we built prev syllable)
    // We handle distribution when assigning coda to prev syllable below.

    // For now, store nucleus range; we'll assemble after distributing consonants
    syllableRanges.push({ nucStart, nucEnd, nextConsonants });
  }

  // Distribute consonant clusters between nuclei into coda/onset
  // Result: for each nucleus, onsetExtra = extra consonants taken from prev cluster
  const syllables = [];
  let pendingOnset = []; // token indices that belong to onset of current nucleus

  // Pre-word consonants (before first vowel)
  const preWord = [];
  for (let k = 0; k < nuclei[0][0]; k++) preWord.push(k);

  for (let n = 0; n < nuclei.length; n++) {
    const { nucStart, nucEnd, nextConsonants } = syllableRanges[n];

    // My onset = pendingOnset (distributed from previous cluster)
    const myOnset = [...pendingOnset];
    if (n === 0) myOnset.unshift(...preWord);
    pendingOnset = [];

    // My nucleus
    const myNucleus = nuclei[n];

    // Distribute nextConsonants into coda (mine) and onset (next syllable)
    const nc = nextConsonants.length;
    let myCoda = [];
    let nextOnset = [];

    if (nc === 0) {
      // nothing
    } else if (nc === 1) {
      // Single consonant → onset of next syllable
      if (n < nuclei.length - 1) nextOnset = [nextConsonants[0]];
      else myCoda = [nextConsonants[0]]; // word-final
    } else if (nc === 2) {
      const c1 = tokens[nextConsonants[0]];
      const c2 = tokens[nextConsonants[1]];
      const pair = c1 + c2;
      if (UNBREAKABLE_ONSET_PAIRS.has(pair) && n < nuclei.length - 1) {
        // Both go to next onset: e.g. chi-cle, a-bri-go
        nextOnset = [nextConsonants[0], nextConsonants[1]];
      } else {
        // Split: first is coda, second is onset
        myCoda = [nextConsonants[0]];
        if (n < nuclei.length - 1) nextOnset = [nextConsonants[1]];
        else myCoda.push(nextConsonants[1]);
      }
    } else if (nc >= 3) {
      const c1 = tokens[nextConsonants[0]];
      const c2 = tokens[nextConsonants[1]];
      const c3 = tokens[nextConsonants[2]];
      const last2 = c2 + c3;
      const first2 = c1 + c2;
      if (UNBREAKABLE_ONSET_PAIRS.has(last2) && n < nuclei.length - 1) {
        // e.g. em-ple-a: first is coda, last 2 are onset
        myCoda = [nextConsonants[0]];
        nextOnset = nextConsonants.slice(1);
      } else if (first2 === 'ns' || first2 === 'bs') {
        // e.g. cons-ti: first 2 are coda, rest are onset
        myCoda = [nextConsonants[0], nextConsonants[1]];
        if (n < nuclei.length - 1) nextOnset = nextConsonants.slice(2);
        else myCoda.push(...nextConsonants.slice(2));
      } else {
        // Default: first 2 coda, last onset
        myCoda = nextConsonants.slice(0, nc - 1);
        if (n < nuclei.length - 1) nextOnset = [nextConsonants[nc - 1]];
        else myCoda.push(nextConsonants[nc - 1]);
      }
    }

    pendingOnset = nextOnset;

    // Build syllable string from token indices
    const allIdx = [...myOnset, ...myNucleus, ...myCoda].sort((a, b) => a - b);
    syllables.push(allIdx.map(idx => tokens[idx]).join(''));
  }

  // Append any trailing consonants to last syllable
  if (pendingOnset.length > 0) {
    syllables[syllables.length - 1] += pendingOnset.map(idx => tokens[idx]).join('');
  }

  return syllables.filter(s => s.length > 0).length > 0
    ? syllables.filter(s => s.length > 0)
    : [word];
}

// ── Confusion map: what letters/digraphs confuse Spanish learners ──
const CONFUSION_MAP = {
  'b': ['v', 'd', 'p'],
  'v': ['b', 'f', 'd'],
  'd': ['b', 't', 'n', 'p'],
  'p': ['b', 'q', 't', 'f'],
  'q': ['p', 'b', 'c', 'k'],
  'c': ['k', 'qu', 's', 'z'],
  'k': ['c', 'qu', 'g'],
  'qu': ['c', 'k', 'cu', 'q'],
  'g': ['j', 'gu', 'h', 'k'],
  'gu': ['g', 'gü', 'j', 'hu'],
  'gü': ['gu', 'g', 'j'],
  'gue': ['ge', 'je', 'güe', 'que'],
  'gui': ['gi', 'ji', 'güi', 'qui'],
  'güe': ['gue', 'ge', 'je'],
  'güi': ['gui', 'gi', 'ji'],
  'j': ['g', 'h', 'y', 'x'],
  'h': ['j', 'ch', 'g'],
  'ch': ['h', 'c', 'y', 'sh'],
  'll': ['y', 'l', 'li'],
  'y': ['ll', 'i', 'hi'],
  'n': ['m', 'ñ', 'l'],
  'ñ': ['n', 'ni', 'ny'],
  'm': ['n', 'b', 'p'],
  's': ['z', 'c', 'x'],
  'z': ['s', 'c', 'x'],
  'x': ['s', 'j', 'ks'],
  'r': ['l', 'rr', 'n'],
  'rr': ['r', 'l'],
  'l': ['r', 'll', 'n'],
  't': ['d', 'c', 'p'],
  'f': ['p', 'v', 'b'],
  // Vowel confusions
  'i': ['y', 'e', 'u', 'o', 'a'],
  'e': ['i', 'a', 'o', 'u', 'y'],
  'a': ['e', 'o', 'i', 'u'],
  'o': ['u', 'a', 'e', 'i'],
  'u': ['o', 'i', 'a', 'e'],
};

// Syllable confusions: given a syllable, what are confusable syllable options?
function getSyllableConfusions(syllable) {
  const unique = (arr) => [...new Set(arr.filter(Boolean).filter(x => x !== syllable))];
  const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);

  const tokens = tokenize(syllable);
  const vowelIdx = tokens.findIndex(t => isVowelToken(t));
  const nucleus = vowelIdx >= 0 ? tokens[vowelIdx] : '';
  const onset = vowelIdx >= 0 ? tokens.slice(0, vowelIdx).join('') : '';
  const coda = vowelIdx >= 0 ? tokens.slice(vowelIdx + 1).join('') : '';

  const candidates = [];

  // Blend syllables like cre, cla, bra, plo, etc.
  const blendGroups = {
    cr: ['cl', 'gr', 'tr', 'br', 'pr', 'kr'],
    cl: ['cr', 'gl', 'pl', 'bl', 'fl'],
    br: ['bl', 'pr', 'gr', 'cr'],
    bl: ['br', 'pl', 'cl', 'fl'],
    pr: ['pl', 'br', 'tr', 'cr'],
    pl: ['pr', 'bl', 'cl', 'fl'],
    tr: ['dr', 'cr', 'pr', 'br'],
    dr: ['tr', 'gr', 'br'],
    gr: ['gl', 'cr', 'br', 'dr'],
    gl: ['gr', 'cl', 'bl'],
    fr: ['fl', 'pr', 'br'],
    fl: ['fr', 'pl', 'bl', 'cl'],
  };

  if (blendGroups[onset]) {
    // Same vowel, different/confusable blends: cre → cle, gre, tre
    blendGroups[onset].forEach(b => candidates.push(b + nucleus + coda));

    // Same blend, different vowels: cre → cra, cri, cro, cru
    ['a', 'e', 'i', 'o', 'u'].forEach(v => {
      if (v !== nucleus) candidates.push(onset + v + coda);
    });

    // Tricky Spanish-looking reversals: cre → cer
    if (!coda && onset.length === 2) {
      candidates.push(onset[0] + nucleus + onset[1]);
      candidates.push(onset[1] + nucleus);
    }
  }

  // Closed syllables like mas, con, sol, pan
  if (coda) {
    // Same onset/coda, different vowel: mas → mes, mis, mos, mus
    ['a', 'e', 'i', 'o', 'u'].forEach(v => {
      if (v !== nucleus) candidates.push(onset + v + coda);
    });

    // Same vowel/coda, different onset: mas → pas, las, nas, bas
    const onsetConfusions = CONFUSION_MAP[onset] || [];
    onsetConfusions.forEach(o => candidates.push(o + nucleus + coda));

    // Same onset/vowel, different final consonant: mas → mal, man, mar
    ['s', 'n', 'l', 'r', 'd', 'z'].forEach(final => {
      if (final !== coda) candidates.push(onset + nucleus + final);
    });
  }

  // Existing special Spanish confusion map
  const onsetMap = {
    'ca': ['ka','ke','ce','co','cu','qui'], 'co': ['ca','ko','que'], 'cu': ['qu','ku'],
    'ce': ['se','ze','ke','ca'], 'ci': ['si','zi','ki'],
    'ke': ['ce','se','ca'], 'ki': ['ci','si'],
    'ga': ['ja','ha'], 'go': ['jo'], 'gu_': ['ju'],
    'ge': ['je','güe','gue'], 'gi': ['ji','güi','gui'],
    'gue': ['ge','je','güe'], 'gui': ['gi','ji','güi'],
    'güe': ['gue','ge','je'], 'güi': ['gui','gi','ji'],
    'que': ['ce','ke','ge'], 'qui': ['ci','ki','gi'],
    'ja': ['ga','ha','ya'], 'je': ['ge','güe','he'], 'ji': ['gi','güi','hi'],
    'jo': ['go','ho'], 'ju': ['gu'],
    'ha': ['ja','a'], 'he': ['e','je'], 'hi': ['i','ji'], 'ho': ['o','jo'],
    'cha': ['ca','ya','sha'], 'che': ['ce','je'], 'chi': ['ci','ji'],
    'cho': ['co','jo'], 'chu': ['cu','ju'],
    'lla': ['ya','la'], 'lle': ['ye','le'], 'lli': ['yi','li'],
    'llo': ['yo','lo'], 'llu': ['yu','lu'],
    'ya': ['lla','ia'], 'ye': ['lle','ie'], 'yo': ['llo'], 'yu': ['llu'],
    'ba': ['va','da'], 'be': ['ve','de'], 'bi': ['vi','di'],
    'va': ['ba','fa'], 've': ['be','fe'], 'vi': ['bi','fi'],
    'pa': ['ba','ta'], 'pe': ['be','te'], 'pi': ['bi','ti'],
    'ta': ['da','pa'], 'te': ['de','pe'], 'ti': ['di','pi'],
    'na': ['ma','ña'], 'ne': ['me','ñe'], 'ni': ['mi','ñi'],
    'ña': ['na','nya'], 'ñe': ['ne','nie'], 'ño': ['no'],
  };

  candidates.push(...(onsetMap[syllable] || []));

  // CV fallback only after better options
  const confused = CONFUSION_MAP[onset] || [];
  confused.forEach(c => candidates.push(c + nucleus + coda));

  return unique(shuffle(candidates));
}

// ── Build LETTER cloze ─────────────────────────────────────────────
function buildLetterCloze(word) {
  const tokens = tokenize(word);
  const syllables = syllabify(word);
  const numSyl = syllables.length;

  // Pick position: initial or final preferred for long words
  let position;
  if (numSyl >= 3) position = Math.random() < 0.5 ? 'initial' : 'final';
  else {
    const opts = ['initial', 'final'];
    if (numSyl === 2) opts.push('medial');
    position = opts[Math.floor(Math.random() * opts.length)];
  }

  let missingTokenIdx;
  if (position === 'initial') missingTokenIdx = 0;
  else if (position === 'final') missingTokenIdx = tokens.length - 1;
  else {
    // Medial: prefer consonant tokens
    const middles = tokens.map((t, i) => i).filter(i => i > 0 && i < tokens.length - 1);
    const consonantMiddles = middles.filter(i => !isVowelToken(tokens[i]));
    const pool = consonantMiddles.length > 0 ? consonantMiddles : middles;
    missingTokenIdx = pool[Math.floor(Math.random() * pool.length)];
  }

  const missingToken = tokens[missingTokenIdx];

  // Build display: replace the missing token span with underscores
  // Find character range for this token in original word
  let charStart = 0;
  for (let i = 0; i < missingTokenIdx; i++) charStart += tokens[i].length;
  const charEnd = charStart + missingToken.length;
  const blank = '_'.repeat(missingToken.length);
  const display = word.substring(0, charStart) + blank + word.substring(charEnd);

  // Build distractors
  const confused = (CONFUSION_MAP[missingToken] || []).filter(l => l !== missingToken);
  // Add some random single letters as fallback
  const fallback = 'bcdfghjklmnpqrstvxyz'.split('').filter(l => l !== missingToken && !confused.includes(l));
  const all = [...confused, ...fallback.sort(() => Math.random() - 0.5)];
  const distractors = all.slice(0, 7);
  const options = [missingToken, ...distractors].sort(() => Math.random() - 0.5);

  return { type: 'letter', display, missingToken, missingTokenIdx, tokens, charStart, charEnd, position, options };
}

// ── Build SYLLABLE cloze ───────────────────────────────────────────
function buildSyllableCloze(word) {
  const syllables = syllabify(word);
  if (syllables.length < 2) return null; // need 2+ syllables

  // Pick a syllable to remove
  const idx = Math.floor(Math.random() * syllables.length);
  const missingSyllable = syllables[idx];

  const before = syllables.slice(0, idx).join('');
  const after = syllables.slice(idx + 1).join('');
  const blank = '_'.repeat(missingSyllable.length);
  const display = before + blank + after;

  // Build syllable confusions
  const siblingSyllables = syllables.filter((s, i) => i !== idx && s !== missingSyllable);
  const confused = [
    ...new Set([
      ...siblingSyllables,
      ...getSyllableConfusions(missingSyllable)
    ].filter(s => s !== missingSyllable))
  ];
  const position = idx === 0 ? 'initial' : idx === syllables.length - 1 ? 'final' : 'medial';

  // Determine if the missing syllable is vowel-only (e.g. "i", "a", "e")
  const isVowelOnly = [...missingSyllable].every(c => VOWEL_SET.has(c));

  if (isVowelOnly) {
    // For pure-vowel syllables, confuse with: other vowels, y, hi, and ll+vowel combos
    const otherVowels = ['a','e','i','o','u'].filter(v => v !== missingSyllable);
    const yVariants = ['y', 'hi', 'li', 'yi', 'ya', 'ye', 'yo'].filter(s => s !== missingSyllable);
    const llVariants = ['lla','lle','lli','llo','llu'].filter(s => s !== missingSyllable);
    const pool = [...otherVowels, ...yVariants, ...llVariants];
    while (confused.length < 7) {
      const pick = pool[Math.floor(Math.random() * pool.length)];
      if (pick && !confused.includes(pick) && pick !== missingSyllable) confused.push(pick);
      if (confused.length >= pool.length) break;
    }
  } else {
    // Pad to 5 distractors with CV combos
    const vowels = 'aeiou';
    const consonants = 'bcdfghjklmnpqrstvyz'.split('');
    while (confused.length < 7) {
      const r = consonants[Math.floor(Math.random() * consonants.length)] +
                vowels[Math.floor(Math.random() * vowels.length)];
      if (r !== missingSyllable && !confused.includes(r)) confused.push(r);
    }
  }

  const options = [...new Set([missingSyllable, ...confused])]
    .slice(0, 8)
    .sort(() => Math.random() - 0.5);

  return { type: 'syllable', display, missingToken: missingSyllable, syllables, missingIdx: idx, position, options };
}

const PTS_PER_STICKER = 100;
const PHONICS_CORRECT_PER_POINT = 5;

function RouletteProgressMini({ totalPts, syllableCorrectCount }) {
  const progress = totalPts % PTS_PER_STICKER;
  const pct = (progress / PTS_PER_STICKER) * 100;

  return (
    <div className="w-full max-w-lg bg-white/90 rounded-2xl shadow border-2 border-rose-200 px-4 py-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-black text-rose-600 uppercase">🎡 Prize Wheel Progress</span>
        <span className="text-xs font-bold text-purple-600">
          Syllables: {syllableCorrectCount}/{PHONICS_CORRECT_PER_POINT} = +1 pt
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-4 rounded-full bg-rose-100 overflow-hidden border border-rose-200">
          <div
            className="h-full bg-gradient-to-r from-rose-400 to-pink-400 rounded-full transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-sm font-black text-rose-700 whitespace-nowrap">
          {progress}/{PTS_PER_STICKER}
        </span>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────
export default function PhonicsMode({ studentData, onBack, onStudentPatch }) {
  const [words, setWords] = useState([]);
  const [wordsLoaded, setWordsLoaded] = useState(false);
  const [subMode, setSubMode] = useState('letter'); // 'letter' | 'syllable'
  const [currentWord, setCurrentWord] = useState(null);
  const [cloze, setCloze] = useState(null);
  const [selected, setSelected] = useState(null);
  const [isCorrect, setIsCorrect] = useState(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [syllableCorrectCount, setSyllableCorrectCount] = useState(0);
  const [totalPts, setTotalPts] = useState(() => studentData?.sentences_total_points || 0);
  const [showWheel, setShowWheel] = useState(false);
  const [redeemedPrizes, setRedeemedPrizes] = useState(() => studentData?.redeemed_prizes || []);
  const [claimedSpins, setClaimedSpins] = useState(() => studentData?.sentence_prize_spins_claimed || 0);
  const [locked, setLocked] = useState(false);
  const audioRef = useRef(null);
  const lastWordRef = useRef(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(SUPABASE_LISTS_URL);
        const data = await res.json();
        const all = [];
        for (const key of ['Palabras', 'Palabras 💙']) {
          const group = data[key] || {};
          Object.values(group).forEach(mod => {
            if (Array.isArray(mod?.new)) all.push(...mod.new);
          });
        }
        const filtered = [...new Set(all)].filter(w => w.length >= 2 && !HOMOPHONES.has(w.toLowerCase()));
        setWords(filtered);
      } catch { setWords([]); }
      setWordsLoaded(true);
    };
    load();
  }, []);

  const playWord = async (word) => {
    if (audioRef.current) { audioRef.current.pause(); }
    const url = await findAudioUrl(word);
    if (!url) return;
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.play().catch(() => {});
  };

  const nextRound = async (wordList = words, mode = subMode) => {
    if (!wordList.length) return;
    setSelected(null);
    setIsCorrect(null);
    setLocked(false);

    const shuffled = [...wordList].sort(() => Math.random() - 0.5);
    for (const word of shuffled.slice(0, 20)) {
      if (word === lastWordRef.current) continue;
      // For syllable mode, require 2+ syllables
      if (mode === 'syllable' && syllabify(word).length < 2) continue;
      const url = await findAudioUrl(word);
      if (!url) continue;
      lastWordRef.current = word;
      setCurrentWord(word);
      const c = mode === 'syllable' ? (buildSyllableCloze(word) || buildLetterCloze(word)) : buildLetterCloze(word);
      setCloze(c);
      if (audioRef.current) audioRef.current.pause();
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.play().catch(() => {});
      return;
    }
  };

  useEffect(() => {
    if (wordsLoaded && words.length > 0) nextRound(words, subMode);
  }, [wordsLoaded]);

  // When subMode changes, start a new round
  const handleSubModeChange = (mode) => {
    setSubMode(mode);
    setSelected(null);
    setIsCorrect(null);
    setLocked(false);
    nextRound(words, mode);
  };

  const handleSelect = (option) => {
    if (locked) return;

    const correct = option === cloze.missingToken;
    setSelected(option);
    setIsCorrect(correct);
    setLocked(true);

    if (correct) {
      setScore(s => s + 1);
      setStreak(s => s + 1);

      if (subMode === 'syllable' && cloze?.type === 'syllable') {
        setSyllableCorrectCount(prev => {
          const next = prev + 1;

          if (next >= PHONICS_CORRECT_PER_POINT) {
            setTotalPts(prevTotal => {
              const newTotal = prevTotal + 1;

              const availableSpins =
                Math.floor(newTotal / PTS_PER_STICKER) - claimedSpins;

              if (availableSpins > 0) {
                setShowWheel(true);
              }

              if (studentData?.id) {
                const patch = { sentences_total_points: newTotal };
                onStudentPatch?.(patch);
                base44.entities.Student.update(studentData.id, patch).catch(() => {});
              }

              return newTotal;
            });

            return 0;
          }
          return next;
        });
      }
    } else {
      setStreak(0);
    }
  };
  const handleClaimPrize = (prize) => {
    setShowWheel(false);

    const nextClaimedSpins = claimedSpins + 1;
    setClaimedSpins(nextClaimedSpins);

    const prizeEntry = {
      id: prize.id,
      label: prize.label,
      emoji: prize.emoji,
      source: 'phonics',
      claimed_at: new Date().toISOString(),
    };

    const updatedPrizeHistory = [
      ...(studentData?.prize_history || []),
      prizeEntry,
    ];

    let updatedRedeemedPrizes = redeemedPrizes;
    if (prize.oneTime && !redeemedPrizes.includes(prize.id)) {
      updatedRedeemedPrizes = [...redeemedPrizes, prize.id];
      setRedeemedPrizes(updatedRedeemedPrizes);
    }

    if (studentData?.id) {
      const patch = {
        sentence_prize_spins_claimed: nextClaimedSpins,
        prize_history: updatedPrizeHistory,
        redeemed_prizes: updatedRedeemedPrizes,
      };

      onStudentPatch?.(patch);
      base44.entities.Student.update(studentData.id, patch).catch(() => {});
    }
  };

  const handleCloseWheel = () => {
    setShowWheel(false);

    const earnedSpins = Math.floor(totalPts / PTS_PER_STICKER);
    const availableSpins = earnedSpins - claimedSpins;

    if (availableSpins > 0) {
      const nextClaimedSpins = claimedSpins + 1;
      setClaimedSpins(nextClaimedSpins);

      if (studentData?.id) {
        const patch = { sentence_prize_spins_claimed: nextClaimedSpins };
        onStudentPatch?.(patch);
        base44.entities.Student.update(studentData.id, patch).catch(() => {});
      }
    }
  };
  const positionLabel = cloze?.position === 'initial' ? '🔵 Initial' :
    cloze?.position === 'final' ? '🔴 Final' : '🟡 Middle';

  const modeLabel = cloze?.type === 'syllable' ? 'Syllable' : 'Sound';

  if (!wordsLoaded) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-cyan-300 to-blue-200 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-cyan-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-cyan-300 via-blue-200 to-white flex flex-col items-center p-4 gap-4">
      {/* Header */}
      <div className="w-full max-w-lg flex items-center gap-3">
        {onBack && (
          <button onClick={onBack}
            className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-bold bg-white/90 text-gray-700 border border-gray-300 hover:bg-white shadow">
            ← Back
          </button>
        )}
        <div className="flex-1 flex items-center gap-3 bg-white/90 rounded-xl px-4 py-2 shadow">
          <span className="text-xl">🎧</span>
          <span className="font-black text-cyan-700 text-lg">Phonics Cloze</span>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm font-bold text-yellow-600">🔥 {streak}</span>
            <span className="text-sm font-bold text-blue-700">⭐ {score}</span>
          </div>
        </div>
      </div>
      {subMode === 'syllable' && (
        <RouletteProgressMini
          totalPts={totalPts}
          syllableCorrectCount={syllableCorrectCount}
        />
      )}

      <AnimatePresence>
        {showWheel && (
          <PrizeWheel
            key={`phonics-wheel-${totalPts}`}
            redeemedPrizes={redeemedPrizes}
            onClaim={handleClaimPrize}
            onClose={handleCloseWheel}
          />
        )}
      </AnimatePresence>
      {/* Sub-mode toggle */}
      <div className="flex gap-2 bg-white/90 rounded-xl p-1 shadow">
        <button
          onClick={() => handleSubModeChange('letter')}
          className={`px-4 py-2 rounded-lg font-black text-sm transition-all ${subMode === 'letter' ? 'bg-cyan-500 text-white shadow' : 'text-gray-500 hover:bg-gray-100'}`}
        >
          🔤 Letter Sound
        </button>
        <button
          onClick={() => handleSubModeChange('syllable')}
          className={`px-4 py-2 rounded-lg font-black text-sm transition-all ${subMode === 'syllable' ? 'bg-purple-500 text-white shadow' : 'text-gray-500 hover:bg-gray-100'}`}
        >
          📚 Syllable
        </button>
      </div>

      {currentWord && cloze && (
        <div className="w-full max-w-lg flex flex-col gap-4">
          {/* Word display */}
          <div className="bg-white/95 rounded-3xl shadow-xl p-6 flex flex-col items-center gap-4">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">
              {positionLabel} {modeLabel}
            </span>

            {/* Big word with blank */}
            <div className="flex items-center justify-center flex-wrap gap-0.5 text-5xl font-black text-gray-800 tracking-widest">
              {cloze.type === 'syllable' ? (
                // Show syllable-level display
                cloze.syllables.map((syl, i) => (
                  <span key={i}
                    className={i === cloze.missingIdx
                      ? `border-b-4 min-w-[2.5rem] text-center ${isCorrect === null ? 'border-purple-400 text-transparent' : isCorrect ? 'border-green-500 text-green-600' : 'border-red-400 text-red-500'}`
                      : 'text-gray-800'}>
                    {i === cloze.missingIdx ? (isCorrect !== null ? cloze.missingToken : '_'.repeat(cloze.missingToken.length)) : syl}
                  </span>
                ))
              ) : (
                // Show character-level display with digraph awareness
                (() => {
                  const parts = [];
                  const { tokens, missingTokenIdx, missingToken } = cloze;
                  tokens.forEach((tok, i) => {
                    if (i === missingTokenIdx) {
                      parts.push(
                        <span key={i}
                          className={`border-b-4 min-w-[2rem] text-center ${isCorrect === null ? 'border-cyan-400 text-transparent' : isCorrect ? 'border-green-500 text-green-600' : 'border-red-400 text-red-500'}`}>
                          {isCorrect !== null ? missingToken : '_'.repeat(missingToken.length)}
                        </span>
                      );
                    } else {
                      parts.push(<span key={i}>{tok}</span>);
                    }
                  });
                  return parts;
                })()
              )}
            </div>

            {/* Play audio button */}
            <button
              onClick={() => playWord(currentWord)}
              className="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white text-3xl shadow-lg hover:scale-110 active:scale-95 transition-all"
            >
              🔊
            </button>
            <p className="text-sm text-gray-500 font-bold text-center">
              Tap 🔊 to hear the word, then pick the missing {cloze.type === 'syllable' ? 'syllable' : 'sound'}!
            </p>
          </div>

          {/* Answer options */}
          <div className="grid grid-cols-4 gap-3">
            {cloze.options.map((option) => {
              const isSelected = selected === option;
              const isRight = option === cloze.missingToken;
              let btnClass = 'bg-white border-2 border-gray-200 text-gray-800 hover:border-cyan-400 hover:bg-cyan-50';
              if (locked) {
                if (isRight) btnClass = 'bg-green-100 border-2 border-green-500 text-green-700 shadow-lg';
                else if (isSelected && !isRight) btnClass = 'bg-red-100 border-2 border-red-400 text-red-700';
                else btnClass = 'bg-white border-2 border-gray-200 text-gray-400 opacity-50';
              }
              return (
                <motion.button
                  key={option}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleSelect(option)}
                  className={`rounded-2xl p-5 text-4xl font-black shadow transition-all ${btnClass}`}
                  disabled={locked}
                >
                  {option}
                  {locked && isRight && <span className="text-lg ml-2">✓</span>}
                  {locked && isSelected && !isRight && <span className="text-lg ml-2">✗</span>}
                </motion.button>
              );
            })}
          </div>

          {/* Feedback + Next */}
          <AnimatePresence>
            {locked && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`rounded-2xl p-4 flex items-center justify-between shadow-lg ${isCorrect ? 'bg-green-100 border-2 border-green-400' : 'bg-red-50 border-2 border-red-300'}`}
              >
                <div>
                  <p className="font-black text-lg">{isCorrect ? '¡Correcto! 🎉' : `Era "${cloze.missingToken}" 😅`}</p>
                  <p className="text-sm font-bold text-gray-600">{currentWord}</p>
                </div>
                <button
                  onClick={() => nextRound(words, subMode)}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-black shadow hover:opacity-90 active:scale-95"
                >
                  Siguiente →
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {wordsLoaded && words.length === 0 && (
        <div className="bg-white rounded-2xl p-6 text-center shadow">
          <p className="text-red-500 font-bold">No words found. Check word lists in Supabase.</p>
        </div>
      )}
    </div>
  );
}