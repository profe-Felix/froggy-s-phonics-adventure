import React, { useState, useEffect, useRef } from 'react';
import GameCanvas from '../GameCanvas';
import SpellingBuildArea from '../SpellingBuildArea';
import { SIGHT_WORDS_SPELLING } from '../../data/sightWords';

const SIGHT_WORDS = SIGHT_WORDS_SPELLING;

export default function SightWordsSpellingMode({ studentData, onUpdateProgress }) {
  const [currentWord, setCurrentWord] = useState(null);
  const [options, setOptions] = useState([]);
  const [builtWord, setBuiltWord] = useState([]);
  const [score, setScore] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [usedIndices, setUsedIndices] = useState([]);
  const audioRef = useRef(null);
  const preloadedAudio = useRef({});

  const modeData = studentData?.mode_progress?.sight_words_spelling || {
    mastered_items: [],
    learning_items: ['el', 'la', 'un', 'una', 'en'],
    item_attempts: {},
    total_correct: 0,
    total_attempts: 0
  };

  const playSound = (word) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
    }
    if (!preloadedAudio.current[word]) {
      preloadedAudio.current[word] = new Audio(`/sight-word-audio/${encodeURIComponent(word)}.mp3`);
      preloadedAudio.current[word].preload = 'auto';
    }
    audioRef.current = preloadedAudio.current[word];
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(err => console.log('Audio play failed:', err));
  };

  const generateRound = () => {
    const learning = modeData.learning_items?.length > 0
      ? modeData.learning_items
      : ['el', 'la', 'un'];
    const attempts = modeData.item_attempts || {};

    // Weighted pick: words with fewer correct attempts get higher weight
    const weights = learning.map(w => {
      const stats = attempts[w] || { correct: 0, total: 0 };
      return Math.max(1, 5 - stats.correct);
    });
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let rand = Math.random() * totalWeight;
    let targetWord = learning[0];
    for (let i = 0; i < learning.length; i++) {
      rand -= weights[i];
      if (rand <= 0) { targetWord = learning[i]; break; }
    }

    const wordLetters = targetWord.split('');
    const letterCounts = {};
    wordLetters.forEach(l => letterCounts[l] = (letterCounts[l] || 0) + 1);

    const neededLetters = [];
    Object.entries(letterCounts).forEach(([letter, count]) => {
      for (let i = 0; i < count; i++) neededLetters.push(letter);
    });

    const allLettersInWord = 'abcdefghijklmnopqrstuvwxyz'.split('');
    const distractors = allLettersInWord
      .filter(l => !wordLetters.includes(l))
      .sort(() => Math.random() - 0.5)
      .slice(0, 4);

    const allLetters = [...neededLetters, ...distractors].sort(() => Math.random() - 0.5);

    setCurrentWord(targetWord);
    setOptions(allLetters.map((letter, idx) => ({ letter, id: idx })));
    setBuiltWord([]);
    setUsedIndices([]);
    setShowResult(false);
    playSound(targetWord);
  };

  const handleLetterClick = (letterObj) => {
    if (!usedIndices.includes(letterObj.id)) {
      setBuiltWord(prev => [...prev, letterObj.letter]);
      setUsedIndices(prev => [...prev, letterObj.id]);
    }
  };

  const handleUndo = () => {
    setBuiltWord(prev => prev.slice(0, -1));
    setUsedIndices(prev => prev.slice(0, -1));
  };

  const handleClear = () => {
    setBuiltWord([]);
    setUsedIndices([]);
  };

  const handleSubmit = async () => {
    const userWord = builtWord.join('');
    const correct = userWord === currentWord;
    setIsCorrect(correct);
    setShowResult(true);

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
      if (nextWord && updatedLearning.length < 5) {
        updatedLearning.push(nextWord);
      }
    }

    if (correct) setScore(prev => prev + 1);

    await onUpdateProgress('sight_words_spelling', {
      mastered_items: updatedMastered,
      learning_items: updatedLearning,
      item_attempts: attempts,
      total_correct: (modeData.total_correct || 0) + (correct ? 1 : 0),
      total_attempts: (modeData.total_attempts || 0) + 1,
      unlocked: true
    });

    setTimeout(() => {
      generateRound();
    }, 3000);
  };

  useEffect(() => {
    if (!currentWord) generateRound();
  }, []);

  if (!currentWord) return null;

  return (
    <>
      <GameCanvas
        currentLetter={currentWord}
        options={options}
        onAnswer={handleLetterClick}
        score={score}
        streak={0}
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
      />
    </>
  );
}