import React, { useState } from 'react';

// Static wheel — arrow needle spins around center
export default function OneLessMoreSpinner({ onResult }) {
  const [spinning, setSpinning] = useState(false);
  const [arrowAngle, setArrowAngle] = useState(0);
  const [result, setResult] = useState(null);

  const spin = () => {
    if (spinning || result) return;
    const extraDeg = Math.floor(Math.random() * 360);
    const totalSpin = 360 * (4 + Math.floor(Math.random() * 3)) + extraDeg;
    const newAngle = arrowAngle + totalSpin;

    // Arrow at 0° points UP. Going clockwise:
    // 0°–90° = upper-right = TR = Less
    // 90°–180° = lower-right = BR = More
    // 180°–270° = lower-left = BL = Less
    // 270°–360° = upper-left = TL = More
    const finalAngle = ((newAngle % 360) + 360) % 360;
    const inMore = (finalAngle >= 90 && finalAngle < 180) || (finalAngle >= 270);
    const spinResult = inMore ? 'more' : 'less';

    setArrowAngle(newAngle);
    setSpinning(true);

    setTimeout(() => {
      setSpinning(false);
      setResult(spinResult);
      onResult(spinResult);
    }, 2800);
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative" style={{ width: 220, height: 220 }}>
        {/* Static wheel */}
        <svg width="220" height="220" viewBox="0 0 220 220" style={{ position: 'absolute', top: 0, left: 0 }}>
          {/* Sectors */}
          <path d="M110,110 L110,0 A110,110 0 0,0 0,110 Z" fill="#dbeafe"/>
          <path d="M110,110 L220,110 A110,110 0 0,0 110,0 Z" fill="#fce7f3"/>
          <path d="M110,110 L110,220 A110,110 0 0,0 220,110 Z" fill="#dbeafe"/>
          <path d="M110,110 L0,110 A110,110 0 0,0 110,220 Z" fill="#fce7f3"/>
          {/* Dividers */}
          <line x1="110" y1="0" x2="110" y2="220" stroke="#1e293b" strokeWidth="2.5"/>
          <line x1="0" y1="110" x2="220" y2="110" stroke="#1e293b" strokeWidth="2.5"/>
          {/* Outer ring */}
          <circle cx="110" cy="110" r="109" fill="none" stroke="#1e293b" strokeWidth="2"/>
          {/* Labels */}
          <text x="55" y="72" textAnchor="middle" fontSize="15" fontWeight="bold" fill="#1e40af">1 More</text>
          <text x="165" y="72" textAnchor="middle" fontSize="15" fontWeight="bold" fill="#9d174d">1 Less</text>
          <text x="165" y="158" textAnchor="middle" fontSize="15" fontWeight="bold" fill="#1e40af">1 More</text>
          <text x="55" y="158" textAnchor="middle" fontSize="15" fontWeight="bold" fill="#9d174d">1 Less</text>
        </svg>

        {/* Spinning arrow */}
        <svg
          width="220" height="220" viewBox="0 0 220 220"
          style={{
            position: 'absolute', top: 0, left: 0,
            transform: `rotate(${arrowAngle}deg)`,
            transformOrigin: '110px 110px',
            transition: spinning ? 'transform 2.8s cubic-bezier(0.15, 0.85, 0.3, 1)' : 'none',
          }}
        >
          {/* Arrow pointing up from center */}
          <polygon points="110,18 103,65 117,65" fill="#dc2626" stroke="#7f1d1d" strokeWidth="1.5"/>
          <rect x="106" y="60" width="8" height="60" rx="4" fill="#dc2626" stroke="#7f1d1d" strokeWidth="1"/>
          {/* Center cap */}
          <circle cx="110" cy="110" r="10" fill="#1e293b"/>
          <circle cx="110" cy="110" r="5" fill="#ffffff"/>
        </svg>
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
          1 {result === 'more' ? 'More' : 'Less'}
        </div>
      )}
    </div>
  );
}