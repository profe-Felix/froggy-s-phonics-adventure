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
  const audioTimeoutRef = useRef(null);

  const modeData = studentData?.mode_progress?.letter_sounds || {
    mastered_items: [],
    learning_items: ['o', 'i', 'a'],
    item_attempts: {},
    total_correct: 0,
    total_attempts: 0
  };

  const generateRound = () => {
    setCanAnswer(false);
    const mastered = modeData.mastered_items || [];
    const learning = modeData.learning_items || [];
    const allKnown = [...mastered, ...learning];
    const knownLetters = allKnown.length > 0 ? allKnown : ['o', 'i', 'a'];
    
    // Always pick target from known letters only — new letters introduced only via mastery progression
    const targetLetter = knownLetters[Math.floor(Math.random() * knownLetters.length)];

    // Confusing pairs to avoid
    const confusingPairs = { 'c': ['k', 'c-soft'], 'k': ['c'], 'c-soft': ['c'], 'll': ['y'], 'y': ['ll'], 'b': ['v'], 'v': ['b'], 'r': ['r-soft'], 'r-soft': ['r'], 'g': ['g-soft', 'j'], 'g-soft': ['g', 'j'], 'j': ['g', 'g-soft'] };
    const avoidLetters = confusingPairs[targetLetter] || [];

    const wrongOptions = ALL_LETTERS
      .filter(l => l !== targetLetter && !avoidLetters.includes(l))
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);

    const randomCase = (l) => Math.random() < 0.5 ? l.toUpperCase() : l;
    const allOptions = [targetLetter, ...wrongOptions]
      .sort(() => Math.random() - 0.5)
      .map(l => ({ letter: l, display: randomCase(l) }));
    
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
    if (audioTimeoutRef.current) clearTimeout(audioTimeoutRef.current);
    
    if (!preloadedAudio.current[letter]) {
      preloadedAudio.current[letter] = new Audio(`/letter-sounds/${letter}.mp3`);
      preloadedAudio.current[letter].preload = 'auto';
    }
    
    audioRef.current = preloadedAudio.current[letter];
    audioRef.current.currentTime = 0;
    audioRef.current.onended = () => {
      if (audioTimeoutRef.current) clearTimeout(audioTimeoutRef.current);
      setCanAnswer(true);
    };
    // Safety fallback: always enable answering after 3 seconds
    audioTimeoutRef.current = setTimeout(() => setCanAnswer(true), 3000);
    audioRef.current.play()
      .catch(() => {
        if (audioTimeoutRef.current) clearTimeout(audioTimeoutRef.current);
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
      
      // Add next letter in progression order
      const allKnown = [...updatedMastered, ...updatedLearning];
      const currentIndex = ALL_LETTERS.indexOf(currentLetter);
      const nextLettersInOrder = ALL_LETTERS.slice(currentIndex + 1);
      const nextLetter = nextLettersInOrder.find(l => !allKnown.includes(l));
      
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

    if (!correct) return; // wait for retry or auto-advance handled by onRetry
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

  const handleRetry = () => {
    setShowFeedback(false);
    playSound(currentLetter);
  };

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
      onRetry={handleRetry}
    />
  );
}