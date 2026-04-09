import { useState } from 'react';
import { motion } from 'framer-motion';

function DigitPad({ onSubmit }) {
  const [val, setVal] = useState('');
  const press = (d) => { if (val.length < 2) setVal(v => v + d); };
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-24 h-16 border-4 border-indigo-400 rounded-2xl flex items-center justify-center text-4xl font-black text-indigo-700 bg-white shadow-inner">
        {val || <span className="text-gray-300">?</span>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[1,2,3,4,5,6,7,8,9].map(d => (
          <button key={d} onClick={() => press(String(d))}
            className="w-14 h-14 bg-white border-2 border-indigo-200 rounded-xl font-black text-xl text-indigo-700 hover:bg-indigo-50 shadow">
            {d}
          </button>
        ))}
        <button onClick={() => setVal('')} className="w-14 h-14 bg-red-100 border-2 border-red-200 rounded-xl font-bold text-red-600 hover:bg-red-200 shadow">✕</button>
        <button onClick={() => press('0')} className="w-14 h-14 bg-white border-2 border-indigo-200 rounded-xl font-black text-xl text-indigo-700 hover:bg-indigo-50 shadow">0</button>
        <button onClick={() => setVal(v => v.slice(0, -1))} className="w-14 h-14 bg-gray-100 border-2 border-gray-200 rounded-xl font-bold text-gray-600 hover:bg-gray-200 shadow">⌫</button>
      </div>
      <motion.button whileTap={{ scale: 0.95 }} onClick={() => val && onSubmit(parseInt(val))}
        disabled={!val}
        className="bg-indigo-600 text-white font-black text-lg px-8 py-3 rounded-2xl shadow-lg disabled:opacity-40">
        ✓ That's my answer!
      </motion.button>
    </div>
  );
}

// targetCount = real answer, onVerified(answer) called when correct
export default function CountingVerify({ targetCount, onVerified }) {
  const [phase, setPhase] = useState('type'); // 'type' | 'wrong' | 'done'
  const [attempt, setAttempt] = useState(null);

  const handleSubmit = (val) => {
    setAttempt(val);
    if (val === targetCount) {
      setPhase('done');
      setTimeout(() => onVerified(val), 800);
    } else {
      setPhase('wrong');
    }
  };

  if (phase === 'done') {
    return (
      <div className="flex flex-col items-center gap-3 py-6">
        <div className="text-6xl">🎉</div>
        <p className="text-2xl font-black text-green-700">That's right! {targetCount}</p>
      </div>
    );
  }

  if (phase === 'wrong') {
    return (
      <div className="flex flex-col items-center gap-4 py-4">
        <div className="text-5xl">🤔</div>
        <p className="text-xl font-bold text-red-600">Hmm, try counting again!</p>
        <p className="text-gray-500 text-sm">You said <strong>{attempt}</strong> — go back and recount your collection.</p>
        <motion.button whileTap={{ scale: 0.95 }} onClick={() => setPhase('type')}
          className="bg-indigo-500 text-white font-bold px-6 py-3 rounded-2xl shadow">
          Try Again
        </motion.button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <p className="text-lg font-bold text-gray-700">How many did you count?</p>
      <DigitPad onSubmit={handleSubmit} />
    </div>
  );
}