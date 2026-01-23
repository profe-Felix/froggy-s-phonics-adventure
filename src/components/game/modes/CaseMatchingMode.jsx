import React, { useState, useEffect } from 'react';
import GameCanvas from '../GameCanvas';

const ALL_LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');

export default function CaseMatchingMode({ studentData, onUpdateProgress }) {
  const [currentLetter, setCurrentLetter] = useState(null);
  const [options, setOptions] = useState([]);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [selectedLetters, setSelectedLetters] = useState([]);

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
    
    const targetLetters = knownLetters.sort(() => Math.random() - 0.5).slice(0, 4);
    
    const allOptions = [];
    targetLetters.forEach(letter => {
      allOptions.push(letter.toLowerCase());
      allOptions.push(letter.toUpperCase());
    });
    
    setCurrentLetter(targetLetters[0]);
    setOptions(allOptions.sort(() => Math.random() - 0.5));
    setSelectedLetters([]);
  };

  const handleAnswer = async (selectedLetter, index) => {
    const newSelected = [...selectedLetters, selectedLetter];
    setSelectedLetters(newSelected);
    
    const newOptions = options.filter((_, idx) => 
      idx !== options.findIndex(l => l === selectedLetter && !selectedLetters.includes(l))
    );
    setOptions(newOptions);

    if (newSelected.length === 2) {
      const [first, second] = newSelected;
      const correct = first.toLowerCase() === second.toLowerCase() && first !== second;
      setIsCorrect(correct);
      setShowFeedback(true);

      const letterBase = first.toLowerCase();
      const attempts = { ...modeData.item_attempts };
      const letterStats = attempts[letterBase] || { correct: 0, total: 0 };
      letterStats.total += 1;
      if (correct) {
        letterStats.correct += 1;
        setScore(prev => prev + 1);
        setStreak(prev => prev + 1);
      } else {
        setStreak(0);
      }
      attempts[letterBase] = letterStats;

      let updatedMastered = [...(modeData.mastered_items || [])];
      let updatedLearning = [...(modeData.learning_items || [])];

      if (correct && letterStats.correct / letterStats.total >= 0.8 && letterStats.total >= 5 && !updatedMastered.includes(letterBase)) {
        updatedMastered.push(letterBase);
        updatedLearning = updatedLearning.filter(l => l !== letterBase);
        
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
    }
  };

  useEffect(() => {
    if (!currentLetter) generateRound();
  }, []);

  if (!currentLetter) return null;

  return (
    <div className="relative">
      <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-white/95 rounded-3xl shadow-xl p-6 z-10">
        <p className="text-xl text-gray-600 mb-2">Match uppercase with lowercase!</p>
        <div className="flex gap-4 justify-center mt-4">
          <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-green-600 rounded-xl shadow-lg flex items-center justify-center border-2 border-green-700">
            {selectedLetters[0] ? (
              <span className="text-4xl font-bold text-white">{selectedLetters[0]}</span>
            ) : (
              <span className="text-2xl text-white/50">?</span>
            )}
          </div>
          <div className="w-20 h-20 bg-gradient-to-br from-blue-400 to-blue-600 rounded-xl shadow-lg flex items-center justify-center border-2 border-blue-700">
            {selectedLetters[1] ? (
              <span className="text-4xl font-bold text-white">{selectedLetters[1]}</span>
            ) : (
              <span className="text-2xl text-white/50">?</span>
            )}
          </div>
        </div>
      </div>
      <GameCanvas
        currentLetter={currentLetter}
        options={options}
        onAnswer={handleAnswer}
        score={score}
        streak={streak}
        onPlaySound={() => {}}
        showFeedback={showFeedback}
        isCorrect={isCorrect}
        mode="case_matching"
        collectedLetters={selectedLetters}
      />
    </div>
  );
}