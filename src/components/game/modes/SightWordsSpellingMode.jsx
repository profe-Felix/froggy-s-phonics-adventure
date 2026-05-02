import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import EmojiPrizeCelebration, { countNewEmojis, getEmojiForIndex, POINTS_PER_EMOJI } from '../EmojiPrizeCelebration';
import EmojiCollection from '../EmojiCollection';
import GameCanvas from '../GameCanvas';
import SpellingBuildArea, { countCorrectLetters } from '../SpellingBuildArea';
import SpellingWriteStep from '../SpellingWriteStep';
import { base44 } from '@/api/base44Client';

const SUPABASE_LISTS_URL = 'https://dmlsiyyqpcupbizpxwhp.supabase.co/storage/v1/object/public/app-presets/slidetoread/lists.json';
let SIGHT_WORDS_BY_MODULE = {};

// Only 'spell' and 'unscramble' — no missing-letter
const CHALLENGE_TYPES = ['spell', 'cloze', 'spell', 'cloze'];
const DISTRACTOR_LETTERS = 'abcdefghijklmnopqrstuvwxyzáéíóúüñ'.split('');

function pickWord(modeData, lastWord, moduleWords) {
  if (!moduleWords || !Array.isArray(moduleWords) || moduleWords.length === 0) return null;
  const learning = (modeData.learning_items?.length > 0 ? modeData.learning_items : []).filter(w => moduleWords.includes(w));
  const attempts = modeData.item_attempts || {};
  const pool = learning.length > 1 ? learning.filter(w => w !== lastWord) : learning;
  if (pool.length === 0) {
    const choices = moduleWords.length > 1
      ? moduleWords.filter(w => w !== lastWord)
      : moduleWords;

    return choices[Math.floor(Math.random() * choices.length)];
  }
  const weights = pool.map(w => { const s = attempts[w] || { correct: 0, total: 0 }; return Math.max(1, 6 - s.correct); });
  const total = weights.reduce((a, b) => a + b, 0);
  let rand = Math.random() * total;
  for (let i = 0; i < pool.length; i++) { rand -= weights[i]; if (rand <= 0) return pool[i]; }
  return pool[pool.length - 1];
}

export default function SightWordsSpellingMode({ studentData, onUpdateProgress, onBack }) {
  const [selectedModule, setSelectedModule] = useState(1);
  const [modules, setModules] = useState([]);
  const [phase, setPhase] = useState('write'); // 'write' | 'build'
  const [currentWord, setCurrentWord] = useState(null);
  const [options, setOptions] = useState([]);
  const [builtWord, setBuiltWord] = useState([]);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [usedIndices, setUsedIndices] = useState([]);
  const [pointsEarned, setPointsEarned] = useState(0);
  const [bonusPoints, setBonusPoints] = useState(0);
  const [challengeType, setChallengeType] = useState('spell');
  const [roundCount, setRoundCount] = useState(0);
  const [clozeIndices, setClozeIndices] = useState([]);
  const [wordsLoaded, setWordsLoaded] = useState(false);
  const [roundLoading, setRoundLoading] = useState(false);
  const [emojiPrize, setEmojiPrize] = useState(null);
  const [showEmojiCollection, setShowEmojiCollection] = useState(false);
  const [activeEmojiIdx, setActiveEmojiIdx] = useState(() => {
    const saved = localStorage.getItem('sightspell_active_emoji_idx');
    return saved !== null ? parseInt(saved) : 0;
  });
  const [spellingEmojiPts, setSpellingEmojiPts] = useState(() => studentData?.spelling_total_points || 0);
  const [spellingTotalPts, setSpellingTotalPts] = useState(() => studentData?.spelling_total_points || 0);
  const [isRetry, setIsRetry] = useState(false);
  const [streakBonusToday, setStreakBonusToday] = useState(() => {
    try { return JSON.parse(localStorage.getItem('spelling_streak_bonus') || '{}'); } catch { return {}; }
  });
  const todayKey = new Date().toISOString().slice(0, 10);
  const lastWordRef = useRef(null);
  const audioRef = useRef(null);
  const submittingRef = useRef(false);
  const clozeIndicesRef = useRef([]);

  const modeData = studentData?.mode_progress?.sight_words_spelling || {
    mastered_items: [], learning_items: ['el', 'la', 'un', 'una', 'en'],
    item_attempts: {}, total_correct: 0, total_attempts: 0
  };

  const SUPABASE_AUDIO_BASE = 'https://dmlsiyyqpcupbizpxwhp.supabase.co/storage/v1/object/public/lettersort-audio';

  function toAudioName(word) {
    return word
      .replace(/á/g, 'a..').replace(/é/g, 'e..').replace(/í/g, 'i..')
      .replace(/ó/g, 'o..').replace(/ú/g, 'u..')
      .replace(/Á/g, 'A..').replace(/É/g, 'E..').replace(/Í/g, 'I..')
      .replace(/Ó/g, 'O..').replace(/Ú/g, 'U..')
      .replace(/ü/g, 'u,,').replace(/Ü/g, 'U,,')
      .replace(/ñ/g, 'n..').replace(/Ñ/g, 'N..');
  }

  const playSound = (word) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
    }

    const audioName = toAudioName(word);

    const candidates = [
      `${SUPABASE_AUDIO_BASE}/${encodeURIComponent(audioName)}.mp3`,
      `${SUPABASE_AUDIO_BASE}/${encodeURIComponent(audioName)}.wav`,
    ];

    let i = 0;

    const tryNext = () => {
      if (i >= candidates.length) {
        base44.entities.AudioFeedback.create({
          mode: 'sight_words_spelling',
          item_text: word,
          feedback_type: 'missing_audio',
          student_number: studentData?.student_number || null,
          class_name: studentData?.class_name || null,
          reported_date: new Date().toISOString(),
        }).catch(() => {});
        return;
      }

      const audio = new Audio(candidates[i++]);
      audioRef.current = audio;
      audio.onerror = tryNext;
      audio.play().catch(tryNext);
    };

    tryNext();
  };

  const handleUnclearAudio = async () => {
    await base44.entities.AudioFeedback.create({
      mode: 'sight_words_spelling',
      item_text: currentWord,
      feedback_type: 'unclear_audio',
      student_number: studentData?.student_number || null,
      class_name: studentData?.class_name || null,
      reported_date: new Date().toISOString(),
    }).catch(() => {});
  };

  const buildOptions = (word, type) => {
    const wordLetters = word.split('');

    // CLOZE MODE — random positions (1 or 2 letters depending on word length)
    if (type === 'cloze') {
      const numMissing = wordLetters.length >= 4 ? 2 : 1;
      const allIndices = wordLetters.map((_, k) => k);
      // Shuffle and take numMissing, then sort ascending so display order matches position
      const indices = allIndices
        .sort(() => Math.random() - 0.5)
        .slice(0, numMissing)
        .sort((a, b) => a - b);
      setClozeIndices(indices);
      clozeIndicesRef.current = indices; // keep ref in sync for handleSubmit
      const missingLetters = indices.map(i => wordLetters[i]);

      const distractors = DISTRACTOR_LETTERS
        .filter(l => !wordLetters.includes(l))
        .sort(() => Math.random() - 0.5)
        .slice(0, 4);

      return [...missingLetters, ...distractors]
        .sort(() => Math.random() - 0.5)
        .map((letter, idx) => ({ letter, id: `opt-${idx}-${Math.random().toString(36).slice(2)}` }));
    }
    setClozeIndices([]);
    clozeIndicesRef.current = [];

    // SPELL MODE — include every letter the word needs (preserving duplicates)
    const neededLetters = [...wordLetters];

    // Add distractors (letters NOT in word at all)
    const wordLetterSet = new Set(wordLetters);
    const distractors = DISTRACTOR_LETTERS
      .filter(l => !wordLetterSet.has(l))
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.max(2, 6 - wordLetterSet.size));

    return [...neededLetters, ...distractors]
      .sort(() => Math.random() - 0.5)
      .map((letter, idx) => ({ letter, id: `opt-${idx}-${Math.random().toString(36).slice(2)}` }));
  };

  const findAudioUrl = async (word) => {
    const audioName = toAudioName(word);
    const candidates = [
      `${SUPABASE_AUDIO_BASE}/${encodeURIComponent(audioName)}.mp3`,
      `${SUPABASE_AUDIO_BASE}/${encodeURIComponent(audioName)}.wav`,
    ];
    for (const url of candidates) {
      try {
        const res = await fetch(url, { method: 'HEAD' });
        if (res.ok) return url;
      } catch { /* try next */ }
    }
    return null;
  };

  const startRound = async (nextRoundCount, mod = selectedModule) => {
    if (!wordsLoaded) return;
    const moduleWords = SIGHT_WORDS_BY_MODULE[mod] || [];
    if (moduleWords.length === 0) return;
    
    const rc = nextRoundCount ?? roundCount;
    setRoundLoading(true);

    // Try up to all words to find one with audio
    for (let attempt = 0; attempt < Math.min(moduleWords.length, 30); attempt++) {
      const word = pickWord(modeData, lastWordRef.current, moduleWords);
      if (!word) break;

      const audioUrl = await findAudioUrl(word);
      if (!audioUrl) {
        lastWordRef.current = word; // skip it
        continue;
      }

      lastWordRef.current = word;
      const type = CHALLENGE_TYPES[rc % CHALLENGE_TYPES.length];
      setChallengeType(type);
      setCurrentWord(word);
      setOptions(buildOptions(word, type));
      setBuiltWord([]);
      setUsedIndices([]);
      setShowResult(false);
      setPointsEarned(0);
      setBonusPoints(0);
      setPhase('write');
      setIsRetry(false);
      submittingRef.current = false;
      setRoundLoading(false);
      playSound(word);
      return;
    }
    setRoundLoading(false);
  };

  useEffect(() => {
    const loadWords = async () => {
      try {
        const res = await fetch(SUPABASE_LISTS_URL);
        const data = await res.json();
        const palabrasObj = data["Palabras 💙"] || {};
        const normalized = {};

        Object.entries(palabrasObj).forEach(([key, moduleObj]) => {
          const num = parseInt(String(key).replace(/\D/g, ''), 10);
          const words = moduleObj?.new || [];

          if (!Number.isNaN(num) && Array.isArray(words)) {
            normalized[num] = words;
          }
        });

        SIGHT_WORDS_BY_MODULE = normalized;
        const moduleNums = Object.keys(normalized)
          .map(k => parseInt(k, 10))
          .filter(n => !isNaN(n))
          .sort((a, b) => a - b);
        setModules(moduleNums);
        if (moduleNums.length > 0) {
          setSelectedModule(moduleNums[0]);
        }
        setWordsLoaded(true);
      } catch (e) {
        console.error('Failed to load word lists:', e);
        setWordsLoaded(true);
      }
    };
    loadWords();
  }, []);

  useEffect(() => {
    if (wordsLoaded) {
      startRound(0, selectedModule).catch(() => {});
    }
  }, [wordsLoaded, selectedModule]);

  const handleWriteDone = async (strokes) => {
    setPhase('build');
    if (studentData) {
      base44.entities.SpellingWritingSample.create({
        student_number: studentData.student_number,
        class_name: studentData.class_name,
        mode: 'sight_words_spelling',
        word: currentWord,
        strokes_data: JSON.stringify(strokes),
        was_correct: null,
      }).catch(() => {});
    }
  };

  const handleLetterClick = (letterObj) => {
    if (showResult || usedIndices.includes(letterObj.id)) return;
    setBuiltWord(prev => [...prev, letterObj.letter]);
    setUsedIndices(prev => [...prev, letterObj.id]);
  };

  const handleUndo = () => { if (showResult) return; setBuiltWord(p => p.slice(0, -1)); setUsedIndices(p => p.slice(0, -1)); };
  const handleClear = () => { if (showResult) return; setBuiltWord([]); setUsedIndices([]); };

  const handleModuleSelect = (mod) => {
    setSelectedModule(mod);
    setRoundCount(0);
  };

  const handleNext = () => {
    const next = roundCount + 1;
    setRoundCount(next);
    startRound(next, selectedModule).catch(() => {});
  };

  const saveProgress = async (correct, retry = false) => {
    const attempts = { ...modeData.item_attempts };
    const wordStats = attempts[currentWord] || { correct: 0, total: 0 };
    wordStats.total += 1;
    if (correct && !retry) wordStats.correct += 1;
    attempts[currentWord] = wordStats;

    let updatedMastered = [...(modeData.mastered_items || [])];
    let updatedLearning = [...(modeData.learning_items || [])];

    if (correct && wordStats.correct >= 3 && wordStats.correct / wordStats.total >= 0.60 && !updatedMastered.includes(currentWord)) {
      updatedMastered.push(currentWord);
      updatedLearning = updatedLearning.filter(w => w !== currentWord);
      const moduleWords = SIGHT_WORDS_BY_MODULE[selectedModule] || [];
      const allKnown = new Set([...updatedMastered, ...updatedLearning]);
      // Expand pool — keep up to 15 learning words
      if (updatedLearning.length < 15) {
        const next = moduleWords.find(w => !allKnown.has(w));
        if (next) updatedLearning.push(next);
      }
    }
    // Seed pool if too small
    if (updatedLearning.length < 6) {
      const moduleWords = SIGHT_WORDS_BY_MODULE[selectedModule] || [];
      const allKnown = new Set([...updatedMastered, ...updatedLearning]);
      moduleWords.filter(w => !allKnown.has(w)).slice(0, 6 - updatedLearning.length).forEach(w => updatedLearning.push(w));
    }

    await onUpdateProgress('sight_words_spelling', {
      mastered_items: updatedMastered, learning_items: updatedLearning, item_attempts: attempts,
      total_correct: (modeData.total_correct || 0) + (correct ? 1 : 0),
      total_attempts: (modeData.total_attempts || 0) + 1, unlocked: true
    });
  };

  const handleSubmit = async () => {
    if (submittingRef.current || showResult) return;
    submittingRef.current = true;

    const wordLetters = currentWord.split('');

    // For cloze: check only the missing-letter slots (in position order)
    let correct;
    if (challengeType === 'cloze') {
      const expectedMissing = clozeIndicesRef.current.map(i => wordLetters[i]);
      correct = builtWord.length === expectedMissing.length &&
        builtWord.every((l, i) => l === expectedMissing[i]);
    } else {
      correct = builtWord.join('') === currentWord;
    }

    // Partial points: (correctLetters / wordLength) * module, floored. Retry = half.
    const targetLetters = challengeType === 'cloze'
      ? clozeIndicesRef.current.map(i => wordLetters[i])
      : wordLetters;
    const correctLetterCount = builtWord.filter((l, i) => l === (targetLetters[i] ?? null)).length;
    const rawPts = Math.floor((correctLetterCount / targetLetters.length) * selectedModule);
    const basePts = isRetry ? Math.floor(rawPts / 2) : rawPts;

    // Streak bonus only on first-attempt correct
    const newStreak = correct && !isRetry ? streak + 1 : (correct ? streak : 0);
    const bonusKey10 = `sightspell_10_${todayKey}`;
    const bonusKey20 = `sightspell_20_${todayKey}`;
    let bonusPts = 0;
    const updatedBonusToday = { ...streakBonusToday };
    if (correct && !isRetry && newStreak === 10 && !updatedBonusToday[bonusKey10]) {
      bonusPts += 10;
      updatedBonusToday[bonusKey10] = true;
    }
    if (correct && !isRetry && newStreak === 20 && !updatedBonusToday[bonusKey20]) {
      bonusPts += 10;
      updatedBonusToday[bonusKey20] = true;
    }
    if (bonusPts > 0) {
      setStreakBonusToday(updatedBonusToday);
      localStorage.setItem('spelling_streak_bonus', JSON.stringify(updatedBonusToday));
    }

    const pts = basePts + bonusPts;
    setIsCorrect(correct);
    setShowResult(true);
    setPointsEarned(pts);
    setBonusPoints(bonusPts);
    // Trophy score: only first-attempt correct
    if (correct && !isRetry) setScore(s => s + pts);
    setStreak(newStreak);

    // Emoji pts separate from trophy
    const oldEmojiPts = spellingEmojiPts;
    const newEmojiPts = oldEmojiPts + pts;
    setSpellingEmojiPts(newEmojiPts);
    setSpellingTotalPts(t => t + pts);
    const newEmojis = countNewEmojis(oldEmojiPts, newEmojiPts);
    if (newEmojis > 0) {
      const idx = Math.floor(newEmojiPts / POINTS_PER_EMOJI) - 1;
      setEmojiPrize(getEmojiForIndex(idx));
    }

    await saveProgress(correct, isRetry);
  };

  if (!wordsLoaded || roundLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-300 via-sky-200 to-green-200 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-sky-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!currentWord) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-300 via-sky-200 to-green-200 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-xl p-6 text-center max-w-md">
          <p className="text-xl font-black text-red-600 mb-2">No sight words loaded</p>
          <p className="text-gray-600 font-bold">
            Check lists.json → Palabras 💙 → M{selectedModule} → new.
          </p>
        </div>
      </div>
    );
  }

  const challengeLabel =
    challengeType === 'cloze'
      ? '🧩 Fill in the missing letters!'
      : '✏️ Spell the word!';

  const ptsToNextEmoji = POINTS_PER_EMOJI - (spellingEmojiPts % POINTS_PER_EMOJI);
  const totalEmojiCount = Math.floor(spellingEmojiPts / POINTS_PER_EMOJI);
  const displayEmojiIdx = Math.min(activeEmojiIdx, Math.max(0, totalEmojiCount - 1));

  const handleSelectEmoji = (idx) => {
    setActiveEmojiIdx(idx);
    localStorage.setItem('sightspell_active_emoji_idx', String(idx));
    setShowEmojiCollection(false);
  };

  if (phase === 'write') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-300 via-sky-200 to-green-200 flex flex-col items-center p-4 gap-4">
        {/* Back + prize bar row */}
        <div className="w-full max-w-lg flex items-center gap-2">
          {onBack && (
            <button onClick={onBack}
              className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-bold bg-white/90 text-gray-700 border border-gray-300 hover:bg-white shadow">
              ← Back
            </button>
          )}
          <button onClick={() => setShowEmojiCollection(true)} className="flex-1 bg-white/90 rounded-xl px-3 py-2 flex items-center gap-2 shadow hover:bg-white active:scale-95 transition-all">
            <span className="text-xl">{totalEmojiCount > 0 ? getEmojiForIndex(displayEmojiIdx) : '🎯'}</span>
            <div className="flex-1 h-2.5 bg-purple-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-purple-400 to-pink-400 rounded-full transition-all"
                style={{ width: `${((spellingEmojiPts % POINTS_PER_EMOJI) / POINTS_PER_EMOJI) * 100}%` }} />
            </div>
            <span className="text-sm font-black text-purple-600 whitespace-nowrap">{spellingEmojiPts % POINTS_PER_EMOJI}/{POINTS_PER_EMOJI} 🍎</span>
          </button>
        </div>

        <div className="w-full max-w-lg bg-white/90 rounded-2xl shadow p-3">
          <p className="text-xs font-bold text-gray-500 uppercase mb-2 text-center">Módulo</p>
          <div className="grid grid-cols-3 gap-2 mb-1 sm:grid-cols-5">
            {modules.map(mod => (
              <button
                key={mod}
                onClick={() => handleModuleSelect(mod)}
                className={`rounded-xl p-2 border-2 font-black text-sm transition-all ${
                  selectedModule === mod
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                M{mod}
              </button>
            ))}
          </div>
        </div>

        <div className="w-full max-w-lg bg-white/90 rounded-3xl shadow-2xl p-6">
          <SpellingWriteStep
            word={currentWord}
            onDone={handleWriteDone}
            onPlaySound={() => playSound(currentWord)}
            wide={false}
          />
        </div>

        <EmojiPrizeCelebration
          emoji={emojiPrize}
          pointsTotal={spellingEmojiPts}
          onClose={() => setEmojiPrize(null)}
        />
        <AnimatePresence>
          {showEmojiCollection && (
            <EmojiCollection
              totalEmojiCount={totalEmojiCount}
              activeEmojiIdx={displayEmojiIdx}
              onSelectEmoji={handleSelectEmoji}
              onClose={() => setShowEmojiCollection(false)}
            />
          )}
        </AnimatePresence>
      </div>
    );
  }


  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Module selector strip + back button */}
      <div className="bg-white border-b border-gray-200 px-3 py-2 flex items-center gap-2 overflow-x-auto shrink-0">
        {onBack && (
          <button onClick={onBack}
            className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-bold bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200 mr-1">
            ← Back
          </button>
        )}
        {modules.map(mod => (
          <button
            key={mod}
            onClick={() => handleModuleSelect(mod)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-bold transition-all ${
              selectedModule === mod
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
            }`}
          >
            M{mod}
          </button>
        ))}
        {/* Prize progress */}
        <button onClick={() => setShowEmojiCollection(true)} className="shrink-0 flex items-center gap-1.5 bg-purple-50 border border-purple-200 rounded-full px-2 py-1 hover:bg-purple-100 active:scale-95 transition-all">
          <span className="text-base">{totalEmojiCount > 0 ? getEmojiForIndex(displayEmojiIdx) : '🎯'}</span>
          <div className="w-14 h-2 bg-purple-100 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-purple-400 to-pink-400 rounded-full transition-all"
              style={{ width: `${((spellingEmojiPts % POINTS_PER_EMOJI) / POINTS_PER_EMOJI) * 100}%` }} />
          </div>
          <span className="text-xs font-black text-purple-600">{spellingEmojiPts % POINTS_PER_EMOJI}/{POINTS_PER_EMOJI}🍎</span>
        </button>
        <button
          onClick={handleUnclearAudio}
          className="shrink-0 ml-auto text-xs bg-yellow-100 text-yellow-700 border border-yellow-300 rounded-full px-3 py-1 font-bold hover:bg-yellow-200"
        >
          😕 No entiendo
        </button>
      </div>
      {/* Challenge label */}
      <div className="text-center text-sm font-bold text-indigo-600 bg-indigo-50 px-4 py-1.5 shrink-0">
        {challengeLabel}
      </div>
      {/* Canvas fills remaining height */}
      <div className="flex-1 min-h-0 relative">
        <GameCanvas
          currentLetter={
            challengeType === 'cloze'
              ? currentWord
                  .split('')
                  .map((l, i) => (clozeIndicesRef.current.includes(i) ? '_' : l))
                  .join('')
              : ''
          }
          options={options}
          onAnswer={handleLetterClick}
          score={score}
          streak={streak}
          onPlaySound={() => playSound(currentWord)}
          showFeedback={false}
          isCorrect={false}
          mode="spelling"
          usedIndices={usedIndices}
        />
        <SpellingBuildArea
          builtWord={builtWord}
          targetWord={currentWord}
          onUndo={handleUndo}
          onSubmit={handleSubmit}
          onClear={handleClear}
          showResult={showResult}
          isCorrect={isCorrect}
          onNext={showResult ? handleNext : undefined}
          onRetry={() => { setBuiltWord([]); setUsedIndices([]); setShowResult(false); setIsRetry(true); submittingRef.current = false; }}
          pointsEarned={pointsEarned}
          bonusPoints={bonusPoints}
          clozeIndices={challengeType === 'cloze' ? clozeIndicesRef.current : []}
        />
      </div>
      <AnimatePresence>
        {showEmojiCollection && (
          <EmojiCollection
            totalEmojiCount={totalEmojiCount}
            activeEmojiIdx={displayEmojiIdx}
            onSelectEmoji={handleSelectEmoji}
            onClose={() => setShowEmojiCollection(false)}
          />
        )}
      </AnimatePresence>
      <EmojiPrizeCelebration
        emoji={emojiPrize}
        pointsTotal={spellingEmojiPts}
        onClose={() => setEmojiPrize(null)}
      />
    </div>
  );
}