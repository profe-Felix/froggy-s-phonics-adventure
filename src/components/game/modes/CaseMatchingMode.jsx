import React, { useState, useEffect } from 'react';
import GameCanvas from '../GameCanvas';

const ALL_LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');

export default function CaseMatchingMode({ studentData, onUpdateProgress }) {
  const [currentLetter, setCurrentLetter] = useState(null);
  const [targetCase, setTargetCase] = useState('upper'); // upper or lower
  const [options, setOptions] = useState([]);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  const modeData = studentData?.mode_progress?.case_matching || {
    mastered_items: [],
    learning_items: ['a', 'b', 'c'],
    item_attempts: {},
    total_correct: 0,
    total_attempts: 0
  };

  const generateRound = () => {
    const mastered = modeData.mastered_items || [];
    const learning = modeData.learning_items || [];
    const allKnown = [...mastered, ...learning];
    const knownLetters = allKnown.length > 0 ? allKnown : ['a', 'b', 'c'];
    
    const targetLetter = knownLetters[Math.floor(Math.random() * knownLetters.length)];
    const showUpperCase = Math.random() < 0.5;
    
    const wrongLetters = ALL_LETTERS
      .filter(l => l !== targetLetter)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);
    
    const allLetters = [targetLetter, ...wrongLetters].sort(() => Math.random() - 0.5);
    const displayOptions = allLetters.map(l => showUpperCase ? l.toLowerCase() : l.toUpperCase());
    
    setCurrentLetter(targetLetter);
    setTargetCase(showUpperCase ? 'upper' : 'lower');
    setOptions(displayOptions);
  };

  const handleAnswer = async (selectedLetter) => {
    const correct = selectedLetter.toLowerCase() === currentLetter;
    setIsCorrect(correct);
    setShowFeedback(true);

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

    await onUpdateProgress('case_matching', {
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
  }, []);

  if (!currentLetter) return null;

  const displayLetter = targetCase === 'upper' ? currentLetter.toUpperCase() : currentLetter;

  return (
    <div className="relative">
      <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-white/95 rounded-3xl shadow-xl p-6">
        <p className="text-xl text-gray-600 mb-2">Find the match for:</p>
        <div className="text-8xl font-bold text-green-600">{displayLetter}</div>
      </div>
      <GameCanvas
        currentLetter={displayLetter}
        options={options}
        onAnswer={handleAnswer}
        score={score}
        streak={streak}
        onPlaySound={() => {}}
        showFeedback={showFeedback}
        isCorrect={isCorrect}
        mode="catch"
      />
    </div>
  );
}