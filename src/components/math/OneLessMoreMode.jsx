import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import LinkingCubes from './LinkingCubes';
import OneLessMoreSpinner from './OneLessMoreSpinner';

// PHASES:
// 1. 'view_start'  - see starting cubes, write the number
// 2. 'spin'        - spin the spinner
// 3. 'view_result' - see result cubes, write the new number
// 4. 'done'        - show both side by side, save data, offer next round

const CANVAS_W = 220;
const CANVAS_H = 130;

function WritingCanvas({ onSubmit, placeholder }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [value, setValue] = useState('');

  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  };

  const startDraw = (e) => {
    e.preventDefault();
    drawing.current = true;
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e) => {
    e.preventDefault();
    if (!drawing.current) return;
    const ctx = canvasRef.current.getContext('2d');
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1e293b';
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasStrokes(true);
  };

  const endDraw = () => { drawing.current = false; };

  const clear = () => {
    const ctx = canvasRef.current.getContext('2d');
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    setHasStrokes(false);
  };

  const handleSubmit = () => {
    const imageUrl = canvasRef.current.toDataURL('image/png');
    onSubmit(parseInt(value) || null, imageUrl);
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-sm text-gray-500 font-medium">{placeholder}</p>
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className="border-2 border-dashed border-indigo-300 rounded-xl bg-white touch-none"
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={endDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={endDraw}
      />
      <div className="flex gap-2 items-center">
        <input
          type="number"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="Type answer"
          className="w-24 border-2 border-indigo-200 rounded-lg px-3 py-2 text-center text-xl font-bold focus:outline-none focus:border-indigo-500"
        />
        <button onClick={clear} className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg">Clear</button>
        <button
          onClick={handleSubmit}
          disabled={!value}
          className="px-5 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition"
        >
          ✓ Submit
        </button>
      </div>
    </div>
  );
}

export default function OneLessMoreMode({ studentNumber, className: classNameProp, onBack }) {
  const [phase, setPhase] = useState('view_start');
  const [startNumber, setStartNumber] = useState(() => Math.floor(Math.random() * 19) + 1);
  const [spinResult, setSpinResult] = useState(null); // 'more' | 'less'
  const [targetNumber, setTargetNumber] = useState(null);
  const [startWritten, setStartWritten] = useState(null);
  const [startCanvas, setStartCanvas] = useState(null);
  const [resultWritten, setResultWritten] = useState(null);
  const [resultCanvas, setResultCanvas] = useState(null);
  const [saving, setSaving] = useState(false);
  const [roundCount, setRoundCount] = useState(0);

  const handleStartSubmit = (num, imgUrl) => {
    setStartWritten(num);
    setStartCanvas(imgUrl);
    setPhase('spin');
  };

  const handleSpinResult = (result) => {
    setSpinResult(result);
    const target = result === 'more' ? startNumber + 1 : startNumber - 1;
    setTargetNumber(target);
    // Small delay so they see the result, then move on
    setTimeout(() => setPhase('view_result'), 1200);
  };

  const handleResultSubmit = async (num, imgUrl) => {
    setResultWritten(num);
    setResultCanvas(imgUrl);
    setSaving(true);
    try {
      await base44.entities.OneLessMoreAttempt.create({
        student_number: studentNumber,
        class_name: classNameProp,
        starting_number: startNumber,
        spinner_result: spinResult,
        target_number: targetNumber,
        student_wrote_start: startWritten,
        student_wrote_result: num,
        is_correct_start: startWritten === startNumber,
        is_correct_result: num === targetNumber,
        start_canvas_url: startCanvas,
        result_canvas_url: imgUrl,
      });
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
    setPhase('done');
  };

  const nextRound = () => {
    let next = Math.floor(Math.random() * 19) + 1;
    setStartNumber(next);
    setSpinResult(null);
    setTargetNumber(null);
    setStartWritten(null);
    setStartCanvas(null);
    setResultWritten(null);
    setResultCanvas(null);
    setRoundCount(r => r + 1);
    setPhase('view_start');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-400 to-indigo-500 flex flex-col items-center py-6 px-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button onClick={onBack} className="text-white/80 hover:text-white font-medium">← Back</button>
          <h1 className="text-2xl font-bold text-white">🧊 1 More / 1 Less</h1>
          <span className="text-white/70 text-sm">#{studentNumber}</span>
        </div>

        <AnimatePresence mode="wait">

          {/* PHASE 1: View start number, write it */}
          {phase === 'view_start' && (
            <motion.div key="view_start" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="bg-white rounded-3xl p-6 shadow-2xl flex flex-col items-center gap-6">
              <p className="text-lg font-bold text-gray-600">How many cubes do you see?</p>
              <div className="bg-sky-50 rounded-2xl p-4 border border-sky-200">
                <LinkingCubes count={startNumber} />
              </div>
              <WritingCanvas
                placeholder="Write the number you see, then type it below"
                onSubmit={handleStartSubmit}
              />
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

          {/* PHASE 3: View result, write it */}
          {phase === 'view_result' && (
            <motion.div key="view_result" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="bg-white rounded-3xl p-6 shadow-2xl flex flex-col items-center gap-6">
              <div className={`px-4 py-2 rounded-xl font-bold text-lg ${spinResult === 'more' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}`}>
                1 {spinResult === 'more' ? 'More ➕' : 'Less ➖'}
              </div>
              <p className="text-gray-500 text-sm">Build the new amount. How many now?</p>
              <div className="bg-sky-50 rounded-2xl p-4 border border-sky-200">
                <LinkingCubes count={targetNumber} highlightLast={true} />
              </div>
              <WritingCanvas
                placeholder="Write the new number, then type it below"
                onSubmit={handleResultSubmit}
              />
              {saving && <p className="text-indigo-500 animate-pulse text-sm">Saving…</p>}
            </motion.div>
          )}

          {/* PHASE 4: Done — show side by side */}
          {phase === 'done' && (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="bg-white rounded-3xl p-6 shadow-2xl flex flex-col items-center gap-6">
              <div className="text-3xl">🎉</div>
              <p className="font-bold text-gray-700 text-lg">Great job! Here's what you did:</p>

              <div className="flex gap-6 items-start justify-center flex-wrap">
                {/* Starting */}
                <div className="flex flex-col items-center gap-3 bg-gray-50 rounded-2xl p-4 border">
                  <p className="text-sm font-bold text-gray-500">Starting</p>
                  <LinkingCubes count={startNumber} />
                  <div className={`text-2xl font-bold ${startWritten === startNumber ? 'text-green-600' : 'text-red-500'}`}>
                    {startWritten ?? '?'} {startWritten === startNumber ? '✓' : `✗ (was ${startNumber})`}
                  </div>
                  {startCanvas && <img src={startCanvas} alt="start writing" className="w-36 rounded-lg border" />}
                </div>

                <div className="flex flex-col items-center justify-center text-3xl font-bold text-indigo-400 mt-8">
                  {spinResult === 'more' ? '➕1' : '➖1'}
                </div>

                {/* Result */}
                <div className="flex flex-col items-center gap-3 bg-gray-50 rounded-2xl p-4 border">
                  <p className="text-sm font-bold text-gray-500">New Amount</p>
                  <LinkingCubes count={targetNumber} />
                  <div className={`text-2xl font-bold ${resultWritten === targetNumber ? 'text-green-600' : 'text-red-500'}`}>
                    {resultWritten ?? '?'} {resultWritten === targetNumber ? '✓' : `✗ (was ${targetNumber})`}
                  </div>
                  {resultCanvas && <img src={resultCanvas} alt="result writing" className="w-36 rounded-lg border" />}
                </div>
              </div>

              <button
                onClick={nextRound}
                className="mt-2 px-8 py-4 bg-indigo-600 text-white font-bold text-xl rounded-2xl hover:bg-indigo-700 active:scale-95 transition-all shadow-lg"
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