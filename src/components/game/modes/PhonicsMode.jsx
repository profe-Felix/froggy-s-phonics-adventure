import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { base44 } from '@/api/base44Client';

const SUPABASE_LISTS_URL = 'https://dmlsiyyqpcupbizpxwhp.supabase.co/storage/v1/object/public/app-presets/slidetoread/lists.json';
const SUPABASE_AUDIO_BASE = 'https://dmlsiyyqpcupbizpxwhp.supabase.co/storage/v1/object/public/lettersort-audio';

// Spanish vowels and consonants for distractors
const SPANISH_LETTERS = 'abcdefghijklmnopqrstuvwxyzáéíóúüñ'.split('');

// Spanish syllabification: count syllable nuclei (vowel groups)
function countSyllables(word) {
  const clean = word.toLowerCase().replace(/[^a-záéíóúüñ]/g, '');
  const vowels = /[aeiouáéíóúü]/g;
  const matches = clean.match(vowels);
  if (!matches) return 1;
  // Simple heuristic: consecutive vowels that form diphthongs count as one
  let count = 0;
  let prevWasVowel = false;
  const diphthongPairs = new Set(['ai','ia','au','ua','ei','ie','eu','ue','oi','io','ou','uo','ui','iu','ay','ey','oy','uy']);
  const vowelSet = new Set('aeiouáéíóúü');
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    const isV = vowelSet.has(ch);
    if (isV) {
      if (!prevWasVowel) {
        count++;
      } else {
        // Check if this forms a diphthong with previous vowel
        const pair = clean[i-1] + ch;
        if (!diphthongPairs.has(pair)) count++; // hiatus
      }
    }
    prevWasVowel = isV;
  }
  return Math.max(1, count);
}

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

/**
 * Build a cloze challenge for a word.
 * Returns { display, missingLetter, position: 'initial'|'final'|'medial', distractors }
 * 
 * - 3+ syllables: initial or final sound only
 * - 2 syllables: random position
 * - 1 syllable: initial or final
 */
function buildCloze(word) {
  const letters = word.split('');
  const syllables = countSyllables(word);
  
  let position;
  if (syllables >= 3) {
    position = Math.random() < 0.5 ? 'initial' : 'final';
  } else {
    const positions = ['initial', 'final', 'medial'];
    position = positions[Math.floor(Math.random() * (syllables === 1 ? 2 : 3))];
  }

  let missingIdx;
  if (position === 'initial') missingIdx = 0;
  else if (position === 'final') missingIdx = letters.length - 1;
  else {
    // Medial: pick a middle letter that isn't a vowel if possible
    const vowelSet = new Set('aeiouáéíóúü');
    const middles = letters.map((l, i) => i).filter(i => i > 0 && i < letters.length - 1);
    const consonantMiddles = middles.filter(i => !vowelSet.has(letters[i]));
    const pool = consonantMiddles.length > 0 ? consonantMiddles : middles;
    missingIdx = pool[Math.floor(Math.random() * pool.length)];
  }

  const missingLetter = letters[missingIdx];
  const display = letters.map((l, i) => i === missingIdx ? '_' : l).join('');

  // Build distractors: phonetically similar Spanish letters
  const similarLetters = {
    'b': ['v', 'd', 'p'], 'v': ['b', 'd', 'f'], 'd': ['b', 't', 'n'],
    'c': ['k', 's', 'z'], 'k': ['c', 'q', 'g'], 'q': ['c', 'k'],
    's': ['z', 'c', 'x'], 'z': ['s', 'c'], 'x': ['s', 'j'],
    'g': ['j', 'h', 'k'], 'j': ['g', 'h', 'y'], 'h': ['j', 'g'],
    'l': ['r', 'n', 'll'], 'll': ['y', 'l'], 'y': ['ll', 'i'],
    'r': ['l', 'rr', 'n'], 'n': ['m', 'ñ', 'l'], 'ñ': ['n', 'ny'],
    'm': ['n', 'b', 'p'], 'p': ['b', 'm', 'f'], 'f': ['p', 'v'],
    't': ['d', 'c', 'p'], 'ch': ['sh', 'c', 'y'],
  };

  const simil = (similarLetters[missingLetter] || []).filter(l => l !== missingLetter && !letters.includes(l));
  const extra = SPANISH_LETTERS.filter(l => l !== missingLetter && !letters.includes(l) && !simil.includes(l))
    .sort(() => Math.random() - 0.5);

  const distractors = [...simil, ...extra].slice(0, 3);
  const options = [missingLetter, ...distractors].sort(() => Math.random() - 0.5);

  return { display, missingLetter, position, missingIdx, options };
}

export default function PhonicsMode({ studentData, onBack }) {
  const [words, setWords] = useState([]);
  const [wordsLoaded, setWordsLoaded] = useState(false);
  const [currentWord, setCurrentWord] = useState(null);
  const [cloze, setCloze] = useState(null);
  const [selected, setSelected] = useState(null);
  const [isCorrect, setIsCorrect] = useState(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [locked, setLocked] = useState(false);
  const audioRef = useRef(null);
  const lastWordRef = useRef(null);

  // Load words from both Palabras and Palabras 💙 lists
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
        // Filter: only words with 2+ letters
        const filtered = [...new Set(all)].filter(w => w.length >= 2);
        setWords(filtered);
      } catch {
        setWords([]);
      }
      setWordsLoaded(true);
    };
    load();
  }, []);

  const playWord = async (word) => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.onended = null; }
    const url = await findAudioUrl(word);
    if (!url) return;
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.play().catch(() => {});
  };

  const nextRound = async (wordList = words) => {
    if (!wordList.length) return;
    setSelected(null);
    setIsCorrect(null);
    setLocked(false);

    // Try up to 15 words to find one with audio
    const shuffled = [...wordList].sort(() => Math.random() - 0.5);
    for (const word of shuffled.slice(0, 15)) {
      if (word === lastWordRef.current) continue;
      const url = await findAudioUrl(word);
      if (!url) continue;
      lastWordRef.current = word;
      setCurrentWord(word);
      const c = buildCloze(word);
      setCloze(c);
      // Play audio
      if (audioRef.current) { audioRef.current.pause(); }
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.play().catch(() => {});
      return;
    }
  };

  useEffect(() => {
    if (wordsLoaded && words.length > 0) nextRound(words);
  }, [wordsLoaded]);

  const handleSelect = (letter) => {
    if (locked || selected !== null) return;
    const correct = letter === cloze.missingLetter;
    setSelected(letter);
    setIsCorrect(correct);
    setLocked(true);
    if (correct) {
      setScore(s => s + 1);
      setStreak(s => s + 1);
    } else {
      setStreak(0);
    }
  };

  const positionLabel = cloze?.position === 'initial' ? '🔵 Initial sound' :
    cloze?.position === 'final' ? '🔴 Final sound' : '🟡 Middle sound';

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

      {currentWord && cloze && (
        <div className="w-full max-w-lg flex flex-col gap-4">
          {/* Word display */}
          <div className="bg-white/95 rounded-3xl shadow-xl p-6 flex flex-col items-center gap-4">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">{positionLabel}</span>

            {/* Big word with blank */}
            <div className="flex items-center gap-1 text-5xl font-black text-gray-800 tracking-widest">
              {currentWord.split('').map((l, i) => (
                <span key={i}
                  className={i === cloze.missingIdx
                    ? `border-b-4 ${isCorrect === null ? 'border-cyan-400 text-transparent' : isCorrect ? 'border-green-500 text-green-600' : 'border-red-400 text-red-500'} min-w-[2rem] text-center`
                    : 'text-gray-800'}>
                  {i === cloze.missingIdx
                    ? (isCorrect !== null ? cloze.missingLetter : '_')
                    : l}
                </span>
              ))}
            </div>

            {/* Play audio button */}
            <button
              onClick={() => playWord(currentWord)}
              className="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white text-3xl shadow-lg hover:scale-110 active:scale-95 transition-all"
            >
              🔊
            </button>
            <p className="text-sm text-gray-500 font-bold">Tap 🔊 to hear the word, then pick the missing sound!</p>
          </div>

          {/* Answer options */}
          <div className="grid grid-cols-2 gap-3">
            {cloze.options.map((letter) => {
              const isSelected = selected === letter;
              const isRight = letter === cloze.missingLetter;
              let btnClass = 'bg-white border-2 border-gray-200 text-gray-800 hover:border-cyan-400 hover:bg-cyan-50';
              if (locked) {
                if (isRight) btnClass = 'bg-green-100 border-2 border-green-500 text-green-700 shadow-lg';
                else if (isSelected && !isRight) btnClass = 'bg-red-100 border-2 border-red-400 text-red-700';
                else btnClass = 'bg-white border-2 border-gray-200 text-gray-400 opacity-50';
              }
              return (
                <motion.button
                  key={letter}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleSelect(letter)}
                  className={`rounded-2xl p-5 text-4xl font-black shadow transition-all ${btnClass}`}
                  disabled={locked}
                >
                  {letter}
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
                  <p className="font-black text-lg">{isCorrect ? '¡Correcto! 🎉' : `Era "${cloze.missingLetter}" 😅`}</p>
                  <p className="text-sm font-bold text-gray-600">{currentWord}</p>
                </div>
                <button
                  onClick={() => nextRound(words)}
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