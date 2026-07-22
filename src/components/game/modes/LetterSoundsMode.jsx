import React, { useState, useEffect, useRef } from 'react';
import GameCanvas from '../GameCanvas';
import { LETTER_SOUNDS, LETTER_SOUNDS_EN } from '../../data/letterSounds';
import { getLanguage } from '@/lib/language';
import { AUDIO_BASE } from '@/lib/audio';

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

  const language = getLanguage(studentData);
  const ALL_LETTERS = language === 'en' ? LETTER_SOUNDS_EN : LETTER_SOUNDS;
  const FALLBACK_LEARNING = language === 'en' ? ['s', 'a', 't'] : ['o', 'i', 'a'];

  const modeData = studentData?.mode_progress?.letter_sounds || {
    mastered_items: [],
    learning_items: FALLBACK_LEARNING,
    item_attempts: {},
    total_correct: 0,
    total_attempts: 0
  };

  const generateRound = () => {
    setCanAnswer(false);
    const mastered = modeData.mastered_items || [];
    const learning = modeData.learning_items || [];

    const fallbackLearning = FALLBACK_LEARNING;
    // Drop letters that don't belong to the active language's set (e.g. ñ/ll/ch when English)
    const learningSet = learning.filter(l => ALL_LETTERS.includes(l));
    const hasLearning = learningSet.length > 0;
    const hasMastered = mastered.length > 0;

    // 80% learning letters, 20% mastered review.
    // If there are no learning letters, use fallback starting letters.
    // If there are no mastered letters, use learning only.
    let targetPool;

    if (hasLearning && hasMastered) {
      targetPool = Math.random() < 0.8 ? learningSet : mastered;
    } else if (hasLearning) {
      targetPool = learningSet;
    } else if (hasMastered) {
      targetPool = mastered;
    } else {
      targetPool = fallbackLearning;
    }

    const targetLetter = targetPool[Math.floor(Math.random() * targetPool.length)];

    // Confusing pairs to avoid
    const confusingPairs = language === 'en'
      ? { 'b': ['d'], 'd': ['b'], 'p': ['b', 'q'], 'q': ['p'], 'm': ['n'], 'n': ['m'], 'v': ['w'], 'w': ['v'], 'g': ['j'], 'j': ['g'], 'c': ['k'], 'k': ['c'], 's': ['c'], 'u': ['v'], 'i': ['l'] }
      : { 'c': ['k', 'c-soft'], 'k': ['c'], 'c-soft': ['c'], 'll': ['y'], 'y': ['ll'], 'b': ['v'], 'v': ['b'], 'r': ['r-soft'], 'r-soft': ['r'], 'g': ['g-soft', 'j'], 'g-soft': ['g', 'j'], 'j': ['g', 'g-soft'] };
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
      audioRef.current.pause?.();
      audioRef.current.onended = null;
    }
    if (audioTimeoutRef.current) clearTimeout(audioTimeoutRef.current);

    const enable = () => {
      if (audioTimeoutRef.current) clearTimeout(audioTimeoutRef.current);
      setCanAnswer(true);
    };

    if (language === 'en') {
      // English: prefer a recorded file in Supabase, fall back to browser TTS.
      const url = `${AUDIO_BASE}/en/letters/${encodeURIComponent(letter)}.mp3`;
      const audio = new Audio(url);
      audio.preload = 'auto';
      let settled = false;
      const useTTS = () => {
        if (settled) return; settled = true;
        try {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(letter);
          u.lang = 'en-US';
          u.rate = 0.75;
          u.onend = enable;
          u.onerror = enable;
          audioRef.current = { pause: () => window.speechSynthesis.cancel() };
          window.speechSynthesis.speak(u);
        } catch { enable(); }
      };
      audio.onended = enable;
      audio.onerror = useTTS;
      audioRef.current = audio;
      audioTimeoutRef.current = setTimeout(enable, 3000);
      audio.play().catch(useTTS);
      return;
    }

    if (!preloadedAudio.current[letter]) {
      preloadedAudio.current[letter] = new Audio(`${AUDIO_BASE}/${language}/letters/${encodeURIComponent(letter)}.mp3`);
      preloadedAudio.current[letter].preload = 'auto';
    }
    audioRef.current = preloadedAudio.current[letter];
    audioRef.current.currentTime = 0;
    audioRef.current.onended = enable;
    audioTimeoutRef.current = setTimeout(enable, 3000);
    audioRef.current.play().catch(enable);
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
    
    // Preload common letters (Spanish only — English uses speech synthesis)
    if (language !== 'en') {
      const commonLetters = ['a', 'e', 'i', 'o', 'u', 'b', 'c', 'd', 'f', 'g'];
      commonLetters.forEach(letter => {
        if (!preloadedAudio.current[letter]) {
          preloadedAudio.current[letter] = new Audio(`/letter-sounds/${letter}.mp3`);
          preloadedAudio.current[letter].preload = 'auto';
        }
      });
    }
    return () => { try { window.speechSynthesis?.cancel(); } catch {} };
  }, []);

  if (!currentLetter) return null;

  const handleRetry = () => {
    setShowFeedback(false);
    setIsCorrect(false);
    setCanAnswer(false);
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