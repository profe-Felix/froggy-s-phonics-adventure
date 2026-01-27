import React, { useState, useEffect, useRef } from 'react';
import GameCanvas from '../GameCanvas';
import { SIGHT_WORDS_EASY } from '../../data/sightWords';

const SIGHT_WORDS = SIGHT_WORDS_EASY;

export default function SightWordsEasyMode({ studentData, onUpdateProgress }) {
  const [currentWord, setCurrentWord] = useState(null);
  const [options, setOptions] = useState([]);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const audioRef = useRef(null);
  const preloadedAudio = useRef({});

  const modeData = studentData?.mode_progress?.sight_words_easy || {
    mastered_items: [],
    learning_items: ['el', 'la', 'un'],
    item_attempts: {},
    total_correct: 0,
    total_attempts: 0
  };

  const generateRound = () => {
    const mastered = modeData.mastered_items || [];
    const learning = modeData.learning_items || [];
    const allKnown = [...mastered, ...learning];
    const knownWords = allKnown.length > 0 ? allKnown : ['el', 'la', 'un'];
    
    const useKnown = Math.random() < 0.7 || knownWords.length < 4;
    let targetWord;
    
    if (useKnown) {
      targetWord = knownWords[Math.floor(Math.random() * knownWords.length)];
    } else {
      const unknown = SIGHT_WORDS.filter(w => !knownWords.includes(w));
      targetWord = unknown[Math.floor(Math.random() * unknown.length)] || knownWords[0];
    }

    const wrongOptions = SIGHT_WORDS
      .filter(w => w !== targetWord)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);

    const allOptions = [targetWord, ...wrongOptions].sort(() => Math.random() - 0.5);
    
    setCurrentWord(targetWord);
    setOptions(allOptions);
    playSound(targetWord);
  };

  const playSound = (word) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
    }
    
    if (!preloadedAudio.current[word]) {
      preloadedAudio.current[word] = new Audio(`/sight-word-audio/${word}.mp3`);
      preloadedAudio.current[word].preload = 'auto';
    }
    
    audioRef.current = preloadedAudio.current[word];
    audioRef.current.currentTime = 0;
    audioRef.current.play()
      .catch(err => console.log('Audio play failed:', err));
  };

  const handleAnswer = async (selectedWord) => {
    const correct = selectedWord === currentWord;
    setIsCorrect(correct);
    setShowFeedback(true);

    const attempts = { ...modeData.item_attempts };
    const wordStats = attempts[currentWord] || { correct: 0, total: 0 };
    wordStats.total += 1;
    if (correct) {
      wordStats.correct += 1;
      setScore(prev => prev + 1);
      setStreak(prev => prev + 1);
    } else {
      setStreak(0);
    }
    attempts[currentWord] = wordStats;

    let updatedMastered = [...(modeData.mastered_items || [])];
    let updatedLearning = [...(modeData.learning_items || [])];

    if (correct && wordStats.correct / wordStats.total >= 0.8 && wordStats.total >= 5 && !updatedMastered.includes(currentWord)) {
      updatedMastered.push(currentWord);
      updatedLearning = updatedLearning.filter(w => w !== currentWord);
      
      const allKnown = [...updatedMastered, ...updatedLearning];
      const nextWord = SIGHT_WORDS.find(w => !allKnown.includes(w));
      if (nextWord && updatedLearning.length < 5) {
        updatedLearning.push(nextWord);
      }
    }

    await onUpdateProgress('sight_words_easy', {
      mastered_items: updatedMastered,
      learning_items: updatedLearning,
      item_attempts: attempts,
      total_correct: (modeData.total_correct || 0) + (correct ? 1 : 0),
      total_attempts: (modeData.total_attempts || 0) + 1,
      unlocked: true
    });

    setTimeout(() => {
      setShowFeedback(false);
      generateRound();
    }, 1500);
  };

  useEffect(() => {
    if (!currentWord) generateRound();
  }, []);

  if (!currentWord) return null;

  return (
    <GameCanvas
      currentLetter={currentWord}
      options={options}
      onAnswer={handleAnswer}
      score={score}
      streak={streak}
      onPlaySound={() => playSound(currentWord)}
      showFeedback={showFeedback}
      isCorrect={isCorrect}
      mode="catch"
    />
  );
}