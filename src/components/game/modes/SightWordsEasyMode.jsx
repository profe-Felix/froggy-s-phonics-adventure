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

  const generateWordDistractors = (word, allWords) => {
    const VOWELS = 'aeiou';
    const distractors = new Set();

    // Type 1: swap a vowel
    for (let i = 0; i < word.length && distractors.size < 2; i++) {
      if (VOWELS.includes(word[i])) {
        const otherVowels = VOWELS.replace(word[i], '').split('');
        const newVowel = otherVowels[Math.floor(Math.random() * otherVowels.length)];
        const candidate = word.slice(0, i) + newVowel + word.slice(i + 1);
        if (!allWords.includes(candidate) && candidate !== word) distractors.add(candidate);
      }
    }

    // Type 2: shuffle a chunk of letters
    if (word.length >= 4 && distractors.size < 2) {
      const start = Math.floor(Math.random() * (word.length - 2));
      const chunk = word.slice(start, start + 3).split('').sort(() => Math.random() - 0.5).join('');
      const candidate = word.slice(0, start) + chunk + word.slice(start + 3);
      if (!allWords.includes(candidate) && candidate !== word && !distractors.has(candidate)) {
        distractors.add(candidate);
      }
    }

    // Fill remaining with more vowel swaps if needed
    for (let i = word.length - 1; i >= 0 && distractors.size < 2; i--) {
      if (VOWELS.includes(word[i])) {
        const otherVowels = VOWELS.replace(word[i], '').split('');
        for (const v of otherVowels) {
          const candidate = word.slice(0, i) + v + word.slice(i + 1);
          if (!allWords.includes(candidate) && candidate !== word && !distractors.has(candidate)) {
            distractors.add(candidate);
            break;
          }
        }
      }
    }

    return [...distractors].slice(0, 2);
  };

  const generateRound = () => {
    const mastered = modeData.mastered_items || [];
    const learning = modeData.learning_items || [];
    const allKnown = [...mastered, ...learning];
    const knownWords = allKnown.length > 0 ? allKnown : ['el', 'la', 'un'];
    
    // Always pick from known words (mastered + learning) — new words are only introduced via progress
    targetWord = knownWords[Math.floor(Math.random() * knownWords.length)];

    // 2 real-word distractors — only from words near the target in the ordered list
    const targetIndex = SIGHT_WORDS.indexOf(targetWord);
    const windowSize = 10;
    const nearbyWords = SIGHT_WORDS.slice(
      Math.max(0, targetIndex - windowSize),
      Math.min(SIGHT_WORDS.length, targetIndex + windowSize + 1)
    ).filter(w => w !== targetWord);
    const sameStart = nearbyWords.filter(w => w[0] === targetWord[0]);
    const otherNearby = nearbyWords.filter(w => w[0] !== targetWord[0]);
    const pool = [...sameStart.sort(() => Math.random() - 0.5), ...otherNearby.sort(() => Math.random() - 0.5)];
    const realDistractors = pool.slice(0, 2);

    // 2 letter-manipulation distractors
    const fakeDistractors = generateWordDistractors(targetWord, SIGHT_WORDS);

    const allOptions = [targetWord, ...realDistractors, ...fakeDistractors].sort(() => Math.random() - 0.5);
    
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
      preloadedAudio.current[word] = new Audio(`/sight-word-audio/${encodeURIComponent(word)}.mp3`);
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