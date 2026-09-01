import React, { useState, useEffect, useRef } from 'react';
import GameCanvas from '../GameCanvas';
import LetterTracingCanvas from '../LetterTracingCanvas';
import { LETTER_WAYPOINTS } from '../../data/letterWaypoints';
import { LETTER_SOUNDS, LETTER_SOUNDS_EN } from '../../data/letterSounds';
import { getLanguage } from '@/lib/language';
import { AUDIO_BASE, toAudioName } from '@/lib/audio';
import { useCoinAward } from '@/hooks/useCoinAward';
import { base44 } from '@/api/base44Client';

export default function LetterSoundsMode({ studentData, onUpdateProgress, onComplete, onStudentPatch, targets }) {
  const [currentLetter, setCurrentLetter] = useState(null);
  const [options, setOptions] = useState([]);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);

  // Streak milestones: +4 coins at 5 in a row, another +4 at 10 in a row.
  const awardCoins = useCoinAward(studentData, onStudentPatch);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [canAnswer, setCanAnswer] = useState(false);
  // When set, a guided tracing canvas for the correct letter is shown over the
  // game — extra practice + sound feedback after a miss.
  const [traceLetter, setTraceLetter] = useState(null);

  // DB-loaded waypoints override the static fallback so the trace popup uses
  // the exact strokes the teacher authored in the tracing tool (which the
  // lesson step also uses). Without this, the popup renders the stale static
  // coordinates that don't match the current handwriting-line calibration.
  const [waypoints, setWaypoints] = useState(LETTER_WAYPOINTS);

  useEffect(() => {
    let cancelled = false;
    base44.entities.LetterWaypoint.list()
      .then((records) => {
        if (cancelled || !Array.isArray(records) || !records.length) return;
        setWaypoints((prev) => {
          const merged = { ...prev };
          for (const r of records) {
            if (!r.letter || !r.strokes_data) continue;
            try {
              const strokes = JSON.parse(r.strokes_data);
              if (Array.isArray(strokes) && strokes.length) {
                merged[r.letter] = { strokes, hint: r.hint || prev[r.letter]?.hint || '' };
              }
            } catch {}
          }
          return merged;
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

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

    if (targets && targets.length > 0) {
      targetPool = targets.filter(l => ALL_LETTERS.includes(l));
      if (targetPool.length === 0) targetPool = fallbackLearning;
    } else if (hasLearning && hasMastered) {
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

    // Shared TTS fallback so a missing recorded file never blocks the round.
    const ttsLang = language === 'en' ? 'en-US' : 'es-ES';
    const useTTS = () => {
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(letter);
        u.lang = ttsLang;
        u.rate = 0.75;
        u.onend = enable;
        u.onerror = enable;
        audioRef.current = { pause: () => window.speechSynthesis.cancel() };
        window.speechSynthesis.speak(u);
      } catch { enable(); }
    };

    if (language === 'en') {
      const url = `${AUDIO_BASE}/en/letters/fonemas/${letter.toLowerCase()}.mp3`;
      const audio = new Audio(url);
      audio.preload = 'auto';
      audio.onended = enable;
      audio.onerror = useTTS;
      audioRef.current = audio;
      audioTimeoutRef.current = setTimeout(enable, 3000);
      audio.play().catch(useTTS);
      return;
    }

    if (!preloadedAudio.current[letter]) {
      preloadedAudio.current[letter] = new Audio(`${AUDIO_BASE}/${language}/letters/fonemas/${letter.toLowerCase()}.mp3`)
      preloadedAudio.current[letter].preload = 'auto';
    }
    audioRef.current = preloadedAudio.current[letter];
    audioRef.current.currentTime = 0;
    audioRef.current.onended = enable;
    audioRef.current.onerror = useTTS;
    audioTimeoutRef.current = setTimeout(enable, 3000);
    audioRef.current.play().catch(useTTS);
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
      const newStreak = streak + 1;
      setStreak(newStreak);
      // Bonus coins for hot streaks: 4 at 5 in a row, another 4 at 10.
      if (newStreak === 5 || newStreak === 10) {
        awardCoins(4);
      }
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

    // Always drill letter formation — students trace the letter after EVERY
    // answer (right or wrong) so handwriting is reinforced alongside
    // recognition, not only after a miss. Falls back to the next round when
    // no waypoints exist for the letter. Trace the letter in the CASE the
    // student saw on the correct option (e.g. capital 'U' when the fly showed
    // 'U'), falling back to the lowercase form when that case has no waypoints.
    const correctOpt = options.find(o => o.letter === currentLetter);
    const displayCase = correctOpt?.display || currentLetter;
    const traceCase = waypoints[displayCase]?.strokes?.length ? displayCase : currentLetter;
    if (waypoints[traceCase]?.strokes?.length) {
      setTimeout(() => {
        setShowFeedback(false);
        setTraceLetter(traceCase);
      }, correct ? 700 : 900);
      return;
    }
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
          preloadedAudio.current[letter] = new Audio(`${AUDIO_BASE}/${language}/letters/fonemas/${letter.toLowerCase()}.mp3`)
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
    <>
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

      {/* Guided trace practice after a miss — reinforces the correct letter's
          shape and sound, then continues to the next round. */}
      {traceLetter && waypoints[traceLetter]?.strokes?.length && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white rounded-3xl shadow-2xl p-2 sm:p-3 w-full max-w-3xl h-[94vh] flex flex-col items-center gap-1">
            {/* Minimal header — just the letter, no extra instructional text, so
                the tracing canvas fills nearly the whole popup. */}
            <div className="flex items-center justify-between w-full shrink-0 px-1">
              <button
                onClick={() => {
                  setTraceLetter(null);
                  setTimeout(generateRound, 200);
                }}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold"
              >
                ✕
              </button>
              <div className="text-slate-800 font-black text-xl">
                {traceLetter}
              </div>
              <div className="w-8" />
            </div>

            <div className="flex-1 min-h-0 w-full flex items-center justify-center">
              <LetterTracingCanvas
                key={traceLetter}
                letter={traceLetter}
                strokes={waypoints[traceLetter].strokes}
                showGuide={true}
                lang={language}
                fillHeight
                onComplete={() => {
                  setTraceLetter(null);
                  setTimeout(generateRound, 400);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}