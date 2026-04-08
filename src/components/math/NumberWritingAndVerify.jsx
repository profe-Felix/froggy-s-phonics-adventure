import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import SimpleWritingCanvas from './SimpleWritingCanvas';

function DigitPad({ onComplete, disabled }) {
  const [digits, setDigits] = useState('');

  const handleDigit = (d) => {
    if (digits.length < 2) setDigits(digits + d);
  };

  const handleBackspace = () => {
    setDigits(digits.slice(0, -1));
  };

  const handleSubmit = () => {
    if (digits) onComplete(parseInt(digits));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-gray-100 rounded-xl p-4 text-center text-3xl font-black text-gray-800 min-h-[60px] flex items-center justify-center">
        {digits || '?'}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => (
          <button key={d}
            onClick={() => handleDigit(d)}
            disabled={disabled || digits.length >= 2}
            className="bg-indigo-600 text-white font-black text-xl py-3 rounded-lg disabled:opacity-50">
            {d}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={handleBackspace} disabled={disabled || !digits}
          className="flex-1 bg-red-400 text-white font-black py-2 rounded-lg disabled:opacity-50">
          ← Back
        </button>
        <button onClick={handleSubmit} disabled={disabled || !digits}
          className="flex-1 bg-green-600 text-white font-black py-2 rounded-lg disabled:opacity-50">
          ✓ OK
        </button>
      </div>
    </div>
  );
}

function WriteNumberCanvas({ targetNumber, onComplete, disabled }) {
  const handleCanvasDone = () => {
    onComplete();
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

  const handleWriteComplete = () => {
    setStep('type');
  };

  const handleTypeComplete = (typedNumber) => {
    if (typedNumber === targetNumber) {
      onComplete();
    } else {
      // Reset and let them try again
      setStep('write');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-3xl p-5 shadow-xl"
    >
      {step === 'write' && (
        <WriteNumberCanvas targetNumber={targetNumber} onComplete={handleWriteComplete} disabled={disabled} />
      )}
      {step === 'type' && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-bold text-gray-400 uppercase text-center">Type the number you built</p>
          <DigitPad onComplete={handleTypeComplete} disabled={disabled} />
        </div>
      )}
    </motion.div>
  );
}