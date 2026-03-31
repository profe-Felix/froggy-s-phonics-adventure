import React, { useState, useEffect, useRef } from 'react';

const ITEMS = ['1 More', '1 Less', '1 More', '1 Less', '1 More', '1 Less', '1 More', '1 Less'];
const ITEM_H = 72; // px height of each item in the reel

export default function OneLessMoreSpinner({ onResult }) {
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);
  const [offset, setOffset] = useState(0);
  const animRef = useRef(null);
  const startTimeRef = useRef(null);
  const startOffsetRef = useRef(0);
  const targetOffsetRef = useRef(0);
  const durationRef = useRef(2800);

  const spin = () => {
    if (spinning || result) return;

    // Pick a random result
    const spinResult = Math.random() < 0.5 ? 'more' : 'less';
    // Target index: scroll enough loops then land on the result
    const loops = 4 + Math.floor(Math.random() * 3);
    const resultIndex = spinResult === 'more' ? 0 : 1; // More=0, Less=1 in ITEMS
    const totalItems = loops * ITEMS.length + resultIndex;
    const target = startOffsetRef.current + totalItems * ITEM_H;

    targetOffsetRef.current = target;
    startOffsetRef.current = offset;
    startTimeRef.current = null;
    durationRef.current = 2600 + Math.random() * 400;

    setSpinning(true);

    const easeOut = (t) => 1 - Math.pow(1 - t, 3);

    const animate = (ts) => {
      if (!startTimeRef.current) startTimeRef.current = ts;
      const elapsed = ts - startTimeRef.current;
      const progress = Math.min(elapsed / durationRef.current, 1);
      const easedProgress = easeOut(progress);
      const currentOffset = startOffsetRef.current + (targetOffsetRef.current - startOffsetRef.current) * easedProgress;
      setOffset(currentOffset);

      if (progress < 1) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        setOffset(targetOffsetRef.current);
        startOffsetRef.current = targetOffsetRef.current;
        setSpinning(false);
        setResult(spinResult);
        onResult(spinResult);
      }
    };

    animRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => () => cancelAnimationFrame(animRef.current), []);

  // Which items are visible in the window (show 3 at a time, center is active)
  const windowH = ITEM_H * 3;
  // The reel translates by -offset, modulo the full reel height
  const reelH = ITEMS.length * ITEM_H;
  const translateY = -(offset % reelH);

  // Build a long enough reel by repeating items
  const reelItems = [...ITEMS, ...ITEMS, ...ITEMS];

  return (
    <div className="flex flex-col items-center gap-5">
      {/* Slot window */}
      <div
        style={{
          width: 180,
          height: windowH,
          overflow: 'hidden',
          position: 'relative',
          borderRadius: 16,
          border: '3px solid #1e293b',
          background: '#f8fafc',
          boxShadow: 'inset 0 4px 12px rgba(0,0,0,0.12)',
        }}
      >
        {/* Highlight bar for center item */}
        <div style={{
          position: 'absolute',
          top: ITEM_H,
          left: 0,
          right: 0,
          height: ITEM_H,
          background: 'rgba(99,102,241,0.10)',
          borderTop: '2px solid #6366f1',
          borderBottom: '2px solid #6366f1',
          pointerEvents: 'none',
          zIndex: 2,
        }} />

        {/* Fade top/bottom */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 3, pointerEvents: 'none',
          background: 'linear-gradient(to bottom, rgba(248,250,252,0.85) 0%, transparent 30%, transparent 70%, rgba(248,250,252,0.85) 100%)'
        }} />

        {/* Reel */}
        <div style={{
          transform: `translateY(${translateY}px)`,
          willChange: 'transform',
        }}>
          {reelItems.map((label, i) => (
            <div key={i} style={{
              height: ITEM_H,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              fontWeight: 800,
              color: '#1e293b',
              letterSpacing: '-0.5px',
            }}>
              {label}
            </div>
          ))}
        </div>
      </div>

      {!result && !spinning && (
        <button
          onClick={spin}
          className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-xl text-lg hover:bg-indigo-700 active:scale-95 transition-all shadow-lg"
        >
          🌀 Spin!
        </button>
      )}
      {spinning && <p className="text-lg font-bold text-indigo-600 animate-pulse">Spinning…</p>}
      {result && (
        <div className="text-2xl font-bold px-6 py-3 rounded-xl shadow bg-gray-100 text-gray-700">
          {result === 'more' ? '1 More' : '1 Less'}
        </div>
      )}
    </div>
  );
}