import React, { useState, useEffect, useRef } from 'react';
import GameCanvas from '../GameCanvas';
import SpellingBuildArea, { countCorrectLetters } from '../SpellingBuildArea';
import SpellingWriteStep from '../SpellingWriteStep';
import { base44 } from '@/api/base44Client';

// Wide word pool — all module 1-9 words. Audio: /spelling-audio/{word}.mp3
export const SPELLING_WORDS = [
  // Module 1 — short vowels
  'ala', 'ama', 'amo', 'ana', 'osa', 'oso', 'una', 'uno', 'use', 'usa',
  // Module 2
  'baba', 'base', 'bate', 'bebé', 'besa', 'beso', 'boda', 'bola', 'bota',
  'dama', 'dame', 'debe', 'debo', 'dime', 'dona', 'duda', 'dudo',
  // Module 3
  'esa', 'ese', 'eso', 'fama', 'fina', 'fino',
  'la', 'lata', 'le', 'lima', 'lisa', 'liso', 'lo', 'lobo', 'lodo', 'loma', 'lomo', 'luna', 'lupa',
  // Module 4
  'mala', 'malo', 'mamá', 'mano', 'masa', 'me', 'mesa', 'mete', 'mi', 'mima', 'mimo', 'misa',
  'mona', 'mono', 'moto', 'muda', 'mudo',
  // Module 5
  'nada', 'nado', 'nana', 'nena', 'nene', 'ni', 'nido', 'no', 'nota', 'noto', 'nube', 'nudo',
  'ola', 'pala', 'palo', 'papa', 'papá', 'pasa', 'paso', 'pata', 'pato',
  // Module 6
  'pelo', 'pesa', 'peso', 'pila', 'pino', 'pisa', 'piso', 'poca', 'poco', 'polo', 'pone', 'puma',
  'sala', 'sana', 'sano', 'sapo', 'se', 'si', 'soba', 'sobo', 'soda', 'sola', 'solo', 'sopa',
  // Module 7
  'sube', 'suda', 'sudo', 'suma', 'sumo', 'supo',
  'tapa', 'tapo', 'te', 'tela', 'tema', 'ti', 'tina', 'toda', 'todo', 'toma', 'tomo', 'tubo', 'tuna',
  // Module 8
  'une', 'use', 'va', 've', 'vi', 'ya', 'yo', 'fe', 'de', 'di', 'su', 'tu',
  'dado', 'dodo', 'puso',
  // Module 9 — longer / harder
  'cama', 'cana', 'capa', 'cara', 'casa', 'cena', 'cima', 'cola', 'coma', 'copa', 'cota',
  'gana', 'gata', 'gato', 'gira', 'gota', 'guía',
  'rana', 'rabo', 'rama', 'ramo', 'ropa', 'rosa', 'ruta',
  'vaca', 'vale', 'vela', 'vida', 'vino', 'viva',
  'yema', 'yuca'
];

const DISTRACTOR_LETTERS = 'abcdefghijklmnopqrstuvwxyzáéíóúüñ'.split('');

// Weighted random pick favouring words seen fewer times correctly
function pickWord(modeData, lastWord) {
  const attempts = modeData.item_attempts || {};
  const mastered = new Set(modeData.mastered_items || []);
  const learning = modeData.learning_items || [];

  // Pool: all learning words + a random sample of not-yet-mastered global words
  const notMastered = SPELLING_WORDS.filter(w => !mastered.has(w));
  // Combine: learning first priority, then up to 20 more random unknown words
  const pool = [...new Set([...learning, ...notMastered.slice(0, 30)])];
  const candidates = pool.length > 1 ? pool.filter(w => w !== lastWord) : pool;

  if (!candidates.length) return pool[0] || SPELLING_WORDS[0];

  const weights = candidates.map(w => {
    const s = attempts[w] || { correct: 0, total: 0 };
    // Words seen less or with lower accuracy get more weight
    return Math.max(1, 8 - s.correct * 2);
  });

  const total = weights.reduce((a, b) => a + b, 0);
  let rand = Math.random() * total;
  for (let i = 0; i < candidates.length; i++) {
    rand -= weights[i];
    if (rand <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

export default function SpellingMode({ studentData, onUpdateProgress }) {
  const [phase, setPhase] = useState('write'); // 'write' | 'build'
  const [currentWord, setCurrentWord] = useState(null);
  const [options, setOptions] = useState([]);
  const [builtWord, setBuiltWord] = useState([]);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [usedIndices, setUsedIndices] = useState([]);
  const [pointsEarned, setPointsEarned] = useState(0);
  const [writtenStrokes, setWrittenStrokes] = useState(null);
  const audioRef = useRef(null);
  const preloadedAudio = useRef({});
  const submittingRef = useRef(false);
  const lastWordRef = useRef(null);

  const modeData = studentData?.mode_progress?.spelling || {
    mastered_items: [], learning_items: ['ala', 'ama', 'amo'],
    item_attempts: {}, total_correct: 0, total_attempts: 0
  };

  const playSound = (word) => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.onended = null; }
    if (!preloadedAudio.current[word]) {
      preloadedAudio.current[word] = new Audio(`/spelling-audio/${encodeURIComponent(word)}.mp3`);
      preloadedAudio.current[word].preload = 'auto';
    }
    audioRef.current = preloadedAudio.current[word];
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => {});
  };

  const buildOptions = (word) => {
    const wordLetters = word.split('');
    const letterCounts = {};
    wordLetters.forEach(l => { letterCounts[l] = (letterCounts[l] || 0) + 1; });
    const neededLetters = [];
    Object.entries(letterCounts).forEach(([letter, count]) => {
      for (let i = 0; i < count; i++) neededLetters.push(letter);
    });
    // Distractors: letters NOT in the word
    const distractors = DISTRACTOR_LETTERS
      .filter(l => !wordLetters.includes(l))
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.max(3, 6 - wordLetters.length));
    return [...neededLetters, ...distractors]
      .sort(() => Math.random() - 0.5)
      .map((letter, idx) => ({ letter, id: idx }));
  };

  const startRound = () => {
    const word = pickWord(modeData, lastWordRef.current);
    lastWordRef.current = word;
    setCurrentWord(word);
    setOptions(buildOptions(word));
    setBuiltWord([]);
    setUsedIndices([]);
    setShowResult(false);
    setPointsEarned(0);
    setPhase('write');
    setWrittenStrokes(null);
    submittingRef.current = false;
    playSound(word);
  };

  useEffect(() => { startRound(); }, []);

  const handleWriteDone = async (strokes, imageUrl) => {
    setWrittenStrokes(strokes);
    setPhase('build');
    // Save stroke sample (fire and forget) — strokes only, no large base64 image
    if (studentData) {
      base44.entities.SpellingWritingSample.create({
        student_number: studentData.student_number,
        class_name: studentData.class_name,
        mode: 'spelling',
        word: currentWord,
        strokes_data: JSON.stringify(strokes),
        was_correct: null,
      }).catch(() => {});
    }
  };

  const handleLetterClick = (letterObj) => {
    if (showResult || usedIndices.includes(letterObj.id)) return;
    setBuiltWord(prev => [...prev, letterObj.letter]);
    setUsedIndices(prev => [...prev, letterObj.id]);
  };

  const handleUndo = () => { if (showResult) return; setBuiltWord(p => p.slice(0, -1)); setUsedIndices(p => p.slice(0, -1)); };
  const handleClear = () => { if (showResult) return; setBuiltWord([]); setUsedIndices([]); };

  const handleSubmit = async () => {
    if (submittingRef.current || showResult) return;
    submittingRef.current = true;
    const userWord = builtWord.join('');
    const correct = userWord === currentWord;
    const pts = countCorrectLetters(builtWord, currentWord);
    setIsCorrect(correct);
    setShowResult(true);
    setPointsEarned(pts);
    if (correct) { setScore(s => s + pts); setStreak(s => s + 1); } else { setScore(s => s + pts); setStreak(0); }

    // Save progress
    const attempts = { ...modeData.item_attempts };
    const wordStats = attempts[currentWord] || { correct: 0, total: 0 };
    wordStats.total += 1;
    if (correct) wordStats.correct += 1;
    attempts[currentWord] = wordStats;
    let updatedMastered = [...(modeData.mastered_items || [])];
    let updatedLearning = [...(modeData.learning_items || [])];
    if (correct && wordStats.correct >= 4 && wordStats.correct / wordStats.total >= 0.75 && !updatedMastered.includes(currentWord)) {
      updatedMastered.push(currentWord);
      updatedLearning = updatedLearning.filter(w => w !== currentWord);
      // Add a new word to learning (keep up to 15 in pool)
      if (updatedLearning.length < 15) {
        const allKnown = new Set([...updatedMastered, ...updatedLearning]);
        const next = SPELLING_WORDS.find(w => !allKnown.has(w));
        if (next) updatedLearning.push(next);
      }
    }
    // Seed learning pool if too small
    if (updatedLearning.length < 8) {
      const allKnown = new Set([...updatedMastered, ...updatedLearning]);
      SPELLING_WORDS.filter(w => !allKnown.has(w)).slice(0, 8 - updatedLearning.length).forEach(w => updatedLearning.push(w));
    }
    await onUpdateProgress('spelling', {
      mastered_items: updatedMastered, learning_items: updatedLearning, item_attempts: attempts,
      total_correct: (modeData.total_correct || 0) + (correct ? 1 : 0),
      total_attempts: (modeData.total_attempts || 0) + 1, unlocked: true
    });
  };

  if (!currentWord) return null;

  if (phase === 'write') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-300 via-sky-200 to-green-200 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-lg bg-white/90 rounded-3xl shadow-2xl p-6">
          <SpellingWriteStep
            word={currentWord}
            onDone={handleWriteDone}
            onPlaySound={() => playSound(currentWord)}
          />
        </div>
      </div>
    );
  }

  return (
    <>
      <GameCanvas
        currentLetter={currentWord}
        options={options}
        onAnswer={handleLetterClick}
        score={score}
        streak={streak}
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
        onNext={showResult ? startRound : undefined}
        pointsEarned={pointsEarned}
      />
    </>
  );
}