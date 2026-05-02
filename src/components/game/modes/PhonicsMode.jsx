import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const SUPABASE_LISTS_URL = 'https://dmlsiyyqpcupbizpxwhp.supabase.co/storage/v1/object/public/app-presets/slidetoread/lists.json';
const SUPABASE_AUDIO_BASE = 'https://dmlsiyyqpcupbizpxwhp.supabase.co/storage/v1/object/public/lettersort-audio';

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

// ── Syllabification ────────────────────────────────────────────────
const VOWEL_SET = new Set('aeiouáéíóúü');
function isVowelToken(t) { return t.length === 1 && VOWEL_SET.has(t); }

function syllabify(word) {
  const tokens = tokenize(word);
  // Group into syllables by nuclei
  // Simple nucleus-based split: each vowel (or diphthong pair) starts a new syllable
  const syllables = [];
  let current = [];
  const diphthongPairs = new Set(['ai','ia','au','ua','ei','ie','eu','ue','oi','io','ou','uo','ui','iu','ay','ey','oy','uy']);

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    current.push(t);
    const isV = isVowelToken(t);
    if (isV) {
      // Look ahead: if next token is a vowel and they form a diphthong, keep in same syllable
      const next = tokens[i + 1];
      if (next && isVowelToken(next) && diphthongPairs.has(t + next)) {
        current.push(next);
        i++;
      }
      // Look ahead for trailing consonants (coda)
      // Take consonants until we hit another vowel or end
      while (i + 1 < tokens.length && !isVowelToken(tokens[i + 1])) {
        // If next+1 is also consonant, only take first (onset of next syllable)
        if (i + 2 < tokens.length && !isVowelToken(tokens[i + 2])) {
          current.push(tokens[i + 1]);
          i++;
        }
        break;
      }
      syllables.push(current.join(''));
      current = [];
    }
  }
  if (current.length > 0) {
    if (syllables.length > 0) syllables[syllables.length - 1] += current.join('');
    else syllables.push(current.join(''));
  }
  return syllables.length > 0 ? syllables : [word];
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
};

// Syllable confusions: given a syllable, what are confusable syllable options?
function getSyllableConfusions(syllable) {
  const nucleus = [...syllable].find(c => VOWEL_SET.has(c)) || '';
  // Map of onset confusions
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
  const confusions = onsetMap[syllable] || [];
  // Also generate all CV combos with same vowel and confused consonants
  const tokens = tokenize(syllable);
  const onsetTokens = tokens.filter(t => !isVowelToken(t));
  const onset = onsetTokens.join('');
  const confused = CONFUSION_MAP[onset] || [];
  const extraSyllables = confused.map(c => c + nucleus).filter(s => s !== syllable);
  const all = [...new Set([...confusions, ...extraSyllables])];
  return all.slice(0, 5);
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
  const distractors = all.slice(0, 3);
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
  const confused = getSyllableConfusions(missingSyllable).filter(s => s !== missingSyllable);
  const position = idx === 0 ? 'initial' : idx === syllables.length - 1 ? 'final' : 'medial';

  // Pad to 4 options with vowel+consonant combos
  const vowels = 'aeiou';
  const consonants = 'bcdfghjklmnpqrstvyz'.split('');
  while (confused.length < 3) {
    const r = consonants[Math.floor(Math.random() * consonants.length)] +
              vowels[Math.floor(Math.random() * vowels.length)];
    if (r !== missingSyllable && !confused.includes(r)) confused.push(r);
  }

  const options = [missingSyllable, ...confused.slice(0, 3)].sort(() => Math.random() - 0.5);

  return { type: 'syllable', display, missingToken: missingSyllable, syllables, missingIdx: idx, position, options };
}

// ── Main Component ─────────────────────────────────────────────────
export default function PhonicsMode({ studentData, onBack }) {
  const [words, setWords] = useState([]);
  const [wordsLoaded, setWordsLoaded] = useState(false);
  const [subMode, setSubMode] = useState('letter'); // 'letter' | 'syllable'
  const [currentWord, setCurrentWord] = useState(null);
  const [cloze, setCloze] = useState(null);
  const [selected, setSelected] = useState(null);
  const [isCorrect, setIsCorrect] = useState(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
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
        const filtered = [...new Set(all)].filter(w => w.length >= 2);
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
    if (correct) { setScore(s => s + 1); setStreak(s => s + 1); }
    else setStreak(0);
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
          <div className="grid grid-cols-2 gap-3">
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