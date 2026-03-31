import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import { LinkingCubesDisplay, LinkingCubesInteractive } from './LinkingCubes';
import OneLessMoreSpinner from './OneLessMoreSpinner';
import SimpleWritingCanvas from './SimpleWritingCanvas';

// PHASES:
// 'write_start'  → see cubes, write the number on canvas
// 'enter_start'  → digit pad to enter the number (single box, no hint)
// 'spin'         → spin the spinner
// 'build_result' → build new amount with interactive cubes, write the number
// 'enter_result' → digit pad for new number
// 'done'         → side-by-side summary

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function DigitPad({ onSubmit }) {
  const [built, setBuilt] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleDigit = (d) => {
    if (submitted || built.length >= 2) return;
    setBuilt(b => b + String(d));
  };

  const handleUndo = () => {
    if (submitted) return;
    setBuilt(b => b.slice(0, -1));
  };

  const handleSubmit = () => {
    if (!built || submitted) return;
    setSubmitted(true);
    onSubmit(parseInt(built));
  };

  return (
    <div className="flex flex-col items-center gap-3 w-full max-w-xs">
      {/* Single display box */}
      <div className={`w-24 h-24 rounded-2xl border-4 flex items-center justify-center text-5xl font-bold shadow-md
        ${submitted ? 'border-green-400 bg-green-50 text-green-700' : built ? 'border-sky-400 bg-white text-sky-700' : 'border-dashed border-sky-300 bg-sky-50 text-sky-200'}`}>
        {built || '?'}
      </div>

      {/* Digit pad */}
      <div className="grid grid-cols-5 gap-2 w-full">
        {DIGITS.map(d => (
          <motion.button
            key={d}
            whileTap={{ scale: 0.88 }}
            onClick={() => handleDigit(d)}
            disabled={submitted || built.length >= 2}
            className="h-14 rounded-2xl bg-white shadow-md text-2xl font-bold text-indigo-700 border-2 border-indigo-200 hover:border-indigo-400 disabled:opacity-40 transition-colors"
          >{d}</motion.button>
        ))}
      </div>

      <div className="flex gap-3 w-full">
        <button
          onClick={handleUndo}
          disabled={submitted || !built}
          className="flex-1 py-2.5 rounded-xl bg-white/80 text-gray-600 font-bold shadow disabled:opacity-30"
        >⌫ Undo</button>
        <button
          onClick={handleSubmit}
          disabled={submitted || !built}
          className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-bold shadow disabled:opacity-30 hover:bg-indigo-700"
        >✓ Submit</button>
      </div>
    </div>
  );
}

export default function OneLessMoreMode({ studentNumber, className: classProp, onBack }) {
  const [phase, setPhase] = useState('write_start');
  const [startNumber] = useState(() => Math.floor(Math.random() * 19) + 1);
  const [spinResult, setSpinResult] = useState(null);
  const [targetNumber, setTargetNumber] = useState(null);
  const [builtCount, setBuiltCount] = useState(0);
  const [startWritten, setStartWritten] = useState(null);
  const [resultWritten, setResultWritten] = useState(null);
  const [saving, setSaving] = useState(false);

  const handleSpinResult = (result) => {
    setSpinResult(result);
    const target = result === 'more' ? startNumber + 1 : startNumber - 1;
    setTargetNumber(target);
    setBuiltCount(startNumber);
    setTimeout(() => setPhase('build_result'), 1000);
  };

  const handleResultSubmit = async (num) => {
    setResultWritten(num);
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-400 to-indigo-500 flex flex-col items-center py-6 px-4">
      <div className="w-full max-w-lg">
        <div className="flex items-center justify-between mb-5">
          <button onClick={onBack} className="text-white/80 hover:text-white font-medium">← Back</button>
          <h1 className="text-xl font-bold text-white">🧊 1 More / 1 Less</h1>
          <span className="text-white/70 text-sm">#{studentNumber}</span>
        </div>

        <AnimatePresence mode="wait">

          {/* PHASE: Write starting number */}
          {phase === 'write_start' && (
            <motion.div key="write_start" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="bg-white rounded-3xl p-6 shadow-2xl flex flex-col items-center gap-5">
              <p className="text-lg font-bold text-gray-600">How many cubes do you see? Write it!</p>
              <div className="bg-sky-50 rounded-2xl p-4 border border-sky-200">
                <LinkingCubesDisplay count={startNumber} />
              </div>
              <SimpleWritingCanvas onDone={() => setPhase('enter_start')} />
            </motion.div>
          )}

          {/* PHASE: Enter starting number with digit pad */}
          {phase === 'enter_start' && (
            <motion.div key="enter_start" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="bg-white rounded-3xl p-6 shadow-2xl flex flex-col items-center gap-5">
              <p className="text-lg font-bold text-gray-600">What number is it?</p>
              <div className="bg-sky-50 rounded-2xl p-4 border border-sky-200">
                <LinkingCubesDisplay count={startNumber} />
              </div>
              <DigitPad onSubmit={(num) => { setStartWritten(num); setPhase('spin'); }} />
            </motion.div>
          )}

          {/* PHASE: Spin */}
          {phase === 'spin' && (
            <motion.div key="spin" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="bg-white rounded-3xl p-6 shadow-2xl flex flex-col items-center gap-5">
              <p className="text-lg font-bold text-gray-600">Spin the wheel!</p>
              <OneLessMoreSpinner onResult={handleSpinResult} />
            </motion.div>
          )}

          {/* PHASE: Build result + write it */}
          {phase === 'build_result' && (
            <motion.div key="build_result" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="bg-white rounded-3xl p-6 shadow-2xl flex flex-col items-center gap-5">
              <div className={`px-4 py-2 rounded-xl font-bold text-lg ${spinResult === 'more' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}`}>
                1 {spinResult === 'more' ? 'More ➕' : 'Less ➖'}
              </div>
              <p className="text-gray-500 text-sm text-center">Use + and − to build the new amount, then write it!</p>
              <div className="bg-sky-50 rounded-2xl p-4 border border-sky-200">
                <LinkingCubesInteractive count={builtCount} onChange={setBuiltCount} max={20} min={0} />
              </div>
              <SimpleWritingCanvas onDone={() => setPhase('enter_result')} />
            </motion.div>
          )}

          {/* PHASE: Enter result number */}
          {phase === 'enter_result' && (
            <motion.div key="enter_result" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="bg-white rounded-3xl p-6 shadow-2xl flex flex-col items-center gap-5">
              <div className={`px-4 py-2 rounded-xl font-bold text-lg ${spinResult === 'more' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}`}>
                1 {spinResult === 'more' ? 'More ➕' : 'Less ➖'}
              </div>
              <div className="bg-sky-50 rounded-2xl p-4 border border-sky-200">
                <LinkingCubesDisplay count={builtCount} />
              </div>
              <p className="text-gray-500 text-sm">What number did you build?</p>
              <DigitPad onSubmit={handleResultSubmit} />
              {saving && <p className="text-indigo-400 animate-pulse text-sm">Saving…</p>}
            </motion.div>
          )}

          {/* PHASE: Done — side by side */}
          {phase === 'done' && (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="bg-white rounded-3xl p-6 shadow-2xl flex flex-col items-center gap-6">
              <div className="text-4xl">🎉</div>
              <p className="font-bold text-gray-700 text-lg">Here's what you did!</p>
              <div className="flex gap-4 items-center justify-center flex-wrap">
                <div className="flex flex-col items-center gap-2 bg-gray-50 rounded-2xl p-4 border">
                  <p className="text-xs font-bold text-gray-400 uppercase">Starting</p>
                  <LinkingCubesDisplay count={startNumber} />
                  <div className={`text-2xl font-bold ${startWritten === startNumber ? 'text-green-600' : 'text-red-500'}`}>
                    {startWritten} {startWritten === startNumber ? '✓' : `✗ (${startNumber})`}
                  </div>
                </div>
                <div className="text-3xl font-bold text-indigo-300">{spinResult === 'more' ? '+1' : '−1'}</div>
                <div className="flex flex-col items-center gap-2 bg-gray-50 rounded-2xl p-4 border">
                  <p className="text-xs font-bold text-gray-400 uppercase">New Amount</p>
                  <LinkingCubesDisplay count={targetNumber} highlightLast />
                  <div className={`text-2xl font-bold ${resultWritten === targetNumber ? 'text-green-600' : 'text-red-500'}`}>
                    {resultWritten} {resultWritten === targetNumber ? '✓' : `✗ (${targetNumber})`}
                  </div>
                </div>
              </div>
              <button
                onClick={() => window.location.reload()}
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