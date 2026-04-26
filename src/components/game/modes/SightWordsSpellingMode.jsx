import React, { useState, useEffect, useRef } from 'react';
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

export default function SightWordsSpellingMode({ studentData, onUpdateProgress }) {
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
  const [challengeType, setChallengeType] = useState('spell');
  const [roundCount, setRoundCount] = useState(0);
  const [clozeIndices, setClozeIndices] = useState([]);
  const [wordsLoaded, setWordsLoaded] = useState(false);
  const lastWordRef = useRef(null);
  const audioRef = useRef(null);
  const preloadedAudio = useRef({});
  const submittingRef = useRef(false);

  const modeData = studentData?.mode_progress?.sight_words_spelling || {
    mastered_items: [], learning_items: ['el', 'la', 'un', 'una', 'en'],
    item_attempts: {}, total_correct: 0, total_attempts: 0
  };

  const playSound = (word) => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.onended = null; }
    if (!preloadedAudio.current[word]) {
      preloadedAudio.current[word] = new Audio(`/sight-word-audio/${encodeURIComponent(word)}.mp3`);
      preloadedAudio.current[word].preload = 'auto';
      preloadedAudio.current[word].onerror = () => {
        base44.entities.AudioFeedback.create({
          mode: 'sight_words_spelling',
          item_text: word,
          feedback_type: 'missing_audio',
          student_number: studentData?.student_number || null,
          class_name: studentData?.class_name || null,
          reported_date: new Date().toISOString(),
        }).catch(() => {});
      };
    }
    audioRef.current = preloadedAudio.current[word];
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => {});
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

    // CLOZE MODE
    if (type === 'cloze') {
      const indices = [...Array(wordLetters.length).keys()]
        .sort(() => Math.random() - 0.5)
        .slice(0, Math.min(2, wordLetters.length));
      setClozeIndices(indices);
      const missingLetters = indices.map(i => wordLetters[i]);

      const distractors = DISTRACTOR_LETTERS
        .filter(l => !wordLetters.includes(l))
        .sort(() => Math.random() - 0.5)
        .slice(0, 4);

      return [...missingLetters, ...distractors]
        .sort(() => Math.random() - 0.5)
        .map((letter, idx) => ({ letter, id: idx }));
    }
    setClozeIndices([]);

    // SPELL MODE (default)
    // Get all unique letters in word
    const uniqueLetters = [...new Set(wordLetters)];
    
    // Get exact needed count per letter
    const letterCounts = {};
    wordLetters.forEach(l => { letterCounts[l] = (letterCounts[l] || 0) + 1; });
    const neededLetters = Object.entries(letterCounts).flatMap(([letter, count]) => 
      Array(count).fill(letter)
    );

    // Add distractors (letters NOT in word)
    const distractors = DISTRACTOR_LETTERS
      .filter(l => !uniqueLetters.includes(l))
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.max(2, 6 - uniqueLetters.length));

    return [...neededLetters, ...distractors]
      .sort(() => Math.random() - 0.5)
      .map((letter, idx) => ({ letter, id: idx }));
  };

  const startRound = (nextRoundCount, mod = selectedModule) => {
    if (!wordsLoaded) return;
    const moduleWords = SIGHT_WORDS_BY_MODULE[mod] || [];
    if (moduleWords.length === 0) return;
    
    const rc = nextRoundCount ?? roundCount;
    const word = pickWord(modeData, lastWordRef.current, moduleWords);
    if (!word) return;
    
    lastWordRef.current = word;
    const type = CHALLENGE_TYPES[rc % CHALLENGE_TYPES.length];
    setChallengeType(type);
    setCurrentWord(word);
    setOptions(buildOptions(word, type));
    setBuiltWord([]);
    setUsedIndices([]);
    setShowResult(false);
    setPointsEarned(0);
    setPhase('write');
    submittingRef.current = false;
    playSound(word);
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
      startRound(0, selectedModule);
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
    startRound(0, mod);
  };

  const handleNext = () => {
    const next = roundCount + 1;
    setRoundCount(next);
    startRound(next, selectedModule);
  };

  const saveProgress = async (correct) => {
    const attempts = { ...modeData.item_attempts };
    const wordStats = attempts[currentWord] || { correct: 0, total: 0 };
    wordStats.total += 1;
    if (correct) wordStats.correct += 1;
    attempts[currentWord] = wordStats;

    let updatedMastered = [...(modeData.mastered_items || [])];
    let updatedLearning = [...(modeData.learning_items || [])];

    if (correct && wordStats.correct >= 4 && wordStats.correct / wordStats.total >= 0.75 && !updatedMastered.includes(currentWord)) {
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
    const userWord = builtWord.join('');
    const correct = userWord === currentWord;
    const pts = countCorrectLetters(builtWord, currentWord);
    setIsCorrect(correct);
    setShowResult(true);
    setPointsEarned(pts);
    if (correct) { setScore(s => s + pts); setStreak(s => s + 1); } else { setScore(s => s + pts); setStreak(0); }
    await saveProgress(correct);
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
          <p className="text-xl font-black text-red-600 mb-2">No sight words loaded</p>
          <p className="text-gray-600 font-bold">
            Check lists.json → Palabras 💙 → M{selectedModule} → new.
          </p>
        </div>
      </div>
    );
  }

  const challengeLabel = challengeType === 'unscramble' ? '🔀 Unscramble the letters!' : '✏️ Spell the word!';

  if (phase === 'write') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-300 via-sky-200 to-green-200 flex flex-col items-center p-4 gap-4">
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
          />
        </div>
      </div>
    );
  }


  return (
    <>
      {/* Module selector strip */}
      <div className="bg-white border-b border-gray-200 px-3 py-2 flex gap-2 overflow-x-auto">
        {modules.map(mod => (
          <button
            key={mod}
            onClick={() => handleModuleSelect(mod)}
            className={`shrink-0 px-4 py-2 rounded-full text-sm font-bold transition-all ${
              selectedModule === mod
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
            }`}
          >
            Module {mod}
          </button>
        ))}
      </div>
      <div className="flex justify-center p-2">
        <button
          onClick={handleUnclearAudio}
          className="text-xs bg-yellow-100 text-yellow-700 border border-yellow-300 rounded-full px-3 py-1 font-bold hover:bg-yellow-200"
        >
          😕 No entiendo
        </button>
      </div>
      <div className="text-center text-sm font-bold text-indigo-600 bg-indigo-50 rounded-xl px-4 py-2 mx-4 absolute top-24 left-1/2 -translate-x-1/2 z-20 shadow">
        {challengeLabel}
      </div>
      <GameCanvas
        currentLetter={
          challengeType === 'cloze'
            ? currentWord
                .split('')
                .map((l, i) => (clozeIndices.includes(i) ? '_' : l))
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
        pointsEarned={pointsEarned}
      />
    </>
  );
}