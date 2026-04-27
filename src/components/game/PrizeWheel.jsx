import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Prize definitions
// weight: higher = more frequent. ring is one-time.
export const ALL_PRIZES = [
  { id: 'friend',  label: 'Sit with a Friend',  emoji: '👫', color: '#f9a8d4', weight: 3, oneTime: false },
  { id: 'cushion', label: 'Cushion for a Day',   emoji: '🪑', color: '#86efac', weight: 3, oneTime: false },
  { id: 'lollipop',label: 'Dum-Dum Lollipop',   emoji: '🍭', color: '#fde68a', weight: 4, oneTime: false },
  { id: 'sticker', label: 'Sticker Prize',       emoji: '🏷️', color: '#a5f3fc', weight: 5, oneTime: false },
  { id: 'ring',    label: 'Fidget Ring',         emoji: '💍', color: '#c4b5fd', weight: 3, oneTime: true  },
  { id: 'chips',   label: 'Bag of Chips',        emoji: '🍟', color: '#fed7aa', weight: 2, oneTime: false },
];

/** Build the weighted prize list, filtering out claimed one-time prizes */
export function buildPrizePool(redeemedPrizes = []) {
  const available = ALL_PRIZES.filter(p => !(p.oneTime && redeemedPrizes.includes(p.id)));
  const pool = [];
  available.forEach(p => { for (let i = 0; i < p.weight; i++) pool.push(p); });
  return available; // return unique prizes for the wheel segments
}

/** Pick a random prize from weighted pool */
export function pickPrize(redeemedPrizes = []) {
  const available = ALL_PRIZES.filter(p => !(p.oneTime && redeemedPrizes.includes(p.id)));
  if (available.length === 0) return ALL_PRIZES[3]; // fallback: sticker
  const pool = [];
  available.forEach(p => { for (let i = 0; i < p.weight; i++) pool.push(p); });
  return pool[Math.floor(Math.random() * pool.length)];
}

// Draw the wheel on a canvas
function drawWheel(canvas, prizes, rotationDeg) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const cx = size / 2, cy = size / 2, r = size / 2 - 4;
  const count = prizes.length;
  const arc = (2 * Math.PI) / count;

  ctx.clearRect(0, 0, size, size);

  prizes.forEach((prize, i) => {
    const start = (i / count) * 2 * Math.PI - Math.PI / 2 + (rotationDeg * Math.PI) / 180;
    const end = start + arc;

    // Slice
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, end);
    ctx.closePath();
    ctx.fillStyle = prize.color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Label
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(start + arc / 2);
    ctx.textAlign = 'right';
    ctx.font = `bold ${size * 0.045}px system-ui, sans-serif`;
    ctx.fillStyle = '#1f2937';
    ctx.fillText(prize.emoji + ' ' + prize.label, r - 10, 5);
    ctx.restore();
  });

  // Center circle
  ctx.beginPath();
  ctx.arc(cx, cy, 18, 0, 2 * Math.PI);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.strokeStyle = '#d1d5db';
  ctx.lineWidth = 2;
  ctx.stroke();
}

export default function PrizeWheel({ redeemedPrizes = [], onClaim, onClose }) {
  const prizes = buildPrizePool(redeemedPrizes);
  const canvasRef = useRef(null);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [winner, setWinner] = useState(null);
  const rotRef = useRef(0);
  const animRef = useRef(null);

  useEffect(() => {
    if (canvasRef.current) drawWheel(canvasRef.current, prizes, rotRef.current);
  }, []);

  const spin = () => {
    if (spinning || winner) return;
    setSpinning(true);

    // Pick the winner
    const prize = pickPrize(redeemedPrizes);
    const prizeIdx = prizes.findIndex(p => p.id === prize.id);

    // Calculate final angle so the pointer (top, 270°) lands on the prize segment
    const count = prizes.length;
    const segDeg = 360 / count;
    // Middle of prize segment in wheel's local space (before rotation):
    // prize starts at (prizeIdx / count)*360 - 90 (offset for our -π/2 start)
    // We want that mid-point to land at 0° (top pointer)
    const segMid = (prizeIdx / count) * 360 + segDeg / 2;
    // How much extra rotation to land it at top (270° = -90°):
    const extraSpins = 5 * 360;
    const targetRot = extraSpins + (360 - segMid) % 360;

    const startRot = rotRef.current;
    const endRot = startRot + targetRot;
    const duration = 4000;
    const startTime = performance.now();

    const easeOut = (t) => 1 - Math.pow(1 - t, 3);

    const animate = (now) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const current = startRot + targetRot * easeOut(t);
      rotRef.current = current;
      if (canvasRef.current) drawWheel(canvasRef.current, prizes, current);

      if (t < 1) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        setSpinning(false);
        setWinner(prize);
      }
    };
    animRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => () => cancelAnimationFrame(animRef.current), []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={e => { if (e.target === e.currentTarget && !spinning) onClose(); }}>
      <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.7, opacity: 0 }}
        className="bg-white rounded-3xl shadow-2xl p-6 flex flex-col items-center gap-4 mx-4 max-w-sm w-full">
        
        <h2 className="text-2xl font-black text-rose-600">🎡 Prize Wheel!</h2>
        <p className="text-sm text-gray-500 font-bold text-center">You earned a spin — tap to find out your prize!</p>

        {/* Wheel + pointer */}
        <div className="relative">
          {/* Pointer triangle at top */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 z-10"
            style={{ width: 0, height: 0, borderLeft: '10px solid transparent', borderRight: '10px solid transparent', borderTop: '22px solid #ef4444' }} />
          <canvas ref={canvasRef} width={280} height={280} className="rounded-full border-4 border-gray-200 shadow-lg" />
        </div>

        {!winner ? (
          <button onClick={spin} disabled={spinning}
            className={`w-full py-3 rounded-2xl font-black text-lg shadow-lg transition-all ${spinning ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-rose-500 text-white hover:bg-rose-600 active:scale-95'}`}>
            {spinning ? '🌀 Spinning…' : '🎯 SPIN!'}
          </button>
        ) : (
          <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="w-full flex flex-col items-center gap-3">
            <div className="text-7xl">{winner.emoji}</div>
            <p className="text-2xl font-black text-gray-800">{winner.label}</p>
            {winner.oneTime && <p className="text-xs text-purple-600 font-bold bg-purple-50 rounded-full px-3 py-1">✨ One-time prize — claimed forever!</p>}
            <button onClick={() => onClaim(winner)}
              className="w-full py-3 rounded-2xl bg-green-500 text-white font-black text-lg shadow-lg hover:bg-green-600 active:scale-95">
              🎉 Claim Prize!
            </button>
          </motion.div>
        )}

        {!winner && !spinning && (
          <button onClick={onClose} className="text-xs text-gray-400 font-bold hover:text-gray-600">Skip for now</button>
        )}
      </motion.div>
    </div>
  );
}