import React, { useState, useEffect, useRef } from 'react';

const ITEMS = ['1 More', '1 Less', '1 More', '1 Less', '1 More', '1 Less', '1 More', '1 Less'];
const ITEM_H = 72;

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

    const spinResult = Math.random() < 0.5 ? 'more' : 'less';
    const loops = 4 + Math.floor(Math.random() * 3);
    const resultIndex = spinResult === 'more' ? 0 : 1;
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
      const currentOffset = startOffsetRef.current + (targetOffsetRef.current - startOffsetRef.current) * easeOut(progress);
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

  const reelH = ITEMS.length * ITEM_H;
  const translateY = -(offset % reelH);
  const reelItems = [...ITEMS, ...ITEMS, ...ITEMS];

  return (
    <div className="flex flex-col items-center gap-5">
      {/* Single-item slot window */}
      <div style={{
        width: 200,
        height: ITEM_H,
        overflow: 'hidden',
        position: 'relative',
        borderRadius: 16,
        border: '3px solid #6366f1',
        background: 'rgba(99,102,241,0.08)',
        boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.08)',
      }}>
        <div style={{ transform: `translateY(${translateY}px)`, willChange: 'transform' }}>
          {reelItems.map((label, i) => (
            <div key={i} style={{
              height: ITEM_H,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
              fontWeight: 800,
              color: '#1e293b',
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
    </div>
  );
}