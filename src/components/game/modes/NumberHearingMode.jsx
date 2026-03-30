import React, { useState, useEffect, useRef } from 'react';
import GameCanvas from '../GameCanvas';

const ALL_NUMBERS = Array.from({ length: 21 }, (_, i) => i); // 0–20

// Generate place-value-aware distractors for a given number
const getDistractors = (num) => {
  const distractors = new Set();

  // 1. Reversed digits (key for place value: 12→21, 20→02, 13→31)
  if (num >= 10) {
    const digits = String(num).split('').reverse().join(''); // e.g. "12" → "21", "20" → "02"
    distractors.add(digits); // keep as string so "02" shows
  } else {
    // Single digit: add teen version (e.g. 2 → 12, 20)
    if (num > 0) distractors.add(String(num + 10));
  }

  // 2. Swap tens/ones: 12 → "21" already done; also add nearby
  if (num >= 10 && num <= 19) {
    // Add the "units only" version: 12 → "2"
    distractors.add(String(num - 10));
  }
  if (num === 20) {
    distractors.add('12');
    distractors.add('2');
  }

  // 3. Fill with ±1, ±2 neighbors (as strings, in range 0-20)
  const neighbors = [num - 1, num + 1, num - 2, num + 2]
    .filter(n => n >= 0 && n <= 20 && n !== num);
  for (const n of neighbors) {
    if (distractors.size >= 4) break;
    distractors.add(String(n));
  }

  // Remove the correct answer if it snuck in
  distractors.delete(String(num));

  return [...distractors].slice(0, 4);
};

export default function NumberHearingMode({ studentData, onUpdateProgress }) {
  const [currentNumber, setCurrentNumber] = useState(null);
  const [options, setOptions] = useState([]);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const audioRef = useRef(null);
  const audioCache = useRef({});

  const playSound = (num) => {
    const path = `/numbers-audio/${num}.mp3`;
    if (!audioCache.current[path]) {
      audioCache.current[path] = new Audio(path);
      audioCache.current[path].preload = 'auto';
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    audioRef.current = audioCache.current[path];
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => {});
  };

  const generateRound = () => {
    const num = ALL_NUMBERS[Math.floor(Math.random() * ALL_NUMBERS.length)];
    const distractors = getDistractors(num);
    const allOptions = [String(num), ...distractors].sort(() => Math.random() - 0.5);
    setCurrentNumber(num);
    setOptions(allOptions);
    playSound(num);
  };

  useEffect(() => {
    generateRound();
  }, []);

  const handleAnswer = (selected) => {
    const correct = selected === String(currentNumber);
    setIsCorrect(correct);
    setShowFeedback(true);
    if (correct) {
      setScore(s => s + 1);
      setStreak(s => s + 1);
    } else {
      setStreak(0);
    }
    setTimeout(() => {
      setShowFeedback(false);
      generateRound();
    }, 1500);
  };

  if (currentNumber === null) return null;

  return (
    <GameCanvas
      currentLetter={String(currentNumber)}
      options={options}
      onAnswer={handleAnswer}
      score={score}
      streak={streak}
      onPlaySound={() => playSound(currentNumber)}
      showFeedback={showFeedback}
      isCorrect={isCorrect}
      mode="catch"
    />
  );
}