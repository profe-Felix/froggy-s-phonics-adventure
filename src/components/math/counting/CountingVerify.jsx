import { useState } from 'react';
import { motion } from 'framer-motion';
import SimpleWritingCanvas from '../SimpleWritingCanvas';

function DigitPad({ onSubmit }) {
  const [val, setVal] = useState('');
  const press = (d) => { if (val.length < 2) setVal(v => v + d); };
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="w-16 h-10 border-4 border-indigo-400 rounded-xl flex items-center justify-center text-2xl font-black text-indigo-700 bg-white shadow-inner">
        {val || <span className="text-gray-300">?</span>}
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {[1,2,3,4,5,6,7,8,9].map(d => (
          <button key={d} onClick={() => press(String(d))}
            className="w-10 h-10 bg-white border-2 border-indigo-200 rounded-lg font-black text-base text-indigo-700 hover:bg-indigo-50 shadow">
            {d}
          </button>
        ))}
        <button onClick={() => setVal('')} className="w-10 h-10 bg-red-100 border-2 border-red-200 rounded-lg font-bold text-red-600 hover:bg-red-200 shadow text-sm">✕</button>
        <button onClick={() => press('0')} className="w-10 h-10 bg-white border-2 border-indigo-200 rounded-lg font-black text-base text-indigo-700 hover:bg-indigo-50 shadow">0</button>
        <button onClick={() => setVal(v => v.slice(0, -1))} className="w-10 h-10 bg-gray-100 border-2 border-gray-200 rounded-lg font-bold text-gray-600 hover:bg-gray-200 shadow text-sm">⌫</button>
      </div>
      <motion.button whileTap={{ scale: 0.95 }} onClick={() => val && onSubmit(parseInt(val))}
        disabled={!val}
        className="bg-indigo-600 text-white font-black text-base px-6 py-2 rounded-2xl shadow-lg disabled:opacity-40">
        ✓ That's my answer!
      </motion.button>
    </div>
  );
}

// targetCount = real answer, onVerified(answer) called when correct, onGoBack called when wrong
export default function CountingVerify({ targetCount, onVerified, onGoBack }) {
  const [phase, setPhase] = useState('type');
  const [attempt, setAttempt] = useState(null);
  const [isFirstTry, setIsFirstTry] = useState(true);

  const handleSubmit = (val) => {
    setAttempt(val);
    if (val === targetCount) {
      setPhase('done');
      setTimeout(() => onVerified(isFirstTry), 800);
    } else {
      setIsFirstTry(false);
      setPhase('wrong');
    }
  };

  if (phase === 'done') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-4">
        <div className="text-5xl">🎉</div>
        <p className="text-xl font-black text-green-700">That's right! {targetCount}</p>
      </div>
    );
  }

  if (phase === 'wrong') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-4">
        <div className="text-4xl">🤔</div>
        <p className="text-base font-bold text-red-600">Try again!</p>
        <p className="text-gray-500 text-sm text-center">You said <strong>{attempt}</strong> — look at the collection and recount.</p>
        <motion.button whileTap={{ scale: 0.95 }} onClick={() => { setPhase('type'); setIsFirstTry(false); if (onGoBack) onGoBack(); }}
          className="bg-indigo-500 text-white font-bold px-5 py-2.5 rounded-2xl shadow">
          ← Recount
        </motion.button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-4 h-full items-center">
      <p className="text-sm font-bold text-gray-500 uppercase tracking-wide text-center">Write &amp; Enter your count</p>
      <SimpleWritingCanvas onDone={() => {}} />
      <p className="text-sm font-bold text-gray-700">How many?</p>
      <DigitPad onSubmit={handleSubmit} />
    </div>
  );
}