import React, { useState, useEffect, useRef } from 'react';
import GameCanvas from '../GameCanvas';
import SpellingBuildArea from '../SpellingBuildArea';
import { SIGHT_WORDS_SPELLING } from '../../data/sightWords';

const SIGHT_WORDS = SIGHT_WORDS_SPELLING;

// Challenge types: 'spell' = spell from scratch, 'unscramble' = letters given scrambled, 'missing' = fill in missing letter
const CHALLENGE_TYPES = ['spell', 'unscramble', 'missing', 'spell', 'unscramble'];

function pickMissingIdx(word) {
  // Pick a non-trivial letter to remove (prefer middle letters for longer words)
  if (word.length <= 2) return word.length - 1;
  return 1 + Math.floor(Math.random() * (word.length - 2));
}

export default function SightWordsSpellingMode({ studentData, onUpdateProgress }) {
  const [currentWord, setCurrentWord] = useState(null);
  const [options, setOptions] = useState([]);
  const [builtWord, setBuiltWord] = useState([]);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [usedIndices, setUsedIndices] = useState([]);
  const [challengeType, setChallengeType] = useState('spell');
  const [missingIdx, setMissingIdx] = useState(null);
  const [roundCount, setRoundCount] = useState(0);
  const lastWordRef = useRef(null);
  const audioRef = useRef(null);
  const preloadedAudio = useRef({});
  const submittingRef = useRef(false);

  const modeData = studentData?.mode_progress?.sight_words_spelling || {
    mastered_items: [],
    learning_items: ['el', 'la', 'un', 'una', 'en'],
    item_attempts: {},
    total_correct: 0,
    total_attempts: 0
  };

  const playSound = (word) => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.onended = null; }
    if (!preloadedAudio.current[word]) {
      preloadedAudio.current[word] = new Audio(`/sight-word-audio/${encodeURIComponent(word)}.mp3`);
      preloadedAudio.current[word].preload = 'auto';
    }
    audioRef.current = preloadedAudio.current[word];
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => {});
  };

  const generateRound = (nextRoundCount) => {
    const learning = modeData.learning_items?.length > 0 ? modeData.learning_items : ['el', 'la', 'un'];
    const attempts = modeData.item_attempts || {};
    const pool = learning.length > 1 ? learning.filter(w => w !== lastWordRef.current) : learning;
    const weights = pool.map(w => { const s = attempts[w] || { correct: 0, total: 0 }; return Math.max(1, 5 - s.correct); });
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let rand = Math.random() * totalWeight;
    let targetWord = pool[0];
    for (let i = 0; i < pool.length; i++) { rand -= weights[i]; if (rand <= 0) { targetWord = pool[i]; break; } }
    lastWordRef.current = targetWord;

    // Pick challenge type from rotating sequence
    const type = CHALLENGE_TYPES[(nextRoundCount ?? roundCount) % CHALLENGE_TYPES.length];
    setChallengeType(type);

    const wordLetters = targetWord.split('');
    const letterCounts = {};
    wordLetters.forEach(l => letterCounts[l] = (letterCounts[l] || 0) + 1);
    const neededLetters = [];
    Object.entries(letterCounts).forEach(([letter, count]) => { for (let i = 0; i < count; i++) neededLetters.push(letter); });

    let allLetters;
    if (type === 'unscramble') {
      // Only the exact letters of the word, shuffled — no distractors
      allLetters = [...wordLetters].sort(() => Math.random() - 0.5);
    } else if (type === 'missing') {
      // Give all letters except one; student picks the missing one from letter options
      const mIdx = pickMissingIdx(targetWord);
      setMissingIdx(mIdx);
      const missingLetter = targetWord[mIdx];
      // Distractors: a few other letters
      const distractors = 'abcdefghijklmnopqrstuvwxyz'.split('')
        .filter(l => l !== missingLetter)
        .sort(() => Math.random() - 0.5)
        .slice(0, 5);
      allLetters = [missingLetter, ...distractors].sort(() => Math.random() - 0.5);
    } else {
      // 'spell': word letters + distractors
      const distractors = 'abcdefghijklmnopqrstuvwxyz'.split('')
        .filter(l => !wordLetters.includes(l))
        .sort(() => Math.random() - 0.5)
        .slice(0, 4);
      allLetters = [...neededLetters, ...distractors].sort(() => Math.random() - 0.5);
    }

    setCurrentWord(targetWord);
    setOptions(allLetters.map((letter, idx) => ({ letter, id: idx })));
    setBuiltWord(type === 'missing' ? [] : []);
    setUsedIndices([]);
    setShowResult(false);
    submittingRef.current = false;
    playSound(targetWord);
  };

  const handleLetterClick = (letterObj) => {
    if (showResult) return;
    if (usedIndices.includes(letterObj.id)) return;

    if (challengeType === 'missing') {
      // Only one click needed — immediately submit
      const chosen = letterObj.letter;
      const correct = chosen === currentWord[missingIdx];
      setBuiltWord([chosen]);
      setUsedIndices([letterObj.id]);
      handleSubmitWithLetter(chosen);
    } else {
      setBuiltWord(prev => [...prev, letterObj.letter]);
      setUsedIndices(prev => [...prev, letterObj.id]);
    }
  };

  const handleSubmitWithLetter = async (chosen) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    const correct = chosen === currentWord[missingIdx];
    setIsCorrect(correct);
    setShowResult(true);
    if (correct) { setScore(s => s + 1); setStreak(s => s + 1); } else { setStreak(0); }
    await saveProgress(correct);
    setTimeout(() => { const next = roundCount + 1; setRoundCount(next); generateRound(next); }, 4000);
  };

  const handleUndo = () => { if (showResult) return; setBuiltWord(prev => prev.slice(0, -1)); setUsedIndices(prev => prev.slice(0, -1)); };
  const handleClear = () => { if (showResult) return; setBuiltWord([]); setUsedIndices([]); };

  const saveProgress = async (correct) => {
    const attempts = { ...modeData.item_attempts };
    const wordStats = attempts[currentWord] || { correct: 0, total: 0 };
    wordStats.total += 1;
    if (correct) wordStats.correct += 1;
    attempts[currentWord] = wordStats;
    let updatedMastered = [...(modeData.mastered_items || [])];
    let updatedLearning = [...(modeData.learning_items || [])];
    if (correct && wordStats.correct / wordStats.total >= 0.8 && wordStats.total >= 3 && !updatedMastered.includes(currentWord)) {
      updatedMastered.push(currentWord);
      updatedLearning = updatedLearning.filter(w => w !== currentWord);
      const allKnown = [...updatedMastered, ...updatedLearning];
      const nextWord = SIGHT_WORDS.find(w => !allKnown.includes(w));
      if (nextWord && updatedLearning.length < 5) updatedLearning.push(nextWord);
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
    setIsCorrect(correct);
    setShowResult(true);
    if (correct) { setScore(s => s + 1); setStreak(s => s + 1); } else { setStreak(0); }
    await saveProgress(correct);
    setTimeout(() => { const next = roundCount + 1; setRoundCount(next); generateRound(next); }, 4000);
  };

  useEffect(() => { if (!currentWord) generateRound(0); }, []);

  if (!currentWord) return null;

  // Challenge type label shown to student
  const challengeLabel = challengeType === 'unscramble'
    ? '🔀 Unscramble the letters!'
    : challengeType === 'missing'
    ? '🔍 What letter is missing?'
    : '✏️ Spell the word!';

  // For 'missing': show the word with a blank
  const missingDisplay = challengeType === 'missing' && currentWord
    ? currentWord.split('').map((l, i) => i === missingIdx ? '_' : l).join('')
    : null;

  return (
    <>
      {/* Challenge type banner */}
      <div className="text-center text-sm font-bold text-indigo-600 bg-indigo-50 rounded-xl px-4 py-2 mx-4">
        {challengeLabel}
      </div>

      {challengeType === 'missing' && missingDisplay && (
        <div className="text-center text-3xl font-black tracking-widest text-gray-700 py-2">
          {missingDisplay}
        </div>
      )}

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

      {challengeType !== 'missing' && (
        <SpellingBuildArea
          builtWord={builtWord}
          targetWord={currentWord}
          onUndo={handleUndo}
          onSubmit={handleSubmit}
          onClear={handleClear}
          showResult={showResult}
          isCorrect={isCorrect}
        />
      )}

      {challengeType === 'missing' && showResult && (
        <div className={`mx-4 rounded-xl px-4 py-3 text-center font-bold text-lg ${isCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {isCorrect ? '✅ Correct!' : `❌ It was "${currentWord[missingIdx]}"`}
        </div>
      )}
    </>
  );
}