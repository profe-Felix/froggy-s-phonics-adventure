import { useState, useRef } from 'react';
import { motion } from 'framer-motion';

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
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const startDrawing = (e) => {
    if (disabled) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing || disabled) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1f2937';
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-bold text-gray-500 text-center uppercase">Write the number {targetNumber}</p>
      <canvas
        ref={canvasRef}
        width={280}
        height={140}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        style={{ touchAction: 'none', cursor: disabled ? 'default' : 'crosshair' }}
        className="border-4 border-dashed border-amber-300 bg-white rounded-xl"
      />
      <button onClick={clearCanvas} disabled={disabled}
        className="bg-amber-400 text-amber-900 font-black py-2 rounded-lg disabled:opacity-50">
        🗑 Clear
      </button>
      <motion.button whileTap={{ scale: 0.95 }} onClick={onComplete} disabled={disabled}
        className="bg-indigo-600 text-white font-black py-3 rounded-lg disabled:opacity-50">
        ✓ Continue
      </motion.button>
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