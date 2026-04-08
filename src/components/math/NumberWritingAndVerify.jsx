import { useState } from 'react';
import { motion } from 'framer-motion';
import SimpleWritingCanvas from './SimpleWritingCanvas';

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function DigitPad({ onComplete, disabled }) {
  const [built, setBuilt] = useState('');
  const [done, setDone] = useState(false);
  
  const handleDigit = (d) => { if (!done && built.length < 2) setBuilt(b => b + String(d)); };
  const handleUndo = () => { if (!done) setBuilt(b => b.slice(0, -1)); };
  const handleSubmit = () => { if (!built || done) return; setDone(true); onComplete(parseInt(built)); };
  
  return (
    <div className="flex flex-col items-center gap-2 w-full">
      <div className={`w-16 h-16 rounded-2xl border-4 flex items-center justify-center text-3xl font-bold
        ${done ? 'border-green-400 bg-green-50 text-green-700' : built ? 'border-sky-400 bg-white text-sky-700' : 'border-dashed border-sky-300 bg-sky-50 text-sky-200'}`}>
        {built || '?'}
      </div>
      <div className="grid grid-cols-5 gap-1.5 w-full">
        {DIGITS.map(d => (
          <motion.button key={d} whileTap={{ scale: 0.85 }}
            onClick={() => handleDigit(d)}
            disabled={done || built.length >= 2}
            className="h-10 rounded-xl bg-white shadow text-lg font-bold text-indigo-700 border-2 border-indigo-200 disabled:opacity-40">
            {d}
          </motion.button>
        ))}
      </div>
      <div className="flex gap-2 w-full">
        <button onClick={handleUndo} disabled={done || !built}
          className="flex-1 py-2 rounded-xl bg-gray-100 text-gray-600 font-bold disabled:opacity-30">⌫</button>
        <button onClick={handleSubmit} disabled={done || !built}
          className="flex-1 py-2 rounded-xl bg-indigo-600 text-white font-bold disabled:opacity-30">✓</button>
      </div>
    </div>
  );
}

function WriteNumberCanvas({ targetNumber, onComplete, disabled }) {
  const handleCanvasDone = (strokes, dataUrl) => {
    onComplete(strokes, dataUrl);
  };

  return (
    <div className="flex flex-col gap-3 items-center">
      <p className="text-xs font-bold text-gray-500 text-center uppercase">Write the number {targetNumber}</p>
      <SimpleWritingCanvas onDone={handleCanvasDone} />
    </div>
  );
}

export default function NumberWritingAndVerify({ targetNumber, onComplete, disabled }) {
  const [step, setStep] = useState('write');
  const [drawnUrl, setDrawnUrl] = useState(null);

  const handleWriteComplete = (strokes, dataUrl) => {
    setDrawnUrl(dataUrl);
    setStep('type');
  };

  const handleTypeComplete = (typedNumber) => {
    if (typedNumber === targetNumber) {
      onComplete();
    } else {
      setStep('write');
      setDrawnUrl(null);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3">
      {step === 'write' && (
        <WriteNumberCanvas targetNumber={targetNumber} onComplete={handleWriteComplete} disabled={disabled} />
      )}
      {step === 'type' && (
        <>
          {drawnUrl && (
            <div className="flex flex-col items-center gap-1">
              <p className="text-xs font-bold text-gray-400 uppercase">You wrote:</p>
              <img src={drawnUrl} alt="written number"
                className="rounded-xl border-2 border-indigo-200"
                style={{ width: 180, height: 120, objectFit: 'contain', background: '#f8fbff' }} />
            </div>
          )}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-bold text-gray-400 uppercase text-center">Type the number you built</p>
            <DigitPad onComplete={handleTypeComplete} disabled={disabled} />
          </div>
        </>
      )}
    </motion.div>
  );
}