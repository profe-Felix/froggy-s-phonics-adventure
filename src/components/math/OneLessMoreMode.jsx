import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import { LinkingCubesDisplay, LinkingCubesInteractive } from './LinkingCubes';
import OneLessMoreSpinner from './OneLessMoreSpinner';

// PHASES:
// 'view_start'  → see starting cubes, enter the number with digit pad
// 'spin'        → spin the spinner
// 'build_result'→ build the new amount with interactive cubes, enter number with digit pad
// 'done'        → side-by-side summary

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

function DigitPad({ target, onCorrect, onWrong }) {
  const [built, setBuilt] = useState([]);
  const [result, setResult] = useState(null); // null | 'correct' | 'wrong'
  const targetStr = String(target);

  const handleDigit = (d) => {
    if (result) return;
    const next = [...built, String(d)];
    setBuilt(next);
    if (next.length === targetStr.length) {
      const correct = next.join('') === targetStr;
      setResult(correct ? 'correct' : 'wrong');
      setTimeout(() => {
        if (correct) onCorrect(parseInt(next.join('')));
        else { setBuilt([]); setResult(null); onWrong(parseInt(next.join(''))); }
      }, 900);
    }
  };

  const handleUndo = () => { if (!result) setBuilt(b => b.slice(0, -1)); };

  return (
    <div className="flex flex-col items-center gap-3 w-full max-w-xs">
      {/* Display boxes */}
      <div className="flex gap-3 justify-center">
        {Array.from({ length: targetStr.length }).map((_, i) => {
          const digit = built[i];
          return (
            <motion.div
              key={i}
              animate={result ? { scale: [1, 1.2, 1] } : {}}
              className={`w-20 h-24 rounded-2xl border-4 flex items-center justify-center text-5xl font-bold shadow-md
                ${digit !== undefined
                  ? result === 'correct' ? 'border-green-400 bg-green-50 text-green-700'
                    : result === 'wrong' ? 'border-red-400 bg-red-50 text-red-600'
                    : 'border-sky-400 bg-white text-sky-700'
                  : i === built.length
                    ? 'border-dashed border-sky-400 bg-sky-50'
                    : 'border-dashed border-gray-300 bg-gray-50'
                }`}
            >{digit ?? ''}</motion.div>
          );
        })}
      </div>
      {result === 'correct' && <p className="text-green-600 font-bold text-xl">🎉 ¡Correcto!</p>}
      {result === 'wrong' && <p className="text-red-500 font-bold text-xl">Try again!</p>}
      {/* Digit pad */}
      <div className="grid grid-cols-5 gap-2 w-full">
        {DIGITS.map(d => (
          <motion.button
            key={d}
            whileTap={{ scale: 0.88 }}
            onClick={() => handleDigit(d)}
            disabled={!!result || built.length >= targetStr.length}
            className="h-14 rounded-2xl bg-white shadow-md text-2xl font-bold text-indigo-700 border-2 border-indigo-200 hover:border-indigo-400 disabled:opacity-40 transition-colors"
          >{d}</motion.button>
        ))}
      </div>
      <button
        onClick={handleUndo}
        disabled={!!result || built.length === 0}
        className="w-full py-2.5 rounded-xl bg-white/70 text-gray-600 font-bold shadow disabled:opacity-30"
      >⌫ Undo</button>
    </div>
  );
}

export default function OneLessMoreMode({ studentNumber, className: classProp, onBack }) {
  const [phase, setPhase] = useState('view_start');
  const [startNumber] = useState(() => Math.floor(Math.random() * 19) + 1);
  const [spinResult, setSpinResult] = useState(null);
  const [targetNumber, setTargetNumber] = useState(null);
  const [builtCount, setBuiltCount] = useState(0);
  const [startWritten, setStartWritten] = useState(null);
  const [resultWritten, setResultWritten] = useState(null);
  const [wrongStart, setWrongStart] = useState(false);
  const [saving, setSaving] = useState(false);

  // Phase 1: student enters starting number
  const handleStartCorrect = (num) => {
    setStartWritten(num);
    setPhase('spin');
  };

  // Phase 2: spinner done
  const handleSpinResult = (result) => {
    setSpinResult(result);
    const target = result === 'more' ? startNumber + 1 : startNumber - 1;
    setTargetNumber(target);
    setBuiltCount(startNumber); // start with starting count — student adds/removes 1
    setTimeout(() => setPhase('build_result'), 1000);
  };

  // Phase 3: student submits their built number and writes it
  const handleResultCorrect = async (num) => {
    setResultWritten(num);
    const isCorrectBuild = builtCount === targetNumber;
    setSaving(true);
    try {
      await base44.entities.OneLessMoreAttempt.create({
        student_number: studentNumber,
        class_name: classProp,
        starting_number: startNumber,
        spinner_result: spinResult,
        target_number: targetNumber,
        student_wrote_start: startWritten,
        student_wrote_result: num,
        is_correct_start: startWritten === startNumber,
        is_correct_result: num === targetNumber,
      });
    } catch (e) { console.error(e); }
    setSaving(false);
    setPhase('done');
  };

  const handleNextRound = () => {
    window.location.reload(); // simplest reset for now
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-400 to-indigo-500 flex flex-col items-center py-6 px-4">
      <div className="w-full max-w-lg">
        <div className="flex items-center justify-between mb-5">
          <button onClick={onBack} className="text-white/80 hover:text-white font-medium">← Back</button>
          <h1 className="text-xl font-bold text-white">🧊 1 More / 1 Less</h1>
          <span className="text-white/70 text-sm">#{studentNumber}</span>
        </div>

        <AnimatePresence mode="wait">

          {/* PHASE 1: View starting cubes, enter the number */}
          {phase === 'view_start' && (
            <motion.div key="view_start" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="bg-white rounded-3xl p-6 shadow-2xl flex flex-col items-center gap-6">
              <p className="text-lg font-bold text-gray-600">How many cubes do you see?</p>
              <div className="bg-sky-50 rounded-2xl p-5 border border-sky-200">
                <LinkingCubesDisplay count={startNumber} />
              </div>
              <p className="text-sm text-gray-400">Press the digits to enter your answer:</p>
              <DigitPad target={startNumber} onCorrect={handleStartCorrect} onWrong={() => setWrongStart(true)} />
            </motion.div>
          )}

          {/* PHASE 2: Spin */}
          {phase === 'spin' && (
            <motion.div key="spin" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="bg-white rounded-3xl p-6 shadow-2xl flex flex-col items-center gap-6">
              <p className="text-lg font-bold text-gray-600">Spin the wheel!</p>
              <OneLessMoreSpinner onResult={handleSpinResult} />
            </motion.div>
          )}

          {/* PHASE 3: Build result with interactive cubes, enter number */}
          {phase === 'build_result' && (
            <motion.div key="build_result" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="bg-white rounded-3xl p-6 shadow-2xl flex flex-col items-center gap-6">
              <div className={`px-4 py-2 rounded-xl font-bold text-lg ${spinResult === 'more' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}`}>
                1 {spinResult === 'more' ? 'More ➕' : 'Less ➖'}
              </div>
              <p className="text-gray-500 text-sm text-center">Use the + and − buttons to build the new amount,<br/>then enter the number.</p>
              <div className="bg-sky-50 rounded-2xl p-5 border border-sky-200">
                <LinkingCubesInteractive count={builtCount} onChange={setBuiltCount} max={20} min={0} />
              </div>
              <p className="text-sm text-gray-400">Now enter the number you built:</p>
              <DigitPad target={targetNumber} onCorrect={handleResultCorrect} onWrong={() => {}} />
              {saving && <p className="text-indigo-400 animate-pulse text-sm">Saving…</p>}
            </motion.div>
          )}

          {/* PHASE 4: Done — side by side */}
          {phase === 'done' && (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="bg-white rounded-3xl p-6 shadow-2xl flex flex-col items-center gap-6">
              <div className="text-4xl">🎉</div>
              <p className="font-bold text-gray-700 text-lg">Here's what you did!</p>
              <div className="flex gap-4 items-center justify-center flex-wrap">
                {/* Starting */}
                <div className="flex flex-col items-center gap-2 bg-gray-50 rounded-2xl p-4 border">
                  <p className="text-xs font-bold text-gray-400 uppercase">Starting</p>
                  <LinkingCubesDisplay count={startNumber} />
                  <div className={`text-2xl font-bold ${startWritten === startNumber ? 'text-green-600' : 'text-red-500'}`}>
                    {startNumber} {startWritten === startNumber ? '✓' : '✗'}
                  </div>
                </div>
                <div className="text-3xl font-bold text-indigo-300">{spinResult === 'more' ? '+1' : '−1'}</div>
                {/* Result */}
                <div className="flex flex-col items-center gap-2 bg-gray-50 rounded-2xl p-4 border">
                  <p className="text-xs font-bold text-gray-400 uppercase">New Amount</p>
                  <LinkingCubesDisplay count={targetNumber} highlightLast />
                  <div className={`text-2xl font-bold ${resultWritten === targetNumber ? 'text-green-600' : 'text-red-500'}`}>
                    {targetNumber} {resultWritten === targetNumber ? '✓' : '✗'}
                  </div>
                </div>
              </div>
              <button
                onClick={handleNextRound}
                className="px-8 py-4 bg-indigo-600 text-white font-bold text-xl rounded-2xl hover:bg-indigo-700 active:scale-95 transition-all shadow-lg"
              >
                Next Round 🎲
              </button>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}