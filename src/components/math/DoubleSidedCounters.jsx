import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Generate a random number of red counters (rest are yellow) for a total count in 11-20
function generateCounters(total) {
  const red = Math.floor(Math.random() * (total - 1)) + 1; // at least 1 red, at most total-1
  const yellow = total - red;
  const counters = [
    ...Array(red).fill('red'),
    ...Array(yellow).fill('yellow'),
  ];
  // Shuffle
  for (let i = counters.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [counters[i], counters[j]] = [counters[j], counters[i]];
  }
  return counters;
}

function randomTotal() {
  return Math.floor(Math.random() * 10) + 11; // 11-20
}

const COMPARISON_OPTIONS = ['Greater Than', 'Less Than', 'Equal To'];
const COMPARISON_SYMBOLS = { 'Greater Than': '>', 'Less Than': '<', 'Equal To': '=' };

function Counter({ color, index }) {
  return (
    <motion.div
      initial={{ scale: 0, rotate: Math.random() * 60 - 30, y: -80 }}
      animate={{ scale: 1, rotate: Math.random() * 20 - 10, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20, delay: index * 0.04 }}
      className="w-12 h-12 rounded-full border-4 shadow-lg flex items-center justify-center"
      style={{
        background: color === 'red'
          ? 'radial-gradient(circle at 35% 35%, #ff6b6b, #dc2626)'
          : 'radial-gradient(circle at 35% 35%, #fde68a, #ca8a04)',
        borderColor: color === 'red' ? '#991b1b' : '#92400e',
      }}
    />
  );
}

function NumberInput({ value, onChange, label, color }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-sm font-bold" style={{ color: color === 'red' ? '#dc2626' : '#ca8a04' }}>{label}</span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(Math.max(0, value - 1))}
          className="w-8 h-8 rounded-full font-bold text-white text-lg flex items-center justify-center"
          style={{ background: color === 'red' ? '#dc2626' : '#ca8a04' }}
        >−</button>
        <div className="w-14 h-14 rounded-2xl border-4 flex items-center justify-center text-3xl font-black"
          style={{ borderColor: color === 'red' ? '#dc2626' : '#ca8a04', color: color === 'red' ? '#dc2626' : '#ca8a04' }}>
          {value ?? '?'}
        </div>
        <button
          onClick={() => onChange(value + 1)}
          className="w-8 h-8 rounded-full font-bold text-white text-lg flex items-center justify-center"
          style={{ background: color === 'red' ? '#dc2626' : '#ca8a04' }}
        >+</button>
      </div>
    </div>
  );
}

export default function DoubleSidedCounters({ onBack }) {
  const [total, setTotal] = useState(null);
  const [counters, setCounters] = useState([]);
  const [shaking, setShaking] = useState(false);
  const [spilled, setSpilled] = useState(false);

  // Student inputs
  const [redInput, setRedInput] = useState(0);
  const [yellowInput, setYellowInput] = useState(0);
  const [selectedComparison, setSelectedComparison] = useState(null);

  // Feedback
  const [submitted, setSubmitted] = useState(false);
  const [feedback, setFeedback] = useState(null); // { redOk, yellowOk, compOk }

  // Round history (for the worksheet-style log)
  const [rounds, setRounds] = useState([]);

  const actualRed = counters.filter(c => c === 'red').length;
  const actualYellow = counters.filter(c => c === 'yellow').length;

  const shake = () => {
    if (shaking) return;
    const t = randomTotal();
    const c = generateCounters(t);
    setTotal(t);
    setCounters(c);
    setShaking(true);
    setSpilled(false);
    setSubmitted(false);
    setFeedback(null);
    setSelectedComparison(null);
    setRedInput(0);
    setYellowInput(0);
    setTimeout(() => {
      setShaking(false);
      setSpilled(true);
    }, 800);
  };

  const handleSubmit = () => {
    if (!spilled || selectedComparison === null) return;
    const redOk = redInput === actualRed;
    const yellowOk = yellowInput === actualYellow;
    const correctComp = actualRed > actualYellow ? 'Greater Than'
      : actualRed < actualYellow ? 'Less Than' : 'Equal To';
    const compOk = selectedComparison === correctComp;
    setFeedback({ redOk, yellowOk, compOk, correctComp, actualRed, actualYellow });
    setSubmitted(true);
    setRounds(r => [...r, {
      red: actualRed, yellow: actualYellow,
      studentRed: redInput, studentYellow: yellowInput,
      comparison: selectedComparison,
      correctComp,
      redOk, yellowOk, compOk,
    }]);
  };

  return (
    <div className="min-h-screen flex flex-col items-center gap-4 p-4"
      style={{ background: 'linear-gradient(135deg, #fef3c7 0%, #fde8e8 100%)' }}>

      {/* Header */}
      <div className="w-full max-w-2xl flex items-center gap-3">
        <button onClick={onBack} className="text-amber-700 hover:text-amber-900 font-bold text-sm">← Back</button>
        <h1 className="text-2xl font-black text-amber-900 flex-1 text-center">🟡🔴 Double-Sided Counters</h1>
      </div>

      {/* Cup & Shake button */}
      <motion.div className="flex flex-col items-center gap-3">
        <motion.div
          animate={shaking ? { rotate: [0, -20, 20, -20, 20, 0], y: [0, -10, 5, -10, 5, 0] } : {}}
          transition={{ duration: 0.7 }}
          className="relative"
        >
          {/* Cup SVG */}
          <svg width="100" height="110" viewBox="0 0 100 110">
            <path d="M15 10 L85 10 L72 100 L28 100 Z" fill="#d97706" stroke="#92400e" strokeWidth="3" />
            <path d="M15 10 L85 10" stroke="#92400e" strokeWidth="4" strokeLinecap="round" />
            <path d="M20 10 L16 40" stroke="#fbbf24" strokeWidth="2" opacity="0.5" />
            <path d="M35 10 L31 60" stroke="#fbbf24" strokeWidth="2" opacity="0.5" />
            {!spilled && Array.from({ length: Math.min(total || 0, 6) }).map((_, i) => (
              <circle key={i} cx={30 + (i % 3) * 20} cy={50 + Math.floor(i / 3) * 16}
                r="8" fill={i % 2 === 0 ? '#dc2626' : '#ca8a04'} stroke="#fff" strokeWidth="1.5" />
            ))}
          </svg>
        </motion.div>
        <button
          onClick={shake}
          disabled={shaking}
          className="px-8 py-3 rounded-2xl font-black text-white text-lg shadow-lg active:scale-95 transition-all disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg, #d97706, #dc2626)' }}
        >
          {shaking ? '🫙 Shaking…' : spilled ? '🔄 Shake Again' : '🫙 Shake & Spill!'}
        </button>
      </motion.div>

      {/* Spilled counters */}
      <AnimatePresence>
        {spilled && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full max-w-2xl rounded-3xl border-4 border-dashed border-amber-400 p-4"
            style={{ background: 'rgba(255,255,255,0.7)', minHeight: 120 }}
          >
            <p className="text-center text-xs font-bold text-amber-700 mb-2">Counters spilled! — {total} total</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {counters.map((c, i) => <Counter key={i} color={c} index={i} />)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Student input section */}
      <AnimatePresence>
        {spilled && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-2xl bg-white rounded-3xl shadow-xl p-6 flex flex-col gap-5"
          >
            {/* Count inputs */}
            <div className="flex justify-around items-center gap-4">
              <NumberInput value={redInput} onChange={setRedInput} label="Red" color="red" />
              <div className="flex flex-col items-center gap-1">
                <span className="text-gray-400 text-sm font-bold">vs</span>
                {submitted && feedback && (
                  <span className="text-2xl">{COMPARISON_SYMBOLS[feedback.correctComp]}</span>
                )}
              </div>
              <NumberInput value={yellowInput} onChange={setYellowInput} label="Yellow" color="yellow" />
            </div>

            {/* Comparison buttons */}
            <div className="flex flex-col gap-2">
              <p className="text-center text-sm font-bold text-gray-500">Circle One:</p>
              <div className="flex gap-3 justify-center flex-wrap">
                {COMPARISON_OPTIONS.map(opt => {
                  let bg = 'bg-gray-100 text-gray-700 border-gray-200';
                  if (selectedComparison === opt && !submitted) bg = 'bg-indigo-500 text-white border-indigo-500';
                  if (submitted && feedback) {
                    if (opt === feedback.correctComp) bg = 'bg-green-500 text-white border-green-500';
                    else if (opt === selectedComparison && !feedback.compOk) bg = 'bg-red-400 text-white border-red-400';
                    else bg = 'bg-gray-100 text-gray-400 border-gray-200';
                  }
                  return (
                    <button
                      key={opt}
                      onClick={() => !submitted && setSelectedComparison(opt)}
                      disabled={submitted}
                      className={`px-5 py-2.5 rounded-xl font-bold border-2 text-sm transition-all ${bg}`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Feedback */}
            {submitted && feedback && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-2xl p-4 flex flex-col gap-2 text-center"
                style={{ background: (feedback.redOk && feedback.yellowOk && feedback.compOk) ? '#dcfce7' : '#fef2f2' }}
              >
                <p className="text-2xl font-black">
                  {feedback.redOk && feedback.yellowOk && feedback.compOk ? '🎉 Perfect!' : '📝 Check your work!'}
                </p>
                <div className="flex justify-center gap-4 text-sm font-bold flex-wrap">
                  <span className={feedback.redOk ? 'text-green-600' : 'text-red-500'}>
                    Red: {feedback.actualRed} {feedback.redOk ? '✓' : `(you said ${feedback.studentRed || redInput})`}
                  </span>
                  <span className={feedback.yellowOk ? 'text-green-600' : 'text-red-500'}>
                    Yellow: {feedback.actualYellow} {feedback.yellowOk ? '✓' : `(you said ${feedback.studentYellow || yellowInput})`}
                  </span>
                  <span className={feedback.compOk ? 'text-green-600' : 'text-red-500'}>
                    {feedback.compOk ? `${selectedComparison} ✓` : `Answer: ${feedback.correctComp}`}
                  </span>
                </div>
              </motion.div>
            )}

            {/* Submit / Next */}
            {!submitted ? (
              <button
                onClick={handleSubmit}
                disabled={selectedComparison === null}
                className="py-3 rounded-2xl font-black text-white text-lg disabled:opacity-40 transition-all"
                style={{ background: 'linear-gradient(135deg, #4338ca, #7c3aed)' }}
              >
                ✅ Check My Answer
              </button>
            ) : (
              <button
                onClick={shake}
                className="py-3 rounded-2xl font-black text-white text-lg transition-all"
                style={{ background: 'linear-gradient(135deg, #d97706, #dc2626)' }}
              >
                🔄 New Round
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Round history */}
      {rounds.length > 0 && (
        <div className="w-full max-w-2xl bg-white rounded-3xl shadow p-4">
          <p className="font-black text-gray-700 mb-3 text-sm">📋 Round History</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="py-1 px-2 text-left text-red-500">Red</th>
                  <th className="py-1 px-2 text-center text-gray-500">Circle One</th>
                  <th className="py-1 px-2 text-right text-amber-600">Yellow</th>
                  <th className="py-1 px-2 text-center text-gray-400">Result</th>
                </tr>
              </thead>
              <tbody>
                {rounds.map((r, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className={`py-2 px-2 font-bold text-center ${r.redOk ? 'text-green-600' : 'text-red-400'}`}>
                      {r.actualRed}
                    </td>
                    <td className={`py-2 px-2 text-center font-bold ${r.compOk ? 'text-green-600' : 'text-red-400'}`}>
                      {r.comparison} {COMPARISON_SYMBOLS[r.comparison]}
                    </td>
                    <td className={`py-2 px-2 font-bold text-center ${r.yellowOk ? 'text-green-600' : 'text-amber-400'}`}>
                      {r.actualYellow}
                    </td>
                    <td className="py-2 px-2 text-center text-xl">
                      {r.redOk && r.yellowOk && r.compOk ? '✅' : '❌'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}