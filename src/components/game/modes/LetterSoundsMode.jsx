import React, { useState, useEffect, useRef } from 'react';
import GameCanvas from '../GameCanvas';
import { LETTER_SOUNDS } from '../../data/letterSounds';

const ALL_LETTERS = LETTER_SOUNDS;

export default function LetterSoundsMode({ studentData, onUpdateProgress, onComplete }) {
  const [currentLetter, setCurrentLetter] = useState(null);
  const [options, setOptions] = useState([]);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [canAnswer, setCanAnswer] = useState(false);
  const audioRef = useRef(null);
  const preloadedAudio = useRef({});

  const modeData = studentData?.mode_progress?.letter_sounds || {
    mastered_items: [],
    learning_items: ['a', 'b', 'c'],
    item_attempts: {},
    total_correct: 0,
    total_attempts: 0
  };

  const generateRound = () => {
    setCanAnswer(false);
    const mastered = modeData.mastered_items || [];
    const learning = modeData.learning_items || [];
    const allKnown = [...mastered, ...learning];
    const knownLetters = allKnown.length > 0 ? allKnown : ['a', 'b', 'c'];
    
    const useKnown = Math.random() < 0.7 || knownLetters.length < 4;
    let targetLetter;
    
    if (useKnown) {
      targetLetter = knownLetters[Math.floor(Math.random() * knownLetters.length)];
    } else {
      const unknown = ALL_LETTERS.filter(l => !knownLetters.includes(l));
      targetLetter = unknown[Math.floor(Math.random() * unknown.length)] || knownLetters[0];
    }

    // Confusing pairs to avoid
    const confusingPairs = { 'c': ['k', 's'], 'k': ['c'], 's': ['c'], 'll': ['y'], 'y': ['ll'], 'b': ['v'], 'v': ['b'] };
    const avoidLetters = confusingPairs[targetLetter] || [];

    const wrongOptions = ALL_LETTERS
      .filter(l => l !== targetLetter && !avoidLetters.includes(l))
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);

    const allOptions = [targetLetter, ...wrongOptions].sort(() => Math.random() - 0.5);
    
    setCurrentLetter(targetLetter);
    setOptions(allOptions);
    playSound(targetLetter);
  };

  const playSound = (letter) => {
    setCanAnswer(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
    }
    
    if (!preloadedAudio.current[letter]) {
      preloadedAudio.current[letter] = new Audio(`/letter-sounds/${letter}.mp3`);
      preloadedAudio.current[letter].preload = 'auto';
    }
    
    audioRef.current = preloadedAudio.current[letter];
    audioRef.current.currentTime = 0;
    audioRef.current.onended = () => setCanAnswer(true);
    audioRef.current.play()
      .catch(err => {
        console.log('Audio play failed');
        setCanAnswer(true);
      });
  };

  const handleAnswer = async (selectedLetter) => {
    if (!canAnswer || showFeedback) return;
    
    const correct = selectedLetter === currentLetter;
    setIsCorrect(correct);
    setShowFeedback(true);
    setCanAnswer(false);

    const attempts = { ...modeData.item_attempts };
    const letterStats = attempts[currentLetter] || { correct: 0, total: 0 };
    letterStats.total += 1;
    if (correct) {
      letterStats.correct += 1;
      setScore(prev => prev + 1);
      setStreak(prev => prev + 1);
    } else {
      setStreak(0);
    }
    attempts[currentLetter] = letterStats;

    let updatedMastered = [...(modeData.mastered_items || [])];
    let updatedLearning = [...(modeData.learning_items || [])];

    if (correct && letterStats.correct / letterStats.total >= 0.8 && letterStats.total >= 5 && !updatedMastered.includes(currentLetter)) {
      updatedMastered.push(currentLetter);
      updatedLearning = updatedLearning.filter(l => l !== currentLetter);
      
      const allKnown = [...updatedMastered, ...updatedLearning];
      const nextLetter = ALL_LETTERS.find(l => !allKnown.includes(l));
      if (nextLetter && updatedLearning.length < 5) {
        updatedLearning.push(nextLetter);
      }
    }

    await onUpdateProgress('letter_sounds', {
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
    if (!currentLetter) generateRound();
    
    // Preload common letters
    const commonLetters = ['a', 'e', 'i', 'o', 'u', 'b', 'c', 'd', 'f', 'g'];
    commonLetters.forEach(letter => {
      if (!preloadedAudio.current[letter]) {
        preloadedAudio.current[letter] = new Audio(`/letter-sounds/${letter}.mp3`);
        preloadedAudio.current[letter].preload = 'auto';
      }
    });
  }, []);

  if (!currentLetter) return null;

  return (
    <GameCanvas
      currentLetter={currentLetter}
      options={options}
      onAnswer={handleAnswer}
      score={score}
      streak={streak}
      onPlaySound={() => playSound(currentLetter)}
      showFeedback={showFeedback}
      isCorrect={isCorrect}
      mode="catch"
      canAnswer={canAnswer}
    />
  );
}