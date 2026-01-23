import React, { useState, useEffect, useRef } from 'react';
import GameCanvas from '../GameCanvas';
import SpellingBuildArea from '../SpellingBuildArea';

const SIGHT_WORDS = ['the', 'and', 'a', 'to', 'said', 'in', 'he', 'I', 'of', 'it', 'was', 'you', 'they', 'on', 'she', 'is', 'for', 'at', 'his', 'but'];

export default function SightWordsSpellingMode({ studentData, onUpdateProgress }) {
  const [currentWord, setCurrentWord] = useState(null);
  const [options, setOptions] = useState([]);
  const [builtWord, setBuiltWord] = useState([]);
  const [score, setScore] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [usedIndices, setUsedIndices] = useState([]);
  const audioRef = useRef(null);

  const modeData = studentData?.mode_progress?.sight_words_spelling || {
    mastered_items: [],
    learning_items: ['the', 'and', 'a'],
    item_attempts: {},
    total_correct: 0,
    total_attempts: 0
  };

  const generateRound = () => {
    const mastered = modeData.mastered_items || [];
    const learning = modeData.learning_items || [];
    const allKnown = [...mastered, ...learning];
    const knownWords = allKnown.length > 0 ? allKnown : ['the', 'and', 'a'];
    
    const useKnown = Math.random() < 0.7;
    let targetWord;
    
    if (useKnown) {
      targetWord = knownWords[Math.floor(Math.random() * knownWords.length)];
    } else {
      const unknown = SIGHT_WORDS.filter(w => !knownWords.includes(w));
      targetWord = unknown[Math.floor(Math.random() * unknown.length)] || knownWords[0];
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
    setOptions(allLetters);
    setBuiltWord([]);
    setUsedIndices([]);
    setShowResult(false);
    playSound(targetWord);
  };

  const playSound = (word) => {
    if (audioRef.current) audioRef.current.pause();
    audioRef.current = new Audio(`/sight-word-audio/${word}.mp3`);
    audioRef.current.play().catch(err => console.log('Audio play failed'));
  };

  const handleLetterClick = (letter, index) => {
    const actualIndex = options.findIndex((l, idx) => l === letter && !usedIndices.includes(idx));
    if (actualIndex !== -1) {
      setBuiltWord(prev => [...prev, letter]);
      setUsedIndices(prev => [...prev, actualIndex]);
    }
  };

  const handleUndo = () => {
    if (builtWord.length > 0) {
      setBuiltWord(prev => prev.slice(0, -1));
      setUsedIndices(prev => prev.slice(0, -1));
    }
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

  const visibleOptions = options.filter((_, idx) => !usedIndices.includes(idx));

  return (
    <>
      <GameCanvas
        currentLetter={currentWord}
        options={visibleOptions}
        onAnswer={(letter) => {
          const actualIndex = options.findIndex((l, idx) => l === letter && !usedIndices.includes(idx));
          if (actualIndex !== -1) handleLetterClick(letter, actualIndex);
        }}
        score={score}
        streak={0}
        onPlaySound={() => playSound(currentWord)}
        showFeedback={false}
        isCorrect={false}
        mode="spelling"
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