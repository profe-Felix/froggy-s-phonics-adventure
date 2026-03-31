import React, { useState, useRef } from 'react';

// Spinner with 4 quadrants: 1 More (top-left, bottom-right), 1 Less (top-right, bottom-left)
// Returns result via onResult('more' | 'less')
export default function OneLessMoreSpinner({ onResult }) {
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState(null);
  const startRotRef = useRef(0);

  const spin = () => {
    if (spinning || result) return;
    // Random total rotation: 3-6 full spins + random landing
    const extraDeg = Math.floor(Math.random() * 360);
    const totalSpin = 360 * (3 + Math.floor(Math.random() * 3)) + extraDeg;
    const newRotation = rotation + totalSpin;
    setSpinning(true);
    startRotRef.current = newRotation;

    // The pointer is at the top (270 degrees offset). 
    // Quadrants: 0-90 = top-right = "1 Less", 90-180 = bottom-right = "1 More"
    //            180-270 = bottom-left = "1 Less", 270-360 = top-left = "1 More"
    // So "more" sectors are 90-180 and 270-360 (i.e., landing angle mod 360 in [90,180] or [270,360])
    const landingAngle = ((newRotation % 360) + 360) % 360;
    const spinResult = (landingAngle < 90 || (landingAngle >= 180 && landingAngle < 270)) ? 'less' : 'more';

    setRotation(newRotation);

    setTimeout(() => {
      setSpinning(false);
      setResult(spinResult);
      onResult(spinResult);
    }, 2500);
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative" style={{ width: 200, height: 200 }}>
        {/* Pointer triangle at top */}
        <div className="absolute left-1/2 -top-3 z-10" style={{ transform: 'translateX(-50%)' }}>
          <div style={{
            width: 0, height: 0,
            borderLeft: '10px solid transparent',
            borderRight: '10px solid transparent',
            borderTop: '20px solid #dc2626'
          }} />
        </div>

        {/* Spinning wheel */}
        <div
          style={{
            width: 200, height: 200, borderRadius: '50%',
            border: '3px solid #1e293b',
            transform: `rotate(${rotation}deg)`,
            transition: spinning ? 'transform 2.5s cubic-bezier(0.2, 0.8, 0.4, 1)' : 'none',
            overflow: 'hidden',
            cursor: result ? 'default' : 'pointer',
            position: 'relative'
          }}
          onClick={spin}
        >
          {/* SVG quadrants */}
          <svg width="200" height="200" viewBox="0 0 200 200">
            {/* Top-left quadrant: 1 More */}
            <path d="M100,100 L100,0 A100,100 0 0,0 0,100 Z" fill="#dbeafe" stroke="#1e293b" strokeWidth="1.5"/>
            {/* Top-right quadrant: 1 Less */}
            <path d="M100,100 L200,100 A100,100 0 0,0 100,0 Z" fill="#fce7f3" stroke="#1e293b" strokeWidth="1.5"/>
            {/* Bottom-right quadrant: 1 More */}
            <path d="M100,100 L100,200 A100,100 0 0,0 200,100 Z" fill="#dbeafe" stroke="#1e293b" strokeWidth="1.5"/>
            {/* Bottom-left quadrant: 1 Less */}
            <path d="M100,100 L0,100 A100,100 0 0,0 100,200 Z" fill="#fce7f3" stroke="#1e293b" strokeWidth="1.5"/>
            {/* Center lines */}
            <line x1="100" y1="0" x2="100" y2="200" stroke="#1e293b" strokeWidth="2"/>
            <line x1="0" y1="100" x2="200" y2="100" stroke="#1e293b" strokeWidth="2"/>
            {/* Labels */}
            <text x="50" y="65" textAnchor="middle" fontSize="14" fontWeight="bold" fill="#1e40af">1</text>
            <text x="50" y="83" textAnchor="middle" fontSize="14" fontWeight="bold" fill="#1e40af">More</text>
            <text x="150" y="65" textAnchor="middle" fontSize="14" fontWeight="bold" fill="#9d174d">1</text>
            <text x="150" y="83" textAnchor="middle" fontSize="14" fontWeight="bold" fill="#9d174d">Less</text>
            <text x="150" y="135" textAnchor="middle" fontSize="14" fontWeight="bold" fill="#1e40af">1</text>
            <text x="150" y="153" textAnchor="middle" fontSize="14" fontWeight="bold" fill="#1e40af">More</text>
            <text x="50" y="135" textAnchor="middle" fontSize="14" fontWeight="bold" fill="#9d174d">1</text>
            <text x="50" y="153" textAnchor="middle" fontSize="14" fontWeight="bold" fill="#9d174d">Less</text>
            {/* Center dot */}
            <circle cx="100" cy="100" r="8" fill="#1e293b"/>
          </svg>
        </div>
      </div>

      {!result && !spinning && (
        <button
          onClick={spin}
          className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl text-lg hover:bg-indigo-700 active:scale-95 transition-all"
        >
          🌀 Spin!
        </button>
      )}
      {spinning && <p className="text-lg font-bold text-indigo-600 animate-pulse">Spinning…</p>}
      {result && (
        <div className={`text-2xl font-bold px-6 py-3 rounded-xl ${result === 'more' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}`}>
          1 {result === 'more' ? 'More ➕' : 'Less ➖'}
        </div>
      )}
    </div>
  );
}