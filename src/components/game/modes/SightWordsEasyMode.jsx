import React, { useState, useEffect, useRef } from 'react';
import GameCanvas from '../GameCanvas';
import SightWordTraceFeedback from '../SightWordTraceFeedback';
import SpellingBuildArea, { countCorrectLetters } from '../SpellingBuildArea';
import SpellingWriteStep from '../SpellingWriteStep';
import { LETTER_WAYPOINTS } from '../../data/letterWaypoints';
import { SIGHT_WORDS_EASY, SIGHT_WORDS_EASY_EN } from '../../data/sightWords';
import { base44 } from '@/api/base44Client';
import { getLanguage } from '@/lib/language';
import { AUDIO_BASE, toAudioName } from '@/lib/audio';
import { Volume2, ArrowLeft } from 'lucide-react';

const DISTRACTOR_LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');

// Sight Words with mastery-based difficulty:
//   Learning words → catch (pick the spoken word from 4 options)
//   Mastered words  → build (drag letters to spell) then write (handwriting)
// One word is introduced at a time; difficulty ramps up as words are mastered.
export default function SightWordsEasyMode({ studentData, onUpdateProgress, targets }) {
  const [currentWord, setCurrentWord] = useState(null);
  const [options, setOptions] = useState([]);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [traceWord, setTraceWord] = useState(null);
  const audioRef = useRef(null);
  const preloadedAudio = useRef({});

  // Phase: 'catch' (learning words) | 'build' | 'write' (mastered words)
  const [phase, setPhase] = useState('catch');
  const [letterOptions, setLetterOptions] = useState([]);
  const [builtWord, setBuiltWord] = useState([]);
  const [usedIndices, setUsedIndices] = useState([]);
  const [showBuildResult, setShowBuildResult] = useState(false);
  const [isBuildCorrect, setIsBuildCorrect] = useState(false);

  const language = getLanguage(studentData);
  const SIGHT_WORDS = language === 'en' ? SIGHT_WORDS_EASY_EN : SIGHT_WORDS_EASY;

  const modeData = studentData?.mode_progress?.sight_words_easy || {
    mastered_items: [],
    learning_items: ['el'],
    item_attempts: {},
    total_correct: 0,
    total_attempts: 0
  };

  const masteredSet = new Set(modeData.mastered_items || []);
  const learningList = modeData.learning_items || [];

  const playSound = (word) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
    }
    if (!preloadedAudio.current[word]) {
      preloadedAudio.current[word] = new Audio(`${AUDIO_BASE}/${language}/words/${encodeURIComponent(toAudioName(word))}.mp3`);
      preloadedAudio.current[word].preload = 'auto';
      preloadedAudio.current[word].onerror = () => {
        base44.entities.AudioFeedback.create({
          mode: 'sight_words_easy',
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

  const generateWordDistractors = (word, allWords) => {
    const VOWELS = 'aeiou';
    const distractors = new Set();
    for (let i = 0; i < word.length && distractors.size < 2; i++) {
      if (VOWELS.includes(word[i])) {
        const otherVowels = VOWELS.replace(word[i], '').split('');
        const newVowel = otherVowels[Math.floor(Math.random() * otherVowels.length)];
        const candidate = word.slice(0, i) + newVowel + word.slice(i + 1);
        if (!allWords.includes(candidate) && candidate !== word) distractors.add(candidate);
      }
    }
    if (word.length >= 4 && distractors.size < 2) {
      const start = Math.floor(Math.random() * (word.length - 2));
      const chunk = word.slice(start, start + 3).split('').sort(() => Math.random() - 0.5).join('');
      const candidate = word.slice(0, start) + chunk + word.slice(start + 3);
      if (!allWords.includes(candidate) && candidate !== word && !distractors.has(candidate)) distractors.add(candidate);
    }
    for (let i = word.length - 1; i >= 0 && distractors.size < 2; i--) {
      if (VOWELS.includes(word[i])) {
        const otherVowels = VOWELS.replace(word[i], '').split('');
        for (const v of otherVowels) {
          const candidate = word.slice(0, i) + v + word.slice(i + 1);
          if (!allWords.includes(candidate) && candidate !== word && !distractors.has(candidate)) { distractors.add(candidate); break; }
        }
      }
    }
    return [...distractors].slice(0, 2);
  };

  const buildLetterOptions = (word) => {
    const wordLetters = word.split('');
    const wordLetterSet = new Set(wordLetters);
    const distractors = DISTRACTOR_LETTERS
      .filter(l => !wordLetterSet.has(l))
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.max(2, 6 - wordLetterSet.size));
    return [...wordLetters, ...distractors]
      .sort(() => Math.random() - 0.5)
      .map((letter, i) => ({ letter, id: `opt-${i}-${Math.random().toString(36).slice(2)}` }));
  };

  const generateRound = () => {
    const mastered = modeData.mastered_items || [];
    const learning = modeData.learning_items || [];
    const allKnown = [...mastered, ...learning];
    const knownWords = (targets && targets.length > 0) ? targets : (allKnown.length > 0 ? allKnown : ['el']);

    // Decide phase: mastered words get build+write, learning words get catch.
    // Mix ~40% mastered (build+write) / ~60% learning (catch) when both exist.
    const hasMastered = mastered.length > 0 && (!targets || !targets.length);
    const hasLearning = learning.length > 0;
    let useMastered = false;
    if (hasMastered && hasLearning) {
      useMastered = Math.random() < 0.4;
    } else if (hasMastered) {
      useMastered = true;
    }

    let targetWord;
    if (useMastered) {
      const pool = mastered.filter(w => SIGHT_WORDS.includes(w) || targets?.includes(w));
      targetWord = pool.length > 0
        ? pool[Math.floor(Math.random() * pool.length)]
        : knownWords[Math.floor(Math.random() * knownWords.length)];
      setPhase('build');
    } else {
      const pool = hasLearning ? learning : knownWords;
      targetWord = pool[Math.floor(Math.random() * pool.length)];
      setPhase('catch');
    }

    if (phase === 'catch' || (!useMastered && hasLearning)) {
      // Set up catch options
      const targetIndex = SIGHT_WORDS.indexOf(targetWord);
      const windowSize = 10;
      const nearbyWords = SIGHT_WORDS.slice(
        Math.max(0, targetIndex - windowSize),
        Math.min(SIGHT_WORDS.length, targetIndex + windowSize + 1)
      ).filter(w => w !== targetWord);
      const sameStart = nearbyWords.filter(w => w[0] === targetWord[0]);
      const otherNearby = nearbyWords.filter(w => w[0] !== targetWord[0]);
      const realPool = [...sameStart.sort(() => Math.random() - 0.5), ...otherNearby.sort(() => Math.random() - 0.5)];
      const realDistractors = realPool.slice(0, 2);
      const fakeDistractors = generateWordDistractors(targetWord, SIGHT_WORDS);
      const allOptions = [targetWord, ...realDistractors, ...fakeDistractors].sort(() => Math.random() - 0.5);
      setOptions(allOptions);
    } else {
      // Set up build letter tiles
      setLetterOptions(buildLetterOptions(targetWord));
    }

    setBuiltWord([]);
    setUsedIndices([]);
    setShowBuildResult(false);
    setIsBuildCorrect(false);
    setShowFeedback(false);
    setCurrentWord(targetWord);
    playSound(targetWord);
  };

  const handleUnclearAudio = async () => {
    await base44.entities.AudioFeedback.create({
      mode: 'sight_words_easy',
      item_text: currentWord,
      feedback_type: 'unclear_audio',
      student_number: studentData?.student_number || null,
      class_name: studentData?.class_name || null,
      reported_date: new Date().toISOString(),
    }).catch(() => {});
  };

  // ---- catch phase ----
  const handleCatchAnswer = async (selectedWord) => {
    const correct = selectedWord === currentWord;
    setIsCorrect(correct);
    setShowFeedback(true);

    const attempts = { ...modeData.item_attempts };
    const wordStats = attempts[currentWord] || { correct: 0, total: 0 };
    wordStats.total += 1;
    if (correct) { wordStats.correct += 1; setScore(prev => prev + 1); setStreak(prev => prev + 1); }
    else setStreak(0);
    attempts[currentWord] = wordStats;

    let updatedMastered = [...(modeData.mastered_items || [])];
    let updatedLearning = [...(modeData.learning_items || [])];

    // Master after 5 attempts at 80%+ — then add ONE new word to learning
    if (correct && wordStats.correct / wordStats.total >= 0.8 && wordStats.total >= 5 && !updatedMastered.includes(currentWord)) {
      updatedMastered.push(currentWord);
      updatedLearning = updatedLearning.filter(w => w !== currentWord);
      const allKnown = new Set([...updatedMastered, ...updatedLearning]);
      const nextWord = SIGHT_WORDS.find(w => !allKnown.has(w));
      if (nextWord && updatedLearning.length < 3) updatedLearning.push(nextWord);
    }

    await onUpdateProgress('sight_words_easy', {
      mastered_items: updatedMastered,
      learning_items: updatedLearning,
      item_attempts: attempts,
      total_correct: (modeData.total_correct || 0) + (correct ? 1 : 0),
      total_attempts: (modeData.total_attempts || 0) + 1,
      unlocked: true
    });

    if (!correct) {
      const canTrace = [...new Set(currentWord.split(''))].every(l => LETTER_WAYPOINTS[l]);
      if (canTrace) {
        setTimeout(() => setShowFeedback(false), 600);
        setTimeout(() => setTraceWord(currentWord), 700);
        return;
      }
    }
    setTimeout(() => { setShowFeedback(false); generateRound(); }, 1500);
  };

  // ---- build phase ----
  const handleLetterClick = (letterObj) => {
    if (showBuildResult || usedIndices.includes(letterObj.id)) return;
    setBuiltWord(prev => [...prev, letterObj.letter]);
    setUsedIndices(prev => [...prev, letterObj.id]);
  };
  const handleUndo = () => { if (showBuildResult) return; setBuiltWord(p => p.slice(0, -1)); setUsedIndices(p => p.slice(0, -1)); };
  const handleClear = () => { if (showBuildResult) return; setBuiltWord([]); setUsedIndices([]); };

  const handleBuildSubmit = async () => {
    if (showBuildResult) return;
    const correct = builtWord.join('') === currentWord;
    setIsBuildCorrect(correct);
    setShowBuildResult(true);

    const attempts = { ...modeData.item_attempts };
    const wordStats = attempts[currentWord] || { correct: 0, total: 0 };
    wordStats.total += 1;
    if (correct) wordStats.correct += 1;
    attempts[currentWord] = wordStats;

    await onUpdateProgress('sight_words_easy', {
      mastered_items: [...(modeData.mastered_items || [])],
      learning_items: [...(modeData.learning_items || [])],
      item_attempts: attempts,
      total_correct: (modeData.total_correct || 0) + (correct ? 1 : 0),
      total_attempts: (modeData.total_attempts || 0) + 1,
      unlocked: true
    });
  };

  const handleBuildNext = () => {
    if (isBuildCorrect) {
      // Go to write phase after a correct build
      setPhase('write');
    } else {
      // Retry the build
      setBuiltWord([]); setUsedIndices([]); setShowBuildResult(false);
    }
  };

  // ---- write phase ----
  const handleWriteDone = () => {
    generateRound();
  };

  useEffect(() => {
    if (!currentWord) generateRound();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!currentWord) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-sky-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  // ---- write phase render ----
  if (phase === 'write') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-300 via-sky-200 to-green-200 flex flex-col items-center p-4 gap-4">
        <div className="w-full max-w-lg flex items-center gap-2">
          <button onClick={() => generateRound()}
            className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-bold bg-white/90 text-gray-700 border border-gray-300 hover:bg-white shadow">
            <ArrowLeft className="w-4 h-4" /> Skip
          </button>
          <div className="bg-white/90 rounded-xl px-4 py-2 font-black text-indigo-700">
            ✍️ Write: {currentWord}
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
      </div>
    );
  }

  // ---- build phase render ----
  if (phase === 'build') {
    return (
      <div className="h-screen flex flex-col overflow-hidden bg-gradient-to-b from-sky-300 via-sky-200 to-green-200">
        <div className="bg-white border-b border-gray-200 px-3 py-2 flex items-center gap-2 shrink-0">
          <button onClick={() => generateRound()}
            className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-bold bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200">
            <ArrowLeft className="w-4 h-4" /> Skip
          </button>
          <div className="font-black text-indigo-700">🔤 Build: {currentWord}</div>
          <button onClick={() => playSound(currentWord)}
            className="ml-auto shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-bold bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-indigo-100">
            <Volume2 className="w-4 h-4" /> Hear
          </button>
        </div>
        <div className="text-center text-sm font-bold text-indigo-600 bg-indigo-50 px-4 py-1.5 shrink-0">
          ✏️ Drag the letters to spell the word!
        </div>
        <div className="flex-1 min-h-0 relative">
          <GameCanvas
            currentLetter=''
            options={letterOptions}
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
            onSubmit={handleBuildSubmit}
            onClear={handleClear}
            showResult={showBuildResult}
            isCorrect={isBuildCorrect}
            onNext={showBuildResult ? handleBuildNext : undefined}
            onRetry={() => { setBuiltWord([]); setUsedIndices([]); setShowBuildResult(false); }}
            pointsEarned={0}
            bonusPoints={0}
          />
        </div>
      </div>
    );
  }

  // ---- catch phase render (default) ----
  return (
    <>
      <div className="flex justify-center p-2">
        <button
          onClick={handleUnclearAudio}
          className="text-xs bg-yellow-100 text-yellow-700 border border-yellow-300 rounded-full px-3 py-1 font-bold hover:bg-yellow-200"
        >
          😕 No entiendo
        </button>
      </div>
      <GameCanvas
        currentLetter={currentWord}
        options={options}
        onAnswer={handleCatchAnswer}
        score={score}
        streak={streak}
        onPlaySound={() => playSound(currentWord)}
        showFeedback={showFeedback}
        isCorrect={isCorrect}
        mode="catch"
      />
      {traceWord && (
        <SightWordTraceFeedback
          word={traceWord}
          lang={language}
          onDone={() => { setTraceWord(null); generateRound(); }}
        />
      )}
    </>
  );
}