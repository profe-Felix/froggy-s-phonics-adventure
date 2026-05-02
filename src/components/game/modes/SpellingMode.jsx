import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import GameCanvas from '../GameCanvas';
import SpellingBuildArea, { countCorrectLetters } from '../SpellingBuildArea';
import SpellingWriteStep from '../SpellingWriteStep';
import { base44 } from '@/api/base44Client';
import EmojiPrizeCelebration, { countNewEmojis, getEmojiForIndex, POINTS_PER_EMOJI } from '../EmojiPrizeCelebration';
import EmojiCollection from '../EmojiCollection';

const SUPABASE_LISTS_URL = 'https://dmlsiyyqpcupbizpxwhp.supabase.co/storage/v1/object/public/app-presets/slidetoread/lists.json';
let SPELLING_WORDS_BY_MODULE = {};

const SUPABASE_AUDIO_BASE = 'https://dmlsiyyqpcupbizpxwhp.supabase.co/storage/v1/object/public/lettersort-audio';

function toAudioName(word) {
  return word
    // keep ORIGINAL capitalization
    .replace(/á/g, 'a..').replace(/é/g, 'e..').replace(/í/g, 'i..')
    .replace(/ó/g, 'o..').replace(/ú/g, 'u..')
    .replace(/Á/g, 'A..').replace(/É/g, 'E..').replace(/Í/g, 'I..')
    .replace(/Ó/g, 'O..').replace(/Ú/g, 'U..')
    .replace(/ü/g, 'u,,').replace(/Ü/g, 'U,,')
    .replace(/ñ/g, 'n..').replace(/Ñ/g, 'N..');
}
async function findAudioUrl(word) {
  const audioName = toAudioName(word);

  const candidates = [
    `${SUPABASE_AUDIO_BASE}/${audioName}.mp3`,
    `${SUPABASE_AUDIO_BASE}/${audioName}.wav`,
  ];

  for (const url of candidates) {
    try {
      const res = await fetch(url, { method: 'HEAD' });
      if (res.ok) return url;
    } catch {
      // try next candidate
    }
  }

  return null;
}

const DISTRACTOR_LETTERS = 'abcdefghijklmnopqrstuvwxyzáéíóúüñ'.split('');

// For words with b or d, always include the opposite as a distractor
function buildOptions(word) {
  const wordLetters = word.split('');
  const letterCounts = {};
  wordLetters.forEach(l => { letterCounts[l] = (letterCounts[l] || 0) + 1; });
  const neededLetters = [];
  Object.entries(letterCounts).forEach(([letter, count]) => {
    for (let i = 0; i < count; i++) neededLetters.push(letter);
  });

  // Force b/d opposite distractors
  const forcedDistractors = [];
  if (wordLetters.includes('b') && !wordLetters.includes('d')) forcedDistractors.push('d');
  if (wordLetters.includes('d') && !wordLetters.includes('b')) forcedDistractors.push('b');

  const otherDistractors = DISTRACTOR_LETTERS
    .filter(l => !wordLetters.includes(l) && !forcedDistractors.includes(l))
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.max(2, 5 - wordLetters.length - forcedDistractors.length));

  return [...neededLetters, ...forcedDistractors, ...otherDistractors]
    .sort(() => Math.random() - 0.5)
    .map((letter, idx) => ({ letter, id: idx }));
}

// Compute mastery % per module
function getModuleProgress(modeData) {
  const mastered = new Set(modeData.mastered_items || []);
  return Object.entries(SPELLING_WORDS_BY_MODULE).map(([mod, words]) => {
    const wordArray = Array.isArray(words) ? words : [];
    const total = wordArray.length;
    const masteredCount = wordArray.filter(w => mastered.has(w)).length;
    return { module: parseInt(mod), total, mastered: masteredCount, pct: total > 0 ? masteredCount / total : 0 };
  });
}

function pickWord(modeData, lastWord, moduleWords) {
  if (!moduleWords || !Array.isArray(moduleWords) || moduleWords.length === 0) return null;
  const attempts = modeData.item_attempts || {};
  const mastered = new Set(modeData.mastered_items || []);
  const learning = (modeData.learning_items || []).filter(w => moduleWords.includes(w));

  const notMastered = moduleWords.filter(w => !mastered.has(w));
  const pool = [...new Set([...learning, ...notMastered.slice(0, 30)])];
  const candidates = pool.length > 1 ? pool.filter(w => w !== lastWord) : pool;
  if (!candidates.length) return pool[0] || moduleWords[0];

  const weights = candidates.map(w => {
    const s = attempts[w] || { correct: 0, total: 0 };
    return Math.max(1, 8 - s.correct * 2);
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let rand = Math.random() * total;
  for (let i = 0; i < candidates.length; i++) {
    rand -= weights[i];
    if (rand <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

export default function SpellingMode({ studentData, onUpdateProgress, onBack }) {
  const [selectedModule, setSelectedModule] = useState(1);
  const [phase, setPhase] = useState('write');
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
  const [writtenStrokes, setWrittenStrokes] = useState(null);
  const [wordsLoaded, setWordsLoaded] = useState(false);
  const [emojiPrize, setEmojiPrize] = useState(null);
  const [showEmojiCollection, setShowEmojiCollection] = useState(false);
  const [activeEmojiIdx, setActiveEmojiIdx] = useState(() => {
    const saved = localStorage.getItem('spelling_active_emoji_idx');
    return saved !== null ? parseInt(saved) : 0;
  });
  const [spellingEmojiPts, setSpellingEmojiPts] = useState(() => studentData?.spelling_total_points || 0); // separate emoji counter
  const [spellingTotalPts, setSpellingTotalPts] = useState(() => studentData?.spelling_total_points || 0); // kept for DB save
  const [isRetry, setIsRetry] = useState(false); // true if student retried this word
  const [streakBonusToday, setStreakBonusToday] = useState(() => {
    try { return JSON.parse(localStorage.getItem('spelling_streak_bonus') || '{}'); } catch { return {}; }
  });
  const audioRef = useRef(null);
  const preloadedAudio = useRef({});
  const submittingRef = useRef(false);
  const lastWordRef = useRef(null);

  const todayKey = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const modeData = studentData?.mode_progress?.spelling || {
    mastered_items: [], learning_items: (SPELLING_WORDS_BY_MODULE[1] || []).slice(0, 3),
    item_attempts: {}, total_correct: 0, total_attempts: 0
  };

  const moduleProgress = wordsLoaded ? getModuleProgress(modeData) : [];

  const checkAudioExists = async (url) => {
    try {
      const res = await fetch(url, { method: 'HEAD' });
      return res.ok;
    } catch {
      return false;
    }
  };

  const playSound = (word) => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.onended = null; }
    if (!preloadedAudio.current[word]) {
      const audio = new Audio();
      const audioName = toAudioName(word);
      const candidates = [
        `${SUPABASE_AUDIO_BASE}/${audioName}.mp3`,
        `${SUPABASE_AUDIO_BASE}/${audioName}.wav`,
      ];
      let i = 0;
      const tryNext = () => {
        if (i >= candidates.length) {
          // Log missing audio
          base44.entities.AudioFeedback.create({
            mode: 'spelling',
            item_text: word,
            feedback_type: 'missing_audio',
            student_number: studentData?.student_number || null,
            class_name: studentData?.class_name || null,
            reported_date: new Date().toISOString(),
          }).catch(() => {});
          return;
        }
        audio.src = candidates[i++];
        audio.load();
        audio.play().catch(tryNext);
      };
      audio.onerror = tryNext;
      preloadedAudio.current[word] = audio;
      audioRef.current = audio;
      tryNext();
      return;
    }
    audioRef.current = preloadedAudio.current[word];
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => {});
  };

  const handleUnclearAudio = async () => {
    await base44.entities.AudioFeedback.create({
      mode: 'spelling',
      item_text: currentWord,
      feedback_type: 'unclear_audio',
      student_number: studentData?.student_number || null,
      class_name: studentData?.class_name || null,
      reported_date: new Date().toISOString(),
    }).catch(() => {});
  };

  const startRound = async (mod = selectedModule) => {
    if (!wordsLoaded) return;

    const moduleWords = SPELLING_WORDS_BY_MODULE[mod] || [];
    if (!moduleWords.length) return;

    // Try a limited number of words so missing audio can never freeze the app
    for (let attempt = 0; attempt < Math.min(moduleWords.length, 20); attempt++) {
      const word = pickWord(modeData, lastWordRef.current, moduleWords);
      if (!word) break;

      const audioUrl = await findAudioUrl(word);

      if (!audioUrl) {
        lastWordRef.current = word;
        continue;
      }

      lastWordRef.current = word;
      setCurrentWord(word);
      setOptions(buildOptions(word));
      setBuiltWord([]);
      setUsedIndices([]);
      setShowResult(false);
      setPointsEarned(0);
      setBonusPoints(0);
      setPhase('write');
      setWrittenStrokes(null);
      setIsRetry(false);
      submittingRef.current = false;

      playSound(word);
      return;
    }

    setCurrentWord(null);
  };

  useEffect(() => {
    const loadWords = async () => {
      try {
        const res = await fetch(SUPABASE_LISTS_URL);
        const data = await res.json();

        const raw = data["Palabras"] || {};
        const normalized = {};

        Object.entries(raw).forEach(([key, moduleObj]) => {
          const num = parseInt(String(key).replace(/\D/g, ''), 10);
          const words = moduleObj?.new || [];

          if (!Number.isNaN(num) && Array.isArray(words)) {
            normalized[num] = words;
          }
        });

        SPELLING_WORDS_BY_MODULE = normalized;
        setWordsLoaded(true);
      } catch (e) {
        console.error('Failed to load word lists:', e);
        SPELLING_WORDS_BY_MODULE = {};
        setWordsLoaded(true);
      }
    };

    loadWords();
  }, []);

  useEffect(() => {
    if (wordsLoaded) {
      startRound();
    }
  }, [wordsLoaded]);

  const handleModuleSelect = (mod) => {
    setSelectedModule(mod);
    startRound(mod);
  };

  const handleWriteDone = async (strokes, imageUrl) => {
    setWrittenStrokes(strokes);
    setPhase('build');
    if (studentData) {
      base44.entities.SpellingWritingSample.create({
        student_number: studentData.student_number,
        class_name: studentData.class_name,
        mode: 'spelling',
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

  const handleSubmit = async () => {
    if (submittingRef.current || showResult) return;
    submittingRef.current = true;
    const userWord = builtWord.join('');
    const correct = userWord === currentWord;

    // Partial points: (correctLetters / wordLength) * module, floored. Retry = half.
    const correctLetterCount = countCorrectLetters(builtWord, currentWord.split(''));
    const rawPts = Math.floor((correctLetterCount / currentWord.length) * selectedModule);
    const basePts = isRetry ? Math.floor(rawPts / 2) : rawPts;

    // Streak bonus only on first-attempt correct
    const newStreak = correct && !isRetry ? streak + 1 : (correct ? streak : 0);
    const bonusKey10 = `spelling_10_${todayKey}`;
    const bonusKey20 = `spelling_20_${todayKey}`;
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
    // Trophy score: only increment for first-attempt correct
    if (correct && !isRetry) setScore(s => s + pts);
    setStreak(newStreak);

    // Emoji pts are separate from trophy — always add earned pts to emoji counter
    const oldEmojiPts = spellingEmojiPts;
    const newEmojiPts = oldEmojiPts + pts;
    setSpellingEmojiPts(newEmojiPts);
    setSpellingTotalPts(t => t + pts);
    const newEmojis = countNewEmojis(oldEmojiPts, newEmojiPts);
    if (newEmojis > 0) {
      const idx = Math.floor(newEmojiPts / POINTS_PER_EMOJI) - 1;
      setEmojiPrize(getEmojiForIndex(idx));
    }

    const attempts = { ...modeData.item_attempts };
    const wordStats = attempts[currentWord] || { correct: 0, total: 0 };
    wordStats.total += 1;
    // Only count first-attempt correct for mastery
    if (correct && !isRetry) wordStats.correct += 1;
    attempts[currentWord] = wordStats;
    let updatedMastered = [...(modeData.mastered_items || [])];
    let updatedLearning = [...(modeData.learning_items || [])];
    if (correct && wordStats.correct >= 3 && wordStats.correct / wordStats.total >= 0.60 && !updatedMastered.includes(currentWord)) {
      updatedMastered.push(currentWord);
      updatedLearning = updatedLearning.filter(w => w !== currentWord);
      const moduleWords = SPELLING_WORDS_BY_MODULE[selectedModule] || [];
      if (updatedLearning.length < 15) {
        const allKnown = new Set([...updatedMastered, ...updatedLearning]);
        const next = moduleWords.find(w => !allKnown.has(w));
        if (next) updatedLearning.push(next);
      }
    }
    if (updatedLearning.length < 8) {
      const moduleWords = SPELLING_WORDS_BY_MODULE[selectedModule] || [];
      const allKnown = new Set([...updatedMastered, ...updatedLearning]);
      moduleWords.filter(w => !allKnown.has(w)).slice(0, 8 - updatedLearning.length).forEach(w => updatedLearning.push(w));
    }
    await onUpdateProgress('spelling', {
      mastered_items: updatedMastered, learning_items: updatedLearning, item_attempts: attempts,
      total_correct: (modeData.total_correct || 0) + (correct ? 1 : 0),
      total_attempts: (modeData.total_attempts || 0) + 1, unlocked: true
    });
  };

  if (!wordsLoaded) {
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
          <p className="text-xl font-black text-red-600 mb-2">No words loaded</p>
          <p className="text-gray-600 font-bold">
            Check lists.json → Palabras → M{selectedModule} → new.
          </p>
        </div>
      </div>
    );
  }

  const ptsToNextEmoji = POINTS_PER_EMOJI - (spellingEmojiPts % POINTS_PER_EMOJI);
  const totalEmojiCount = Math.floor(spellingEmojiPts / POINTS_PER_EMOJI);
  const displayEmojiIdx = Math.min(activeEmojiIdx, Math.max(0, totalEmojiCount - 1));

  const handleSelectEmoji = (idx) => {
    setActiveEmojiIdx(idx);
    localStorage.setItem('spelling_active_emoji_idx', String(idx));
    setShowEmojiCollection(false);
  };

  if (phase === 'write') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-300 via-sky-200 to-green-200 flex flex-col items-center p-4 gap-4">
        {/* Back + module strip */}
        <div className="w-full max-w-lg flex items-center gap-2">
          {onBack && (
            <button onClick={onBack}
              className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-bold bg-white/90 text-gray-700 border border-gray-300 hover:bg-white shadow">
              ← Back
            </button>
          )}
          {/* Emoji prize progress bar */}
          <button onClick={() => setShowEmojiCollection(true)} className="flex-1 bg-white/90 rounded-xl px-3 py-2 flex items-center gap-2 shadow hover:bg-white active:scale-95 transition-all">
            <span className="text-xl">{totalEmojiCount > 0 ? getEmojiForIndex(displayEmojiIdx) : '🎯'}</span>
            <div className="flex-1 h-2.5 bg-purple-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-purple-400 to-pink-400 rounded-full transition-all"
                style={{ width: `${((spellingEmojiPts % POINTS_PER_EMOJI) / POINTS_PER_EMOJI) * 100}%` }} />
            </div>
            <span className="text-sm font-black text-purple-600 whitespace-nowrap">{spellingEmojiPts % POINTS_PER_EMOJI}/{POINTS_PER_EMOJI} 🍎</span>
          </button>
        </div>

        {/* Module selector with progress bars */}
        <div className="w-full max-w-lg bg-white/90 rounded-2xl shadow p-3">
          <p className="text-xs font-bold text-gray-500 uppercase mb-2 text-center">Módulo</p>
          <div className="grid grid-cols-3 gap-2 mb-1 sm:grid-cols-5">
            {moduleProgress.map(({ module, pct, mastered, total }) => (
              <button key={module} onClick={() => handleModuleSelect(module)}
                className={`flex flex-col items-center gap-1 rounded-xl p-2 border-2 transition-all ${selectedModule === module ? 'border-indigo-500 bg-indigo-50' : pct >= 0.8 ? 'border-green-400 bg-green-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                <span className={`text-sm font-black ${selectedModule === module ? 'text-indigo-700' : 'text-gray-700'}`}>M{module}</span>
                <div className="w-full h-1.5 rounded-full bg-gray-200 overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${pct >= 0.8 ? 'bg-green-500' : 'bg-indigo-400'}`} style={{ width: `${pct * 100}%` }} />
                </div>
                <span className="text-xs text-gray-400">{mastered}/{total}</span>
                {pct >= 0.8 && <span className="text-xs">⭐</span>}
              </button>
            ))}
          </div>
        </div>
        <div className="w-full max-w-lg bg-white/90 rounded-3xl shadow-2xl p-6">
          <SpellingWriteStep
            word={currentWord}
            onDone={handleWriteDone}
            onPlaySound={() => playSound(currentWord)}
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
        {moduleProgress.map(({ module, pct }) => (
          <button key={module} onClick={() => handleModuleSelect(module)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-bold transition-all flex items-center gap-1 ${selectedModule === module ? 'bg-indigo-600 text-white' : pct >= 0.8 ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'}`}>
            M{module} {pct >= 0.8 ? '⭐' : <span className="text-xs opacity-60">{Math.round(pct * 100)}%</span>}
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
      {/* Canvas fills remaining height */}
      <div className="flex-1 min-h-0 relative">
        <GameCanvas
          currentLetter={currentWord}
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
          onNext={showResult ? () => startRound(selectedModule) : undefined}
          onRetry={() => { setBuiltWord([]); setUsedIndices([]); setShowResult(false); setIsRetry(true); submittingRef.current = false; }}
          pointsEarned={pointsEarned}
          bonusPoints={bonusPoints}
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